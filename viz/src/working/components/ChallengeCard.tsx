/**
 * ChallengeCard — An adversarial challenge against a finding, as a speech bubble.
 *
 * Layout: AgentAvatar (32px) left, speech-bubble with amber left border.
 * Rendered indented in debate threads to read as a reply.
 */

import type { StreamCard } from '../hooks/useWorkingState.js';
import type { AgentProfile } from '../../staffing/hooks/useAgentProfiles.js';
import { AgentAvatar } from './AgentAvatar.js';
import { colors, fonts, radii } from '../../staffing/styles/tokens.js';

type ChallengeData = Extract<StreamCard, { kind: 'challenge' }>;

interface ChallengeCardProps {
  card: ChallengeData;
  resolveAgentName: (role: string) => string;
  agentColor: string;
  profile?: AgentProfile;
}

export function ChallengeCard({ card, resolveAgentName, agentColor, profile }: ChallengeCardProps) {
  const agentName = resolveAgentName(card.challenger);
  const time = new Date(card.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <div style={styles.row}>
      <AgentAvatar role={card.challenger} size="md" profile={profile} />

      <div style={styles.bubble}>
        <div style={styles.header}>
          <span style={{ ...styles.agentName, color: agentColor }}>{agentName}</span>
          <span style={styles.challengeLabel}>challenges</span>
          <span style={styles.targetRef}>{card.targetFindingId}</span>
          <span style={styles.time}>{time}</span>
        </div>

        {/* Challenge argument */}
        {card.challengeText && (
          <div style={styles.body}>
            <span style={styles.content}>{card.challengeText}</span>
          </div>
        )}

        {/* Evidence quotes */}
        {card.evidence.length > 0 && (
          <div style={styles.evidenceBlock}>
            {card.evidence.map((e, i) => (
              <div key={i} style={styles.evidenceLine}>
                <span style={styles.evidenceBar} />
                <span style={styles.evidenceText}>{e}</span>
              </div>
            ))}
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
    backgroundColor: 'rgba(184, 134, 11, 0.03)',
    border: `1px solid ${colors.border}`,
    borderLeft: `3px solid ${colors.warning}`,
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
  },
  challengeLabel: {
    fontSize: 11,
    fontFamily: fonts.serif,
    fontStyle: 'italic' as const,
    color: colors.warning,
  },
  targetRef: {
    fontSize: 10,
    fontFamily: fonts.mono,
    color: colors.textDim,
    backgroundColor: colors.bgPanel,
    padding: '1px 5px',
    borderRadius: radii.sm,
    flex: 1,
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
  evidenceBlock: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 4,
  },
  evidenceLine: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    paddingLeft: 4,
  },
  evidenceBar: {
    width: 2,
    minHeight: 14,
    backgroundColor: colors.warning,
    borderRadius: 1,
    flexShrink: 0,
    marginTop: 2,
  },
  evidenceText: {
    fontSize: 11,
    fontFamily: fonts.serif,
    fontStyle: 'italic' as const,
    color: colors.textDim,
    lineHeight: '1.4',
  },
};
