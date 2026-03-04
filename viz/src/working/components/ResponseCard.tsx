/**
 * ResponseCard — An agent's response to a challenge, as a speech bubble.
 *
 * Layout: AgentAvatar (32px) left, speech-bubble with agent-color left border.
 * Shows concede/defend verb and optional revised position.
 */

import type { StreamCard } from '../hooks/useWorkingState.js';
import type { AgentProfile } from '../../staffing/hooks/useAgentProfiles.js';
import { AgentAvatar } from './AgentAvatar.js';
import { colors, fonts, radii } from '../../staffing/styles/tokens.js';

type ResponseData = Extract<StreamCard, { kind: 'response' }>;

interface ResponseCardProps {
  card: ResponseData;
  resolveAgentName: (role: string) => string;
  agentColor: string;
  profile?: AgentProfile;
}

export function ResponseCard({ card, resolveAgentName, agentColor, profile }: ResponseCardProps) {
  const agentName = resolveAgentName(card.responder);
  const time = new Date(card.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const verb = card.accepted ? 'concedes' : 'defends';
  const verbColor = card.accepted ? colors.warning : colors.success;

  return (
    <div style={styles.row}>
      <AgentAvatar role={card.responder} size="md" profile={profile} />

      <div style={{ ...styles.bubble, borderLeftColor: agentColor }}>
        <div style={styles.header}>
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
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  row: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
  },
  bubble: {
    flex: 1,
    backgroundColor: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderLeft: '3px solid',
    borderRadius: radii.md,
    padding: '12px 14px',
    minWidth: 0,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
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
