/**
 * DerivativesPanel — "Generate More" section for derivative document generation.
 *
 * Sits below the DownloadPanel in TheWorkTab. Users can click a card to
 * generate a derivative document (memo, checklist, etc.) from their
 * completed analysis. Each generation is a Claude API call on the backend.
 *
 * v17: Added document style selector + format options (MD / DOCX / HTML).
 * For demo sessions, generates a basic markdown template client-side.
 */

import { useState, useRef, useEffect } from 'react';
import type { DeliveryData } from '../hooks/useDeliveryData.js';
import type { AssemblyStatus } from '../hooks/useDeliveryData.js';
import { colors, fonts, radii, spacing } from '../../staffing/styles/tokens.js';

interface Props {
  data: DeliveryData;
  assemblyStatus: AssemblyStatus;
}

type CardStatus = 'idle' | 'generating' | 'done' | 'error';
type DocStyle = 'traditional' | 'elegant' | 'accessible';
type OutputFormat = 'md' | 'docx' | 'html';

const STYLE_OPTIONS: { id: DocStyle; label: string }[] = [
  { id: 'traditional', label: 'Traditional' },
  { id: 'elegant', label: 'Elegant' },
  { id: 'accessible', label: 'Accessible' },
];

const FORMAT_OPTIONS: { id: OutputFormat; label: string; ext: string }[] = [
  { id: 'docx', label: 'Word', ext: '.docx' },
  { id: 'html', label: 'HTML', ext: '.html' },
  { id: 'md', label: 'Markdown', ext: '.md' },
];

/**
 * Two-letter editorial monograms in serif \u2014 same visual vocabulary as
 * legal section headers. No vendor-coloured emoji, no inconsistent
 * stroke weights, just typography.
 */
const DERIVATIVES = [
  { id: 'executive-memo',       mark: 'EM', title: 'Executive Memo',       desc: 'Formal memo for leadership' },
  { id: 'board-briefing',       mark: 'BB', title: 'Board Briefing',       desc: 'Board-level risk summary' },
  { id: 'implementation-guide', mark: 'IG', title: 'Implementation Guide', desc: 'Step-by-step action plan' },
  { id: 'compliance-checklist', mark: 'CC', title: 'Compliance Checklist', desc: 'Actionable compliance items' },
  { id: 'risk-register',        mark: 'RR', title: 'Risk Register',        desc: 'Structured risk entries' },
  { id: 'client-letter',        mark: 'CL', title: 'Client Letter',        desc: 'Professional advice letter' },
  { id: 'matter-update',        mark: 'SU', title: 'Status Update',        desc: 'Internal matter update' },
  { id: 'training-brief',       mark: 'TB', title: 'Training Brief',       desc: 'Educational issues summary' },
];

