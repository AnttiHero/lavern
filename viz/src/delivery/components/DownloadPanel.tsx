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

type DocStyle = 'traditional' | 'elegant' | 'accessible';

interface Props {
  data: DeliveryData;
  assemblyStatus: AssemblyStatus;
  onRetry?: () => void;
  selectedStyle?: DocStyle;
  onStyleChange?: (style: DocStyle) => void;
}

const STYLE_OPTIONS: { id: DocStyle; label: string; desc: string }[] = [
  { id: 'traditional', label: 'Traditional', desc: 'Classic law-firm' },
  { id: 'elegant', label: 'Elegant', desc: 'Warm editorial' },
  { id: 'accessible', label: 'Accessible', desc: 'WCAG AA' },
];

/** Minimal markdown → HTML for demo downloads (no external deps). */
function markdownToHtml(md: string): string {
  const lines = md.split('\n');
  const out: string[] = [];
  let inParagraph = false;
  let listType: 'ul' | 'ol' | null = null;
  let tableRows: string[][] = [];

  const closeList = () => {
    if (listType) { out.push(`</${listType}>`); listType = null; }
  };
  const closePara = () => {
    if (inParagraph) { out.push('</p>'); inParagraph = false; }
  };
  const flushTable = () => {
    if (tableRows.length === 0) return;
    const [header, ...body] = tableRows;
    const thead = (header ?? []).map(c => `<th>${applyInline(c)}</th>`).join('');
    const tbody = body.map(row =>
      `<tr>${row.map(c => `<td>${applyInline(c)}</td>`).join('')}</tr>`
    ).join('');
    out.push(`<table><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table>`);
    tableRows = [];
  };

  for (const raw of lines) {
    const line = raw
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;');

    // Blank line — close open blocks
    if (line.trim() === '') {
      flushTable();
      closeList();
      closePara();
      continue;
    }

    // Table rows — detect before other patterns
    const trimmed = line.trim();
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      closePara();
      closeList();
      const cells = trimmed.split('|').slice(1, -1).map(c => c.trim());
      // Skip separator rows (---|--- pattern)
      if (!cells.every(c => /^[-: ]+$/.test(c))) {
        tableRows.push(cells);
      }
      continue;
    }

    // Flush table if we left table territory
    if (tableRows.length > 0) flushTable();

    // Headings
    const h4 = line.match(/^#### (.+)$/);
    if (h4) { closePara(); closeList(); out.push(`<h4>${applyInline(h4[1])}</h4>`); continue; }
    const h3 = line.match(/^### (.+)$/);
    if (h3) { closePara(); closeList(); out.push(`<h3>${applyInline(h3[1])}</h3>`); continue; }
    const h2 = line.match(/^## (.+)$/);
    if (h2) { closePara(); closeList(); out.push(`<h2>${applyInline(h2[1])}</h2>`); continue; }
    const h1 = line.match(/^# (.+)$/);
    if (h1) { closePara(); closeList(); out.push(`<h1>${applyInline(h1[1])}</h1>`); continue; }

    // Horizontal rule
    if (trimmed === '---') { closePara(); closeList(); out.push('<hr>'); continue; }

    // Blockquote
    const bq = line.match(/^> (.+)$/);
    if (bq) { closePara(); closeList(); out.push(`<blockquote><p>${applyInline(bq[1])}</p></blockquote>`); continue; }

    // Unordered list items
    const ul = line.match(/^[-*] (.+)$/);
    if (ul) {
      closePara();
      if (listType !== 'ul') { closeList(); out.push('<ul>'); listType = 'ul'; }
      out.push(`<li>${applyInline(ul[1])}</li>`);
      continue;
    }

    // Ordered list items
    const ol = line.match(/^\d+\. (.+)$/);
    if (ol) {
      closePara();
      if (listType !== 'ol') { closeList(); out.push('<ol>'); listType = 'ol'; }
      out.push(`<li>${applyInline(ol[1])}</li>`);
      continue;
    }

    // Regular text → paragraph
    closeList();
    if (!inParagraph) { out.push('<p>'); inParagraph = true; }
    out.push(applyInline(line));
  }

  flushTable();
  closeList();
  closePara();
  return out.join('\n');
}

function applyInline(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

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

export function DownloadPanel({ data, assemblyStatus, onRetry, selectedStyle: controlledStyle, onStyleChange }: Props) {
  const isDemo = data.sessionId.startsWith('demo-session');
  const [internalStyle, setInternalStyle] = useState<DocStyle>('elegant');
  const selectedStyle = controlledStyle ?? internalStyle;
  const setSelectedStyle = (s: DocStyle) => { setInternalStyle(s); onStyleChange?.(s); };
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
            const resp = await fetch(`/api/sessions/${data.sessionId}/download?format=${ext}${styleParam}`, { credentials: 'include' });
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

  // Slugify the document title for filenames
  const docSlug = data.documentTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'document';

  const handleDownload = (format: 'docx' | 'pdf' | 'md' | 'json' | 'summary') => {
    if (isDemo) {
      const output = data.finalOutput || '# No output yet';
      if (format === 'md') {
        triggerBlobDownload(output, `${docSlug}.md`, 'text/markdown');
      } else if (format === 'docx' || format === 'pdf') {
        const styleCSS: Record<DocStyle, string> = {
          traditional: `
            body{font-family:'Times New Roman',Times,serif;max-width:680px;margin:48px auto;line-height:1.5;color:#1a1a1a;font-size:12pt}
            h1{font-family:'Times New Roman',Times,serif;font-size:16pt;font-weight:bold;text-align:center;border-bottom:2px solid #1a1a1a;padding-bottom:8px;margin-bottom:24px;counter-reset:section}
            h2{font-family:'Times New Roman',Times,serif;font-size:13pt;font-weight:bold;margin-top:28px;counter-increment:section}
            h2::before{content:counter(section) '. '}
            h3{font-family:'Times New Roman',Times,serif;font-size:12pt;font-weight:bold;font-style:italic}
            h4{font-family:'Times New Roman',Times,serif;font-size:11pt;font-weight:bold}
            p{margin:0 0 12px;text-align:justify}
            ul,ol{padding-left:28px;margin:0 0 12px}
            blockquote{border-left:3px solid #1a1a1a;margin:16px 0;padding:8px 16px;font-style:italic}
            hr{border:none;border-top:1px solid #1a1a1a;margin:24px 0}
            table{width:100%;border-collapse:collapse;border-spacing:0;margin:16px 0;font-size:11pt;line-height:1.4}
            th{background:#1a1a1a;color:#fff;padding:6px 10px;text-align:left;font-weight:bold;font-family:'Times New Roman',Times,serif;line-height:1.4}
            td{padding:6px 10px;border:1px solid #ccc;vertical-align:top;line-height:1.4}
            tr:nth-child(even) td{background:#f5f5f5}
          `,
          elegant: `
            @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&family=Inter:wght@300;400&display=swap');
            body{font-family:'Inter',Helvetica,sans-serif;max-width:720px;margin:56px auto;line-height:1.8;color:#2c2118;font-size:14px;font-weight:300;background:#faf8f5}
            h1{font-family:'Cormorant Garamond',Georgia,serif;font-size:36px;font-weight:300;color:#b85c38;line-height:1.1;margin-bottom:32px;border:none}
            h2{font-family:'Cormorant Garamond',Georgia,serif;font-size:24px;font-weight:300;color:#2c2118;margin-top:40px;border-bottom:1px solid rgba(44,33,24,.12);padding-bottom:8px}
            h3{font-family:'Cormorant Garamond',Georgia,serif;font-size:18px;font-weight:400;font-style:italic;color:#b85c38}
            h4{font-family:'Inter',Helvetica,sans-serif;font-size:13px;font-weight:500;color:#2c2118;margin-top:24px}
            p{margin:0 0 16px}
            ul,ol{padding-left:24px;margin:0 0 16px}
            blockquote{border-left:2px solid #b85c38;margin:24px 0;padding:12px 20px;font-style:italic;color:#6b5744}
            hr{border:none;border-top:1px solid rgba(44,33,24,.15);margin:32px 0}
            strong{font-weight:500}
            table{width:100%;border-collapse:collapse;border-spacing:0;margin:24px 0;font-size:13px;line-height:1.4}
            th{background:#f5ede8;color:#2c2118;padding:7px 12px;text-align:left;font-weight:500;font-family:'Cormorant Garamond',Georgia,serif;font-size:14px;border-bottom:2px solid #c4795a;line-height:1.4}
            td{padding:7px 12px;border-bottom:1px solid #ddd0c8;vertical-align:top;line-height:1.4}
            tr:last-child td{border-bottom:none}
          `,
          accessible: `
            body{font-family:Verdana,Geneva,sans-serif;max-width:740px;margin:40px auto;line-height:1.8;color:#111;font-size:16px;background:#fff}
            h1{font-size:28px;font-weight:700;color:#000;margin-bottom:24px;letter-spacing:0.12px}
            h2{font-size:22px;font-weight:700;color:#000;margin-top:36px;border-bottom:3px solid #005fcc;padding-bottom:6px}
            h3{font-size:18px;font-weight:700;color:#000}
            h4{font-size:16px;font-weight:700;color:#000}
            p{margin:0 0 16px}
            a{color:#005fcc;text-decoration:underline}
            ul,ol{padding-left:28px;margin:0 0 16px}
            li{margin-bottom:6px}
            blockquote{background:#f0f4ff;border-left:4px solid #005fcc;margin:20px 0;padding:12px 20px}
            hr{border:none;border-top:2px solid #ccc;margin:28px 0}
            strong{font-weight:700}
            table{width:100%;border-collapse:collapse;border-spacing:0;margin:20px 0;font-size:15px;line-height:1.4}
            th{background:#005fcc;color:#fff;padding:7px 14px;text-align:left;font-weight:700;border:2px solid #003d80;line-height:1.4}
            td{padding:7px 14px;border:1px solid #ccc;vertical-align:top;line-height:1.4}
            tr:nth-child(even) td{background:#f0f4ff}
          `,
        };
        const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(data.documentTitle)}</title>
<style>${styleCSS[selectedStyle]}</style>
</head><body>${markdownToHtml(output)}</body></html>`;
        const ext = format === 'docx' ? 'doc' : 'html';
        triggerBlobDownload(html, `${docSlug}-${selectedStyle}.${ext}`, 'text/html');
      } else if (format === 'json') {
        const jsonData = {
          sessionId: data.sessionId,
          exportedAt: new Date().toISOString(),
          debate: { findingsCount: data.debate.findingsCount, resolutions: data.debateResolutions },
          verification: data.verificationChecks,
          cost: data.cost,
        };
        triggerBlobDownload(JSON.stringify(jsonData, null, 2), `${docSlug}-data.json`, 'application/json');
      } else if (format === 'summary') {
        const summary = generateClientSummary(data);
        triggerBlobDownload(summary, `${docSlug}-summary.md`, 'text/markdown');
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

      {/* Download button */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <DownloadButton
          label="Download"
          sub={isDemo ? `.doc · ${selectedStyle}` : `.docx · ${selectedStyle}`}
          primary
          onClick={() => handleDownload('docx')}
          disabled={!isDemo && !deliverableValid}
        />
      </div>
    </div>
  );
}

function DownloadButton({ label, sub, primary, disabled, onClick }: {
  label: string;
  sub: string;
  primary?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  const [clicked, setClicked] = useState(false);

  const handleClick = () => {
    if (clicked || disabled) return;
    onClick();
    setClicked(true);
    setTimeout(() => setClicked(false), 2000);
  };

  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      style={{
        ...styles.dlBtn,
        ...(primary ? styles.dlBtnPrimary : {}),
        ...(disabled ? styles.dlBtnDisabled : {}),
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.opacity = '0.82'; }}
      onMouseLeave={e => { if (!disabled) e.currentTarget.style.opacity = '1'; }}
    >
      <span style={styles.dlBtnLabel}>{clicked ? 'Downloading\u2026' : label}</span>
      <span style={styles.dlBtnSub}>{sub}</span>
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
    flexWrap: 'wrap' as const,
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

  // Download buttons
  downloadRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: spacing.md,
  },
  dlBtn: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 6,
    padding: '20px 56px',
    backgroundColor: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.lg,
    cursor: 'pointer',
    transition: 'opacity 0.15s ease',
    textAlign: 'center' as const,
    color: colors.text,
    minWidth: 240,
  },
  dlBtnPrimary: {
    backgroundColor: colors.text,
    border: `1px solid ${colors.text}`,
    color: colors.bg,
  },
  dlBtnDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
  },
  dlBtnLabel: {
    fontSize: 16,
    fontWeight: 600,
    fontFamily: fonts.sans,
    color: 'inherit',
    letterSpacing: 0.5,
  },
  dlBtnSub: {
    fontSize: 10,
    fontFamily: fonts.mono,
    color: 'inherit',
    opacity: 0.55,
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
