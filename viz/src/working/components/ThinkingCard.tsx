/**
 * ThinkingCard — Agent start/stop activity card in the stream.
 */

import type { StreamCard } from '../hooks/useWorkingState.js';
import { colors, fonts, radii } from '../../staffing/styles/tokens.js';

type AgentStartCard = Extract<StreamCard, { kind: 'agent_start' }>;
type AgentStopCard = Extract<StreamCard, { kind: 'agent_stop' }>;

interface ThinkingCardProps {
  card: AgentStartCard | AgentStopCard;
  resolveAgentName: (role: string) => string;
  agentColor: string;
}

export function ThinkingCard({ card, resolveAgentName, agentColor }: ThinkingCardProps) {
  const agentName = resolveAgentName(card.role);
  const time = new Date(card.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const isStart = card.kind === 'agent_start';

  return (
    <div style={{
      ...styles.card,
      borderLeftColor: agentColor,
    }}>
      <div style={styles.header}>
        <div style={{ ...styles.dot, backgroundColor: agentColor }} />
        <span style={{ ...styles.agentName, color: agentColor }}>{agentName}</span>
        <span style={{
          ...styles.badge,
          backgroundColor: isStart ? colors.successBg : colors.bgPanel,
          color: isStart ? colors.success : colors.textDim,
        }}>
          {isStart ? 'started' : 'finished'}
        </span>
        <span style={styles.time}>{time}</span>
      </div>
      {isStart && (card as AgentStartCard).task && (
        <div style={styles.task}>{(card as AgentStartCard).task}</div>
      )}
      {!isStart && (
        <div style={styles.duration}>
          Completed in {((card as AgentStopCard).durationMs / 1000).toFixed(1)}s
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
    padding: '10px 14px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    flexShrink: 0,
  },
  agentName: {
    fontSize: 12,
    fontFamily: fonts.sans,
    fontWeight: 600,
    flex: 1,
  },
  badge: {
    fontSize: 9,
    fontFamily: fonts.sans,
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: radii.pill,
  },
  time: {
    fontSize: 10,
    color: colors.textDim,
    fontFamily: fonts.mono,
    flexShrink: 0,
  },
  task: {
    fontSize: 12,
    fontFamily: fonts.sans,
    fontWeight: 400,
    color: colors.textSecondary,
    marginTop: 6,
    lineHeight: '1.4',
    paddingLeft: 12,
  },
  duration: {
    fontSize: 11,
    fontFamily: fonts.sans,
    fontWeight: 400,
    color: colors.textDim,
    marginTop: 4,
    paddingLeft: 12,
  },
};