function triggerBlobDownload(content: string | ArrayBuffer, filename: string, mimeType: string) {
  const blob = content instanceof ArrayBuffer
    ? new Blob([content], { type: mimeType })
    : new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Generate a basic demo derivative from available session data. */
function generateDemoDerivative(typeId: string, data: DeliveryData): string {
  const meta = DERIVATIVES.find(d => d.id === typeId);
  const title = meta?.title ?? typeId;
  const lines: string[] = [];

  lines.push(`# ${title}`);
  lines.push('');
  lines.push(`**Session:** ${data.sessionId}`);
  lines.push(`**Date:** ${new Date().toLocaleDateString()}`);
  lines.push('');

  if (data.executiveSummary) {
    lines.push('## Summary');
    lines.push('');
    lines.push(data.executiveSummary);
    lines.push('');
  }

  if (data.keyChanges.length > 0) {
    lines.push('## Key Findings');
    lines.push('');
    for (const c of data.keyChanges) {
      lines.push(`### ${c.title}`);
      lines.push(`- **Before:** ${c.before}`);
      lines.push(`- **After:** ${c.after}`);
      lines.push('');
    }
  }

  if (data.debateResolutions.length > 0) {
    lines.push('## Resolutions');
    lines.push('');
    for (const r of data.debateResolutions) {
      lines.push(`- **${r.topic}:** ${r.resolution}`);
    }
    lines.push('');
  }

  if (data.nextSteps.length > 0) {
    lines.push('## Recommended Actions');
    lines.push('');
    for (const s of data.nextSteps) {
      lines.push(`- **${s.label}:** ${s.description}`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('*Generated from AI-assisted analysis. Independent verification recommended.*');
  return lines.join('\n');
}

export function DerivativesPanel({ data, assemblyStatus }: Props) {
  const [statuses, setStatuses] = useState<Record<string, CardStatus>>({});
  const [errorMessages, setErrorMessages] = useState<Record<string, string>>({});
  const [selectedStyle, setSelectedStyle] = useState<DocStyle>('elegant');
  const [selectedFormat, setSelectedFormat] = useState<OutputFormat>('docx');
  const isDemo = data.sessionId.startsWith('demo-session');
  const sessionFailed = data.sessionFailed === true;
  const generationBlocked = !isDemo && assemblyStatus !== 'ready';

  // Track active timeouts for cleanup on unmount
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  useEffect(() => {
    return () => {
      for (const t of timersRef.current) clearTimeout(t);
      timersRef.current.clear();
    };
  }, []);

  const handleGenerate = async (typeId: string) => {
    setStatuses(prev => ({ ...prev, [typeId]: 'generating' }));

    try {
      // Demo sessions: generate client-side markdown
      if (isDemo) {
        const markdown = generateDemoDerivative(typeId, data);
        const slug = data.documentTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'document';
        triggerBlobDownload(markdown, `${slug}-${typeId}.md`, 'text/markdown');
        setStatuses(prev => ({ ...prev, [typeId]: 'done' }));
        const t = setTimeout(() => {
          timersRef.current.delete(t);
          setStatuses(prev => ({ ...prev, [typeId]: 'idle' }));
        }, 5000);
        timersRef.current.add(t);
        return;
      }

      // Live sessions: request from API with format + style
      const res = await fetch(`/api/sessions/${data.sessionId}/derivatives`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          type: typeId,
          format: selectedFormat,
          style: selectedStyle,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `Generation failed (${res.status})` }));
        const msg = err.error || `Generation failed (${res.status})`;
        console.error(`[DerivativesPanel] API error for ${typeId}: ${res.status}`, err);
        throw new Error(msg);
      }

      // Binary formats (DOCX) → download blob; text formats → download text
      const meta = DERIVATIVES.find(d => d.id === typeId);
      const safeTitle = (meta?.title ?? typeId).replace(/[^a-zA-Z0-9-_]/g, '-');

      if (selectedFormat === 'docx') {
        const buffer = await res.arrayBuffer();
        triggerBlobDownload(
          buffer,
          `${data.sessionId}-${safeTitle}.docx`,
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        );
      } else if (selectedFormat === 'html') {
        const html = await res.text();
        triggerBlobDownload(html, `${data.sessionId}-${safeTitle}.html`, 'text/html');
      } else {
        const result = await res.json();
        triggerBlobDownload(
          result.content,
          `${data.sessionId}-${safeTitle}.md`,
          'text/markdown',
        );
      }

      setStatuses(prev => ({ ...prev, [typeId]: 'done' }));
      const t2 = setTimeout(() => {
        timersRef.current.delete(t2);
        setStatuses(prev => ({ ...prev, [typeId]: 'idle' }));
      }, 5000);
      timersRef.current.add(t2);
    } catch (err) {
      console.error(`[DerivativesPanel] Generation failed for ${typeId}:`, err);
      const msg = err instanceof Error ? err.message : 'Generation failed';
      setStatuses(prev => ({ ...prev, [typeId]: 'error' }));
      setErrorMessages(prev => ({ ...prev, [typeId]: msg }));
      const t3 = setTimeout(() => {
        timersRef.current.delete(t3);
        setStatuses(prev => ({ ...prev, [typeId]: 'idle' }));
        setErrorMessages(prev => { const next = { ...prev }; delete next[typeId]; return next; });
      }, 8000);
      timersRef.current.add(t3);
    }
  };

  return (
    <div style={styles.panel}>
      <div style={styles.panelHeader}>
        <div style={styles.panelTitle}>Generate More</div>
        <div style={styles.panelSubtitle}>
          Create derivative documents from your analysis
        </div>
      </div>

      {/* Style + Format selectors */}
      <div style={styles.selectorRow}>
        <div style={styles.selectorGroup}>
          <div style={styles.selectorLabel}>Style</div>
          <div style={styles.pills}>
            {STYLE_OPTIONS.map(opt => (
              <button
                key={opt.id}
                onClick={() => setSelectedStyle(opt.id)}
                style={{
                  ...styles.pill,
                  ...(selectedStyle === opt.id ? styles.pillActive : {}),
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div style={styles.selectorGroup}>
          <div style={styles.selectorLabel}>Format</div>
          <div style={styles.pills}>
            {FORMAT_OPTIONS.map(opt => (
              <button
                key={opt.id}
                onClick={() => setSelectedFormat(opt.id)}
                style={{
                  ...styles.pill,
                  ...(selectedFormat === opt.id ? styles.pillActive : {}),
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {generationBlocked && (
        <div style={styles.blockedWarning}>
          {sessionFailed
            ? 'Session interrupted before a primary work product was assembled. Start a new session before generating derivatives.'
            : assemblyStatus === 'polling'
            ? 'Document is still being assembled — derivative generation will be available once assembly completes.'
            : assemblyStatus === 'timeout'
              ? 'Document assembly timed out. Retry assembly above, then generate derivatives.'
              : assemblyStatus === 'error'
                ? 'Document assembly failed. Retry assembly above, then generate derivatives.'
                : 'Primary work product is not ready — derivative generation is unavailable until document assembly completes.'}
        </div>
      )}

      <div style={styles.grid}>
        {DERIVATIVES.map(d => {
          const status = statuses[d.id] ?? 'idle';
          const disabled = status === 'generating' || (generationBlocked && status !== 'error');

          return (
            <button
              key={d.id}
              onClick={() => handleGenerate(d.id)}
              disabled={disabled}
              style={{
                ...styles.card,
                ...(disabled ? styles.cardDisabled : {}),
                ...(status === 'done' ? styles.cardDone : {}),
                ...(status === 'error' ? styles.cardError : {}),
              }}
              onMouseEnter={e => {
                if (disabled) return;
                e.currentTarget.style.borderColor = colors.text;
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = '0 4px 18px rgba(0,0,0,0.05)';
              }}
              onMouseLeave={e => {
                if (disabled) return;
                e.currentTarget.style.borderColor = colors.border;
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div style={styles.cardMark} aria-hidden="true">{d.mark}</div>
              <div style={styles.cardBody}>
                <div style={styles.cardTitle}>{d.title}</div>
                <div style={styles.cardDesc}>{d.desc}</div>
              </div>
              <div style={styles.cardAction}>
                {status === 'idle' && (
                  <span style={styles.generateLabel}>Generate {'\u2192'}</span>
                )}
                {status === 'generating' && (
                  <span style={styles.generatingLabel}>Generating{'\u2026'}</span>
                )}
                {status === 'done' && (
                  <span style={styles.doneLabel}>{'\u2713'} Done</span>
                )}
                {status === 'error' && (
                  <span style={styles.errorLabel} title={errorMessages[d.id] || 'Failed'}>Retry {'\u2192'}</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {isDemo && (
        <div style={styles.demoNote}>
          Demo mode: downloads a basic markdown template. Style and format options require a live session. Start an engagement for full DOCX output.
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    marginTop: spacing.xxl,
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
  panelSubtitle: {
    fontSize: 12,
    color: colors.textDim,
    marginTop: 4,
  },

  // Selectors
  selectorRow: {
    display: 'flex',
    gap: spacing.xl,
    marginBottom: spacing.lg,
  },
  selectorGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: spacing.xs,
  },
  selectorLabel: {
    fontSize: 10,
    fontWeight: 500,
    color: colors.textDim,
    fontFamily: fonts.sans,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  pills: {
    display: 'flex',
    gap: 4,
  },
  pill: {
    padding: '5px 12px',
    borderRadius: radii.sm,
    border: `1px solid ${colors.border}`,
    backgroundColor: colors.bgCard,
    fontFamily: fonts.sans,
    fontSize: 11,
    fontWeight: 500,
    color: colors.textSecondary,
    cursor: 'pointer',
    transition: 'background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease',
  },
  pillActive: {
    backgroundColor: colors.text,
    color: '#fff',
    borderColor: colors.text,
  },

  // Grid
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: spacing.sm,
  },

  // Card
  card: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.lg,
    padding: `${spacing.lg}px ${spacing.lg}px`,
    backgroundColor: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.md,
    cursor: 'pointer',
    transition: 'border-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease',
    textAlign: 'left' as const,
    width: '100%',
  },
  cardDisabled: {
    opacity: 0.6,
    cursor: 'default',
  },
  cardDone: {
    borderColor: colors.success,
    backgroundColor: colors.successBg,
  },
  cardError: {
    borderColor: colors.danger,
  },

  // Card internals
  cardMark: {
    flexShrink: 0,
    width: 36,
    height: 36,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: fonts.serif,
    fontSize: 12,
    fontWeight: 500,
    letterSpacing: 1.2,
    color: colors.accent,
    border: `1px solid ${colors.border}`,
    borderRadius: '50%',
    backgroundColor: 'transparent',
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: 600,
    fontFamily: fonts.sans,
    color: colors.text,
    letterSpacing: 0.2,
  },
  cardDesc: {
    fontSize: 11,
    fontFamily: fonts.sans,
    color: colors.textMuted,
    lineHeight: 1.5,
    marginTop: 3,
  },
  cardAction: {
    flexShrink: 0,
  },
  generateLabel: {
    fontSize: 10,
    fontWeight: 600,
    fontFamily: fonts.sans,
    color: colors.accent,
    letterSpacing: 1.2,
    textTransform: 'uppercase' as const,
  },
  generatingLabel: {
    fontSize: 10,
    fontWeight: 600,
    fontFamily: fonts.sans,
    color: colors.textMuted,
    letterSpacing: 1.2,
    textTransform: 'uppercase' as const,
  },
  doneLabel: {
    fontSize: 10,
    fontWeight: 600,
    fontFamily: fonts.sans,
    color: colors.success,
    letterSpacing: 1.2,
    textTransform: 'uppercase' as const,
  },
  errorLabel: {
    fontSize: 10,
    fontWeight: 600,
    fontFamily: fonts.sans,
    color: colors.danger,
    letterSpacing: 1.2,
    textTransform: 'uppercase' as const,
  },

  // Blocked warning
  blockedWarning: {
    padding: `${spacing.md}px ${spacing.lg}px`,
    marginBottom: spacing.md,
    backgroundColor: 'rgba(198, 160, 60, 0.08)',
    border: '1px solid rgba(198, 160, 60, 0.25)',
    borderRadius: radii.sm,
    fontSize: 12,
    fontFamily: fonts.sans,
    color: 'rgb(140, 110, 30)',
    lineHeight: 1.5,
  },

  // Demo note
  demoNote: {
    marginTop: spacing.md,
    fontSize: 11,
    color: colors.textDim,
    textAlign: 'center' as const,
  },
};
