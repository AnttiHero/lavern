/**
 * ResolutionCard — Debate resolution verdict bar.
 *
 * Full-width centered layout with green/amber left border.
 * Not a speech bubble — this is a neutral verdict announcement.
 */

import type { StreamCard } from '../hooks/useWorkingState.js';
import { colors, fonts, radii } from '../../staffing/styles/tokens.js';

type ResolutionData = Extract<StreamCard, { kind: 'resolution' }>;

interface ResolutionCardProps {
  card: ResolutionData;
}

export function ResolutionCard({ card }: ResolutionCardProps) {
  const time = new Date(card.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const confidencePct = Math.round(card.confidence * 100);
  const borderColor = card.escalationNeeded ? colors.warning : colors.success;

  return (
    <div style={{ ...styles.card, borderLeftColor: borderColor }}>
      <div style={styles.header}>
        <span style={styles.icon}>{'\u2713'}</span>
        <span style={styles.label}>Resolved</span>
        <span style={styles.topic}>{card.topic}</span>
        {card.escalationNeeded && (
          <span style={styles.escalationBadge}>Escalation needed</span>
        )}
        <span style={styles.confidenceBadge}>{confidencePct}%</span>
        <span style={styles.time}>{time}</span>
      </div>

      <div style={styles.resolution}>{card.resolution}</div>

      {/* Winning position and evidence weight */}
      {card.winningPosition && (
        <div style={styles.detailRow}>
          <span style={styles.detailLabel}>Position:</span>
          <span style={styles.detailText}>{card.winningPosition}</span>
        </div>
      )}
      {card.evidenceWeight && (
        <div style={styles.detailRow}>
          <span style={styles.detailLabel}>Evidence:</span>
          <span style={styles.detailText}>{card.evidenceWeight}</span>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    backgroundColor: colors.successBg,
    border: `1px solid rgba(74, 124, 80, 0.2)`,
    borderLeft: `3px solid ${colors.success}`,
    borderRadius: radii.md,
    padding: '10px 14px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  icon: {
    fontSize: 14,
    fontWeight: 700,
    color: colors.success,
  },
  label: {
    fontSize: 11,
    fontFamily: fonts.sans,
    fontWeight: 600,
    color: colors.success,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.3,
  },
  topic: {
    fontSize: 12,
    fontFamily: fonts.sans,
    fontWeight: 500,
    color: colors.textSecondary,
    flex: 1,
  },
  escalationBadge: {
    fontSize: 9,
    fontFamily: fonts.sans,
    fontWeight: 700,
    color: colors.danger,
    backgroundColor: 'rgba(196, 93, 62, 0.1)',
    padding: '2px 8px',
    borderRadius: radii.pill,
    letterSpacing: 0.3,
    textTransform: 'uppercase' as const,
  },
  confidenceBadge: {
    fontSize: 10,
    fontFamily: fonts.mono,
    fontWeight: 600,
    color: colors.success,
    backgroundColor: 'rgba(74, 124, 80, 0.1)',
    padding: '2px 6px',
    borderRadius: radii.sm,
  },
  time: {
    fontSize: 10,
    color: colors.textDim,
    fontFamily: fonts.mono,
    flexShrink: 0,
  },
  resolution: {
    fontSize: 14,
    fontFamily: fonts.sans,
    fontWeight: 400,
    color: colors.textSecondary,
    lineHeight: '1.5',
    paddingLeft: 20,
    marginBottom: 6,
  },
  detailRow: {
    display: 'flex',
    gap: 6,
    paddingLeft: 20,
    marginBottom: 2,
  },
  detailLabel: {
    fontSize: 10,
    fontFamily: fonts.sans,
    fontWeight: 600,
    color: colors.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.3,
    flexShrink: 0,
  },
  detailText: {
    fontSize: 11,
    fontFamily: fonts.sans,
    fontWeight: 400,
    color: colors.textSecondary,
    lineHeight: '1.4',
  },
};
