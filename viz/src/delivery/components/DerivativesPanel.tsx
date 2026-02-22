/**
 * DerivativesPanel — "Generate More" section for derivative document generation.
 *
 * Sits below the DownloadPanel in TheWorkTab. Users can click a card to
 * generate a derivative document (memo, checklist, etc.) from their
 * completed analysis. Each generation is a Claude API call on the backend.
 *
 * Design: matches the editorial warm palette. 2-column grid of cards,
 * each with icon, title, description, and generate button.
 */

import { useState } from 'react';
import type { DeliveryData } from '../hooks/useDeliveryData.js';
import { colors, fonts, radii, spacing } from '../../staffing/styles/tokens.js';

interface Props {
  data: DeliveryData;
}

type CardStatus = 'idle' | 'generating' | 'done' | 'error';

const DERIVATIVES = [
  { id: 'executive-memo',       icon: '\uD83D\uDCDD', title: 'Executive Memo',       desc: 'Formal memo for leadership' },
  { id: 'board-briefing',       icon: '\uD83C\uDFDB\uFE0F', title: 'Board Briefing',       desc: 'Board-level risk summary' },
  { id: 'implementation-guide', icon: '\uD83D\uDCCB', title: 'Implementation Guide', desc: 'Step-by-step action plan' },
  { id: 'compliance-checklist', icon: '\u2705',       title: 'Compliance Checklist', desc: 'Actionable compliance items' },
  { id: 'risk-register',        icon: '\u26A0\uFE0F', title: 'Risk Register',        desc: 'Structured risk entries' },
  { id: 'client-letter',        icon: '\u2709\uFE0F', title: 'Client Letter',        desc: 'Professional advice letter' },
  { id: 'matter-update',        icon: '\uD83D\uDCCA', title: 'Status Update',        desc: 'Internal matter update' },
  { id: 'training-brief',       icon: '\uD83C\uDF93', title: 'Training Brief',       desc: 'Educational issues summary' },
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

export function DerivativesPanel({ data }: Props) {
  const [statuses, setStatuses] = useState<Record<string, CardStatus>>({});
  const isDemo = data.sessionId.startsWith('demo-session');

  const handleGenerate = async (typeId: string) => {
    if (isDemo) return;

    setStatuses(prev => ({ ...prev, [typeId]: 'generating' }));

    try {
      const res = await fetch(`/api/sessions/${data.sessionId}/derivatives`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ type: typeId }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Generation failed' }));
        throw new Error(err.error || 'Generation failed');
      }

      const result = await res.json();
      triggerBlobDownload(
        result.content,
        `${data.sessionId}-${typeId}.md`,
        'text/markdown',
      );

      setStatuses(prev => ({ ...prev, [typeId]: 'done' }));

      // Reset to idle after 3 seconds
      setTimeout(() => {
        setStatuses(prev => ({ ...prev, [typeId]: 'idle' }));
      }, 3000);
    } catch (err) {
      console.error(`[DerivativesPanel] Generation failed for ${typeId}:`, err);
      setStatuses(prev => ({ ...prev, [typeId]: 'error' }));

      // Reset to idle after 5 seconds
      setTimeout(() => {
        setStatuses(prev => ({ ...prev, [typeId]: 'idle' }));
      }, 5000);
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

      <div style={styles.grid}>
        {DERIVATIVES.map(d => {
          const status = statuses[d.id] ?? 'idle';
          const disabled = isDemo || status === 'generating';

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
                if (!disabled) e.currentTarget.style.borderColor = colors.borderHover;
              }}
              onMouseLeave={e => {
                if (!disabled) e.currentTarget.style.borderColor = colors.border;
              }}
            >
              <div style={styles.cardIcon}>{d.icon}</div>
              <div style={styles.cardBody}>
                <div style={styles.cardTitle}>{d.title}</div>
                <div style={styles.cardDesc}>{d.desc}</div>
              </div>
              <div style={styles.cardAction}>
                {status === 'idle' && (
                  <span style={styles.generateLabel}>Generate</span>
                )}
                {status === 'generating' && (
                  <span style={styles.generatingLabel}>Generating{'\u2026'}</span>
                )}
                {status === 'done' && (
                  <span style={styles.doneLabel}>{'\u2713'} Done</span>
                )}
                {status === 'error' && (
                  <span style={styles.errorLabel}>Failed</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {isDemo && (
        <div style={styles.demoNote}>
          Derivative generation is available with live sessions.
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
    marginBottom: spacing.lg,
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

  // Grid
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: spacing.sm,
  },

  // Card
  card: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.md,
    padding: `${spacing.md}px ${spacing.lg}px`,
    backgroundColor: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.md,
    cursor: 'pointer',
    transition: 'border-color 0.15s ease',
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
  cardIcon: {
    fontSize: 20,
    flexShrink: 0,
    width: 28,
    textAlign: 'center' as const,
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
  },
  cardDesc: {
    fontSize: 11,
    fontFamily: fonts.sans,
    color: colors.textMuted,
    lineHeight: 1.4,
    marginTop: 2,
  },
  cardAction: {
    flexShrink: 0,
  },
  generateLabel: {
    fontSize: 11,
    fontWeight: 500,
    fontFamily: fonts.sans,
    color: colors.accent,
    letterSpacing: 0.3,
  },
  generatingLabel: {
    fontSize: 11,
    fontWeight: 500,
    fontFamily: fonts.sans,
    color: colors.textMuted,
    letterSpacing: 0.3,
  },
  doneLabel: {
    fontSize: 11,
    fontWeight: 600,
    fontFamily: fonts.sans,
    color: colors.success,
  },
  errorLabel: {
    fontSize: 11,
    fontWeight: 600,
    fontFamily: fonts.sans,
    color: colors.danger,
  },

  // Demo note
  demoNote: {
    marginTop: spacing.md,
    fontSize: 11,
    color: colors.textDim,
    fontStyle: 'italic' as const,
    textAlign: 'center' as const,
  },
};
