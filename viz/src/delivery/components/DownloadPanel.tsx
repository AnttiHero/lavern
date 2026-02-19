/**
 * DownloadPanel — Download buttons for work product, data, and client summary.
 *
 * In demo mode, generates client-side Blob downloads.
 * In real mode, navigates to /api/sessions/:id/download?format=X.
 */

import type { DeliveryData } from '../hooks/useDeliveryData.js';
import { colors, fonts, radii, spacing } from '../../staffing/styles/tokens.js';

interface Props {
  data: DeliveryData;
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

export function DownloadPanel({ data }: Props) {
  const isDemo = data.sessionId.startsWith('demo-session');

  const handleDownload = (format: 'md' | 'json' | 'summary') => {
    if (isDemo) {
      // Client-side Blob download
      if (format === 'md') {
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
      // Real API download
      window.open(`/api/sessions/${data.sessionId}/download?format=${format}`, '_blank');
    }
  };

  return (
    <div style={styles.panel}>
      <div style={styles.panelHeader}>
        <div style={styles.panelTitle}>Download</div>
      </div>
      <div style={styles.cards}>
        <DownloadCard
          icon={'\uD83D\uDCC4'}
          title="Work Product"
          description="The full deliverable as Markdown"
          format=".md"
          primary
          onClick={() => handleDownload('md')}
        />
        <DownloadCard
          icon={'\u007B\u007D'}
          title="Structured Data"
          description="Findings, debates, verification"
          format=".json"
          onClick={() => handleDownload('json')}
        />
        <DownloadCard
          icon={'\uD83D\uDCCB'}
          title="Client Summary"
          description="One-page executive briefing"
          format=".md"
          onClick={() => handleDownload('summary')}
        />
      </div>
    </div>
  );
}

function DownloadCard({ icon, title, description, format, primary, onClick }: {
  icon: string;
  title: string;
  description: string;
  format: string;
  primary?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        ...styles.card,
        ...(primary ? styles.cardPrimary : {}),
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = colors.borderHover; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = colors.border; }}
    >
      <div style={styles.cardIcon}>{icon}</div>
      <div style={styles.cardTitle}>{title}</div>
      <div style={styles.cardDesc}>{description}</div>
      <div style={styles.cardFormat}>{format}</div>
    </button>
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
  cards: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: spacing.md,
  },
  card: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: spacing.xs,
    padding: `${spacing.xl}px ${spacing.lg}px`,
    backgroundColor: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.lg,
    cursor: 'pointer',
    transition: 'border-color 0.15s ease',
    textAlign: 'center' as const,
  },
  cardPrimary: {
    borderColor: colors.accent,
    borderWidth: 2,
  },
  cardIcon: {
    fontSize: 24,
    marginBottom: spacing.xs,
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
    marginTop: spacing.xs,
  },
};
