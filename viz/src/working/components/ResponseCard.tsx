/**
 * ResponseCard — An agent's response to a challenge.
 *
 * Shows whether the agent defends or concedes, with the response text
 * and optional revised position.
 */

import type { StreamCard } from '../hooks/useWorkingState.js';
import { colors, fonts, radii } from '../../staffing/styles/tokens.js';

type ResponseData = Extract<StreamCard, { kind: 'response' }>;

interface ResponseCardProps {
  card: ResponseData;
  resolveAgentName: (role: string) => string;
  agentColor: string;
}

export function ResponseCard({ card, resolveAgentName, agentColor }: ResponseCardProps) {
  const agentName = resolveAgentName(card.responder);
  const time = new Date(card.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const verb = card.accepted ? 'concedes' : 'defends';
  const verbColor = card.accepted ? colors.warning : colors.success;

  return (
    <div style={{ ...styles.card, borderLeftColor: agentColor }}>
      <div style={styles.header}>
        <div style={{ ...styles.agentDot, backgroundColor: agentColor }} />
        <span style={{ ...styles.agentName, color: agentColor }}>{agentName}</span>
        <span style={{ ...styles.verb, color: verbColor }}>{verb}</span>
        <span style={styles.time}>{time}</span>
      </div>

      {/* Response text */}
      {card.responseText && (
        <div style={styles.body}>
          <span style={styles.content}>{card.responseText}</span>
        </div>
      )}

      {/* Revised position (when conceding) */}
      {card.revisedPosition && (
        <div style={styles.revisedBlock}>
          <span style={styles.revisedLabel}>Revised position:</span>
          <span style={styles.revisedText}>{card.revisedPosition}</span>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    backgroundColor: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderLeft: '3px solid',
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
  verb: {
    fontSize: 11,
    fontFamily: fonts.serif,
    fontStyle: 'italic' as const,
    fontWeight: 500,
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
  content: {
    fontSize: 13,
    fontFamily: fonts.sans,
    fontWeight: 400,
    color: colors.textSecondary,
    lineHeight: '1.5',
  },
  revisedBlock: {
    backgroundColor: colors.bgPanel,
    borderRadius: radii.sm,
    padding: '8px 10px',
  },
  revisedLabel: {
    fontSize: 10,
    fontFamily: fonts.sans,
    fontWeight: 600,
    color: colors.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.3,
    display: 'block',
    marginBottom: 4,
  },
  revisedText: {
    fontSize: 12,
    fontFamily: fonts.sans,
    fontWeight: 400,
    color: colors.textSecondary,
    lineHeight: '1.5',
  },
};
