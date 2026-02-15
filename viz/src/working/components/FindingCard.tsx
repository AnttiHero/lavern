/**
 * FindingCard — A finding posted by an agent, with severity badge,
 * confidence bar, and nested debate threads.
 */

import type { StreamCard, DebateEntry } from '../hooks/useWorkingState.js';
import { DebateThread } from './DebateThread.js';
import { colors, fonts, radii } from '../../staffing/styles/tokens.js';

type FindingData = Extract<StreamCard, { kind: 'finding' }>;

interface FindingCardProps {
  card: FindingData;
  resolveAgentName: (role: string) => string;
  agentColor: string;
}

const SEVERITY_COLORS: Record<string, { bg: string; fg: string }> = {
  RED: { bg: 'rgba(196, 93, 62, 0.1)', fg: colors.danger },
  YELLOW: { bg: 'rgba(184, 134, 11, 0.1)', fg: colors.warning },
  GREEN: { bg: 'rgba(74, 124, 80, 0.1)', fg: colors.success },
};

export function FindingCard({ card, resolveAgentName, agentColor }: FindingCardProps) {
  const sevStyle = SEVERITY_COLORS[card.severity] ?? SEVERITY_COLORS.YELLOW;
  const agentName = resolveAgentName(card.agent);
  const time = new Date(card.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const confidencePct = Math.round(card.confidence * 100);

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <div style={{ ...styles.agentDot, backgroundColor: agentColor }} />
        <span style={{ ...styles.agentName, color: agentColor }}>{agentName}</span>
        <span style={{
          ...styles.severityBadge,
          backgroundColor: sevStyle.bg,
          color: sevStyle.fg,
        }}>
          {card.severity}
        </span>
        <span style={styles.time}>{time}</span>
      </div>

      <div style={styles.body}>
        <span style={styles.category}>{card.category}</span>
      </div>

      <div style={styles.confidenceRow}>
        <span style={styles.confidenceLabel}>Confidence</span>
        <div style={styles.confidenceBar}>
          <div style={{
            ...styles.confidenceFill,
            width: `${confidencePct}%`,
            backgroundColor: confidencePct > 80 ? colors.success : confidencePct > 50 ? colors.warning : colors.danger,
          }} />
        </div>
        <span style={styles.confidenceValue}>{confidencePct}%</span>
      </div>

      <DebateThread threads={card.threads} resolveAgentName={resolveAgentName} />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    backgroundColor: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.md,
    padding: '12px 14px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  agentDot: {
    width: 7,
    height: 7,
    borderRadius: '50%',
    flexShrink: 0,
  },
  agentName: {
    fontSize: 12,
    fontFamily: fonts.sans,
    fontWeight: 600,
    flex: 1,
  },
  severityBadge: {
    fontSize: 9,
    fontFamily: fonts.sans,
    fontWeight: 700,
    padding: '2px 8px',
    borderRadius: radii.pill,
    letterSpacing: 0.5,
  },
  time: {
    fontSize: 10,
    color: colors.textDim,
    fontFamily: fonts.mono,
    flexShrink: 0,
  },
  body: {
    marginBottom: 8,
  },
  category: {
    fontSize: 13,
    fontFamily: fonts.sans,
    fontWeight: 400,
    color: colors.textSecondary,
    lineHeight: '1.4',
  },
  confidenceRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  confidenceLabel: {
    fontSize: 10,
    color: colors.textDim,
    fontFamily: fonts.sans,
    fontWeight: 500,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.3,
    flexShrink: 0,
  },
  confidenceBar: {
    flex: 1,
    height: 4,
    backgroundColor: colors.bgPanel,
    borderRadius: 2,
    overflow: 'hidden',
  },
  confidenceFill: {
    height: '100%',
    borderRadius: 2,
    transition: 'width 0.3s ease',
  },
  confidenceValue: {
    fontSize: 10,
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontWeight: 500,
    flexShrink: 0,
    width: 28,
    textAlign: 'right' as const,
  },
};
