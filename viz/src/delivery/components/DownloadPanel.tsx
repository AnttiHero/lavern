/**
 * DownloadPanel — Download buttons for deliverable in multiple formats.
 *
 * v16: Added document style selector (Traditional / Elegant / Accessible).
 * Style is appended to the download URL as &style=X for DOCX and PDF.
 */

import { useState } from 'react';
import type { DeliveryData } from '../hooks/useDeliveryData.js';
import type { AssemblyStatus } from '../hooks/useDeliveryData.js';
import { getCoworkState, setCoworkStatus } from '../../cowork/coworkStore.js';
import { colors, fonts, radii, spacing } from '../../staffing/styles/tokens.js';

interface Props {
  data: DeliveryData;
  assemblyStatus: AssemblyStatus;
  onRetry?: () => void;
}

type DocStyle = 'traditional' | 'elegant' | 'accessible';

const STYLE_OPTIONS: { id: DocStyle; label: string; desc: string }[] = [
  { id: 'traditional', label: 'Traditional', desc: 'Classic law-firm' },
  { id: 'elegant', label: 'Elegant', desc: 'Warm editorial' },
  { id: 'accessible', label: 'Accessible', desc: 'WCAG AA' },
];

function triggerBlobDownload(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function generateClientSummary(data: DeliveryData): string {
  const lines: string[] = [];
  lines.push(`# ${data.documentTitle}`, '');
  lines.push(`**Date:** ${new Date().toLocaleDateString()}`, '');
  lines.push('## Executive Summary', '', data.executiveSummary, '');

  if (data.keyChanges.length > 0) {
    lines.push('## Key Changes', '');
    for (const c of data.keyChanges) {
      lines.push(`### ${c.title}`, '', `**Before:** ${c.before}`, '', `**After:** ${c.after}`, '');
    }
  }

  if (data.debateResolutions.length > 0) {
    lines.push('## Review Outcomes', '');
    for (const r of data.debateResolutions) {
      lines.push(`- **${r.topic}:** ${r.resolution}`);
    }
    lines.push('');
  }

  if (data.nextSteps.length > 0) {
    lines.push('## Recommended Next Steps', '');
    for (const s of data.nextSteps) {
      lines.push(`- **${s.label}:** ${s.description}`);
    }
    lines.push('');
  }

  lines.push('---', '', '*This summary was generated from AI-assisted analysis. Independent counsel verification is recommended for legally binding matters.*', '');
  return lines.join('\n');
}

export function DownloadPanel({ data, assemblyStatus, onRetry }: Props) {
  const isDemo = data.sessionId.startsWith('demo-session');
  const [selectedStyle, setSelectedStyle] = useState<DocStyle>('elegant');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'writing' | 'done' | 'error'>('idle');

  // Assembly status drives download availability
  const deliverableValid = assemblyStatus === 'ready';

  // Check if cowork folder is available for write-back
  const coworkActive = sessionStorage.getItem('shem-cowork-active') === 'true';
  const coworkState = coworkActive ? getCoworkState() : null;
  const canSaveToFolder = coworkActive && coworkState?.handle != null && coworkState.status !== 'disconnected';

  const handleSaveToFolder = async () => {
    if (!canSaveToFolder || !coworkState?.handle) return;
    setSaveStatus('writing');
    try {
      const handle = coworkState.handle;

      // Helper to write a text file
      const writeText = async (filename: string, content: string) => {
        const fh = await handle.getFileHandle(filename, { create: true });
        const w = await fh.createWritable();
        await w.write(new Blob([content], { type: 'text/plain' }));
        await w.close();
      };

      // Helper to write a binary blob
      const writeBlob = async (filename: string, blob: Blob) => {
        const fh = await handle.getFileHandle(filename, { create: true });
        const w = await fh.createWritable();
        await w.write(blob);
        await w.close();
      };

      // 1. Deliverable markdown — write failure notice if assembly failed
      if (data.finalOutput && data.finalOutput.length > 100) {
        await writeText(`${data.sessionId}-deliverable.md`, data.finalOutput);
      } else {
        // v19: Write a clear failure notice instead of nothing or garbage
        const failureNotice = [
          '# Assembly Failed',
          '',
          'The agents completed their analysis but document assembly failed.',
          '',
          'What happened: The multi-agent pipeline ran successfully, but the final assembly step',
          'could not produce a valid document from the analysis results.',
          '',
          '## What you can do',
          '',
          '- **Retry assembly** from the Delivery page in the dashboard',
          '- **Download structured data** (JSON) which contains all findings and debate resolutions',
          '- **Start a new session** with the same document',
          '',
          `Session ID: ${data.sessionId}`,
          `Date: ${new Date().toISOString()}`,
        ].join('\n');
        await writeText(`${data.sessionId}-deliverable.md`, failureNotice);
      }

      // 2. Executive summary — only write if deliverable was valid
      // v19: Don't write a summary skeleton that could be mistaken for the deliverable
      if (data.finalOutput && data.finalOutput.length > 100) {
        const summary = generateClientSummary(data);
        await writeText(`${data.sessionId}-summary.md`, summary);
      }

      // 3. Structured data (findings, debates)
      const jsonData = {
        sessionId: data.sessionId,
        exportedAt: new Date().toISOString(),
        debate: { findingsCount: data.debate.findingsCount, resolutions: data.debateResolutions },
        verification: data.verificationChecks,
        cost: data.cost,
      };
      await writeText(`${data.sessionId}-data.json`, JSON.stringify(jsonData, null, 2));

      // 4. DOCX and PDF — fetch from API (live sessions only)
      if (!isDemo) {
        const styleParam = `&style=${selectedStyle}`;
        const formats: { ext: string; mime: string }[] = [
          { ext: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
          { ext: 'pdf', mime: 'application/pdf' },
        ];

        const fetches = formats.map(async ({ ext }) => {
          try {
            const resp = await fetch(`/api/sessions/${data.sessionId}/download?format=${ext}${styleParam}`);
            if (resp.ok) {
              const blob = await resp.blob();
              await writeBlob(`${data.sessionId}-deliverable.${ext}`, blob);
            }
          } catch {
            // Non-fatal — text files are already saved
            console.warn(`[cowork] Could not fetch ${ext} for folder save`);
          }
        });
        await Promise.all(fetches);
      }

      setCoworkStatus('delivered');
      setSaveStatus('done');
    } catch (err) {
      console.error('[cowork] Failed to save to folder:', err);
      setSaveStatus('error');
    }
  };

  const handleDownload = (format: 'docx' | 'pdf' | 'md' | 'json' | 'summary') => {
    if (isDemo) {
      if (format === 'md' || format === 'docx' || format === 'pdf') {
        triggerBlobDownload(data.finalOutput || '# No output yet', `${data.sessionId}-workproduct.md`, 'text/markdown');
      } else if (format === 'json') {
        const jsonData = {
          sessionId: data.sessionId,
          exportedAt: new Date().toISOString(),
          debate: { findingsCount: data.debate.findingsCount, resolutions: data.debateResolutions },
          verification: data.verificationChecks,
          cost: data.cost,
        };
        triggerBlobDownload(JSON.stringify(jsonData, null, 2), `${data.sessionId}-data.json`, 'application/json');
      } else if (format === 'summary') {
        const summary = generateClientSummary(data);
        triggerBlobDownload(summary, `${data.sessionId}-summary.md`, 'text/markdown');
      }
    } else {
      // Append style for formatted outputs (docx/pdf)
      const styleParam = (format === 'docx' || format === 'pdf') ? `&style=${selectedStyle}` : '';
      window.open(`/api/sessions/${data.sessionId}/download?format=${format}${styleParam}`, '_blank');
    }
  };

  return (
    <div style={styles.panel}>
      <div style={styles.panelHeader}>
        <div style={styles.panelTitle}>Download Deliverable</div>
      </div>

      {/* Save to folder — shown when cowork folder is connected */}
      {canSaveToFolder && (
        <button
          onClick={handleSaveToFolder}
          disabled={saveStatus === 'writing' || saveStatus === 'done'}
          style={{
            ...styles.saveToFolderBtn,
            ...(saveStatus === 'done' ? styles.saveToFolderDone : {}),
            ...(saveStatus === 'error' ? styles.saveToFolderError : {}),
          }}
          onMouseEnter={e => { if (saveStatus === 'idle') e.currentTarget.style.backgroundColor = colors.accentLight; }}
          onMouseLeave={e => { if (saveStatus === 'idle') e.currentTarget.style.backgroundColor = colors.bgCard; }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ flexShrink: 0 }}>
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          <span>
            {saveStatus === 'idle' && `Save all formats to ${coworkState?.folderName ?? 'folder'}`}
            {saveStatus === 'writing' && 'Writing files\u2026'}
            {saveStatus === 'done' && `All files saved to ${coworkState?.folderName ?? 'folder'}`}
            {saveStatus === 'error' && 'Save failed \u2014 use downloads below'}
          </span>
        </button>
      )}

      {/* Style selector */}
      <div style={styles.styleSection}>
        <div style={styles.styleLabel}>Document Style</div>
        <div style={styles.stylePills}>
          {STYLE_OPTIONS.map(opt => {
            const isActive = selectedStyle === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => setSelectedStyle(opt.id)}
                style={{
                  ...styles.pill,
                  ...(isActive ? styles.pillActive : {}),
                }}
              >
                <span style={styles.pillName}>{opt.label}</span>
                <span style={{
                  ...styles.pillDesc,
                  color: isActive ? 'rgba(255,255,255,0.7)' : colors.textMuted,
                }}>{opt.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Assembly status messages */}
      {assemblyStatus === 'polling' && !isDemo && (
        <div style={styles.assemblyPolling}>
          <span style={styles.spinner} />
          Assembling document — this usually takes 30–60 seconds. The page will update automatically.
        </div>
      )}
      {assemblyStatus === 'timeout' && !isDemo && (
        <div style={styles.assemblyError}>
          Document assembly timed out. Structured data and executive brief are still available.
          {onRetry && (
            <button onClick={onRetry} style={styles.retryBtn}>
              Retry Assembly
            </button>
          )}
        </div>
      )}
      {assemblyStatus === 'error' && !isDemo && (
        <div style={styles.assemblyError}>
          Document assembly failed. Try again or download structured data below.
          {onRetry && (
            <button onClick={onRetry} style={styles.retryBtn}>
              Retry Assembly
            </button>
          )}
        </div>
      )}

      {/* Primary row: DOCX and PDF */}
      <div style={styles.primaryRow}>
        <DownloadCard
          icon={'\uD83D\uDCC4'}
          title="Word Document"
          description={!deliverableValid && !isDemo ? 'Not yet available' : 'Professional .docx format'}
          format=".docx"
          primary
          onClick={() => handleDownload('docx')}
          disabled={isDemo || !deliverableValid}
        />
        <DownloadCard
          icon={'\uD83D\uDCC3'}
          title="PDF"
          description={!deliverableValid && !isDemo ? 'Not yet available' : 'Print-ready document'}
          format=".pdf"
          primary
          onClick={() => handleDownload('pdf')}
          disabled={isDemo || !deliverableValid}
        />
      </div>

      {/* Secondary row: Other formats */}
      <div style={styles.secondaryRow}>
        <DownloadCard
          icon={'#'}
          title="Markdown"
          description={!deliverableValid && !isDemo ? 'Not yet available' : 'Raw markdown source'}
          format=".md"
          onClick={() => handleDownload('md')}
          disabled={!deliverableValid && !isDemo}
        />
        <DownloadCard
          icon={'{ }'}
          title="Structured Data"
          description="Findings & debates"
          format=".json"
          onClick={() => handleDownload('json')}
        />
        <DownloadCard
          icon={'\u2139\uFE0F'}
          title="Executive Brief"
          description={!deliverableValid && !isDemo ? 'Not yet available' : 'One-page summary'}
          format=".md"
          onClick={() => handleDownload('summary')}
          disabled={!deliverableValid && !isDemo}
        />
      </div>
    </div>
  );
}

function DownloadCard({ icon, title, description, format, primary, disabled, onClick }: {
  icon: string;
  title: string;
  description: string;
  format: string;
  primary?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...styles.card,
        ...(primary ? styles.cardPrimary : {}),
        ...(disabled ? styles.cardDisabled : {}),
      }}
      onMouseEnter={e => { if (!disabled) { e.currentTarget.style.borderColor = colors.borderHover; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.06)'; } }}
      onMouseLeave={e => { if (!disabled) { e.currentTarget.style.borderColor = primary ? colors.accent : colors.border; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; } }}
    >
      <div style={styles.cardIcon}>{icon}</div>
      <div style={styles.cardTitle}>{title}</div>
      <div style={styles.cardDesc}>{description}</div>
      <div style={styles.cardFormat}>{format}</div>
      {disabled && <div style={styles.cardNote}>Live session only</div>}
    </button>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    marginTop: spacing.xl,
  },
  panelHeader: {
    marginBottom: spacing.md,
  },
  panelTitle: {
    fontSize: 12,
    fontWeight: 500,
    color: colors.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },

  // Assembly status
  assemblyPolling: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    fontSize: 12,
    fontFamily: fonts.sans,
    color: colors.textMuted,
    backgroundColor: 'rgba(139, 115, 85, 0.06)',
    border: `1px solid rgba(139, 115, 85, 0.15)`,
    borderRadius: radii.sm,
    padding: '10px 16px',
    marginBottom: spacing.md,
    lineHeight: 1.5,
  },
  assemblyError: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap' as const,
    fontSize: 12,
    fontFamily: fonts.sans,
    color: colors.danger,
    backgroundColor: 'rgba(180, 60, 60, 0.06)',
    border: `1px solid rgba(180, 60, 60, 0.2)`,
    borderRadius: radii.sm,
    padding: '10px 16px',
    marginBottom: spacing.md,
    lineHeight: 1.5,
  },
  spinner: {
    display: 'inline-block',
    width: 14,
    height: 14,
    border: `2px solid rgba(139, 115, 85, 0.2)`,
    borderTopColor: colors.textMuted,
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
    flexShrink: 0,
  },
  retryBtn: {
    marginLeft: 'auto',
    padding: '4px 12px',
    fontSize: 11,
    fontWeight: 600,
    fontFamily: fonts.sans,
    color: colors.danger,
    backgroundColor: 'transparent',
    border: `1px solid ${colors.danger}`,
    borderRadius: radii.sm,
    cursor: 'pointer',
    transition: 'background-color 0.15s ease',
    whiteSpace: 'nowrap' as const,
  },

  // Style selector
  styleSection: {
    marginBottom: spacing.lg,
  },
  styleLabel: {
    fontSize: 11,
    fontWeight: 500,
    color: colors.textMuted,
    marginBottom: spacing.sm,
    fontFamily: fonts.sans,
  },
  stylePills: {
    display: 'flex',
    gap: spacing.sm,
  },
  pill: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center' as const,
    gap: 2,
    padding: '10px 20px',
    borderRadius: radii.lg,
    border: `1px solid ${colors.border}`,
    backgroundColor: colors.bgCard,
    cursor: 'pointer',
    transition: 'background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease',
    flex: 1,
  },
  pillActive: {
    border: `1px solid ${colors.text}`,
    backgroundColor: colors.text,
    color: '#fff',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },
  pillName: {
    fontSize: 12,
    fontWeight: 600,
    fontFamily: fonts.sans,
  },
  pillDesc: {
    fontSize: 10,
    fontFamily: fonts.sans,
  },

  // Download cards
  primaryRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  secondaryRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: spacing.sm,
  },
  card: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: spacing.xs,
    padding: `${spacing.lg}px ${spacing.md}px`,
    backgroundColor: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.lg,
    cursor: 'pointer',
    transition: 'border-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease',
    textAlign: 'center' as const,
  },
  cardPrimary: {
    border: `2px solid ${colors.accent}`,
    padding: `${spacing.xl}px ${spacing.lg}px`,
  },
  cardDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  cardIcon: {
    fontSize: 22,
    marginBottom: 2,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: 600,
    fontFamily: fonts.sans,
    color: colors.text,
  },
  cardDesc: {
    fontSize: 11,
    fontFamily: fonts.sans,
    color: colors.textMuted,
    lineHeight: 1.4,
  },
  cardFormat: {
    fontSize: 10,
    fontFamily: fonts.mono,
    color: colors.textDim,
    backgroundColor: colors.bgPanel,
    padding: '2px 8px',
    borderRadius: radii.sm,
    marginTop: 2,
  },
  cardNote: {
    fontSize: 9,
    fontFamily: fonts.sans,
    color: colors.textDim,
    fontStyle: 'italic' as const,
    marginTop: 2,
  },

  // Save to folder
  saveToFolderBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    padding: `${spacing.md}px ${spacing.lg}px`,
    marginBottom: spacing.lg,
    backgroundColor: colors.bgCard,
    border: `1px solid ${colors.accent}`,
    borderRadius: radii.lg,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
    fontFamily: fonts.sans,
    color: colors.accent,
    transition: 'background-color 0.15s ease, border-color 0.15s ease',
  },
  saveToFolderDone: {
    borderColor: colors.success,
    color: colors.success,
    cursor: 'default',
  },
  saveToFolderError: {
    borderColor: colors.danger,
    color: colors.danger,
    cursor: 'default',
  },
};
