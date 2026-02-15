/**
 * ResolutionCard — Debate resolution summary card.
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

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <span style={styles.icon}>{'\u2713'}</span>
        <span style={styles.label}>Resolved</span>
        <span style={styles.topic}>{card.topic}</span>
        <span style={styles.time}>{time}</span>
      </div>
      <div style={styles.resolution}>{card.resolution}</div>
      <div style={styles.confidence}>
        Confidence: {confidencePct}%
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    backgroundColor: colors.successBg,
    border: `1px solid rgba(74, 124, 80, 0.2)`,
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
    fontSize: 12,
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
  time: {
    fontSize: 10,
    color: colors.textDim,
    fontFamily: fonts.mono,
    flexShrink: 0,
  },
  resolution: {
    fontSize: 12,
    fontFamily: fonts.sans,
    fontWeight: 400,
    color: colors.textSecondary,
    lineHeight: '1.5',
    paddingLeft: 18,
  },
  confidence: {
    fontSize: 10,
    fontFamily: fonts.mono,
    color: colors.success,
    marginTop: 6,
    paddingLeft: 18,
  },
};
