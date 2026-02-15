/**
 * GateCard — Gate notification card in the thinking stream.
 * Clicking opens the GateDialog modal.
 */

import { useState } from 'react';
import type { StreamCard } from '../hooks/useWorkingState.js';
import { colors, fonts, radii, spacing } from '../../staffing/styles/tokens.js';

type GateData = Extract<StreamCard, { kind: 'gate' }>;

const GATE_LABELS: Record<string, string> = {
  ethics_critical: 'Ethics Critical',
  meaning_critical: 'Meaning Critical',
  final_delivery: 'Final Delivery',
};

interface GateCardProps {
  card: GateData;
  onClick: () => void;
}

export function GateCard({ card, onClick }: GateCardProps) {
  const [hovered, setHovered] = useState(false);
  const time = new Date(card.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const label = GATE_LABELS[card.gateType] ?? card.gateType;

  return (
    <div style={{
      ...styles.card,
      opacity: card.decided ? 0.6 : 1,
    }}>
      <div style={styles.header}>
        <div style={styles.icon}>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
            <path d="M8 3v6M8 11.5v.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
        <div style={styles.headerText}>
          <span style={styles.headerLabel}>HUMAN GATE</span>
          <span style={styles.gateLabel}>{label}</span>
        </div>
        <span style={styles.time}>{time}</span>
      </div>
      <div style={styles.summary}>{card.summary}</div>
      {card.decided ? (
        <div style={styles.decidedRow}>
          <span style={styles.decidedBadge}>{card.decision}</span>
        </div>
      ) : (
        <button
          onClick={onClick}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            ...styles.reviewBtn,
            backgroundColor: hovered ? colors.text : 'transparent',
            color: hovered ? '#fff' : colors.text,
          }}
        >
          Review &amp; Decide
        </button>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    backgroundColor: colors.accentLight,
    border: `1.5px solid rgba(196, 93, 62, 0.2)`,
    borderRadius: radii.sm,
    padding: `${spacing.md}px ${spacing.lg}px`,
    transition: 'opacity 0.3s ease',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: spacing.sm,
  },
  icon: {
    width: 22,
    height: 22,
    borderRadius: radii.sm,
    backgroundColor: colors.accent,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headerText: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 1,
  },
  headerLabel: {
    fontSize: 8,
    fontFamily: fonts.sans,
    fontWeight: 600,
    color: colors.textMuted,
    letterSpacing: 1.5,
  },
  gateLabel: {
    fontSize: 13,
    fontFamily: fonts.serif,
    fontWeight: 400,
    color: colors.accent,
  },
  time: {
    fontSize: 10,
    color: colors.textDim,
    fontFamily: fonts.mono,
    flexShrink: 0,
  },
  summary: {
    fontSize: 12,
    fontFamily: fonts.sans,
    fontWeight: 400,
    color: colors.textSecondary,
    lineHeight: '1.6',
    marginBottom: spacing.sm,
    paddingLeft: 32,
  },
  reviewBtn: {
    border: `1.5px solid ${colors.text}`,
    borderRadius: radii.sm,
    backgroundColor: 'transparent',
    color: colors.text,
    fontFamily: fonts.sans,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    padding: '6px 16px',
    cursor: 'pointer',
    marginLeft: 32,
    transition: 'background-color 0.25s ease, color 0.25s ease, border-color 0.25s ease',
  },
  decidedRow: {
    paddingLeft: 32,
  },
  decidedBadge: {
    fontSize: 10,
    fontFamily: fonts.sans,
    fontWeight: 600,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    padding: '3px 10px',
    borderRadius: radii.sm,
    backgroundColor: colors.bgPanel,
    color: colors.textMuted,
  },
};
