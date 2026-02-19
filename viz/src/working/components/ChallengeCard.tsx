/**
 * ChallengeCard — An adversarial challenge against a finding.
 *
 * Amber left border. Shows the challenger name, the target finding reference,
 * the challenge argument text, and supporting evidence quotes.
 */

import type { StreamCard } from '../hooks/useWorkingState.js';
import { colors, fonts, radii } from '../../staffing/styles/tokens.js';

type ChallengeData = Extract<StreamCard, { kind: 'challenge' }>;

interface ChallengeCardProps {
  card: ChallengeData;
  resolveAgentName: (role: string) => string;
  agentColor: string;
}

export function ChallengeCard({ card, resolveAgentName, agentColor }: ChallengeCardProps) {
  const agentName = resolveAgentName(card.challenger);
  const time = new Date(card.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <div style={{ ...styles.agentDot, backgroundColor: agentColor }} />
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
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    backgroundColor: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderLeft: `3px solid ${colors.warning}`,
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
