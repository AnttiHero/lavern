/**
 * ToolUsedCard — Subtle inline card for tool_used events.
 *
 * Shows tool name + agent + timestamp at reduced opacity.
 * Fills the silence between agent_start and first finding.
 */

import { motion } from 'motion/react';
import type { StreamCard } from '../hooks/useWorkingState.js';
import { colors, fonts, radii } from '../../staffing/styles/tokens.js';

type ToolUsedData = Extract<StreamCard, { kind: 'tool_used' }>;

/** Make raw tool names readable: analyze_heading_structure → Analyze heading structure */
function humanize(tool: string): string {
  return tool
    .replace(/[_-]/g, ' ')
    .replace(/^./, c => c.toUpperCase());
}

interface ToolUsedCardProps {
  card: ToolUsedData;
  resolveAgentName: (role: string) => string;
  agentColor?: string;
}

export function ToolUsedCard({ card, resolveAgentName, agentColor }: ToolUsedCardProps) {
  const time = new Date(card.timestamp).toLocaleTimeString([], {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const agentName = card.agent ? resolveAgentName(card.agent) : undefined;

  return (
    <motion.div
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 0.7 }}
      transition={{ duration: 0.15 }}
      style={styles.card}
    >
      <span style={styles.icon}>{'\u2699'}</span>
      <span style={styles.toolName}>{humanize(card.tool)}</span>
      {agentName && (
        <span style={{ ...styles.agent, color: agentColor ?? colors.textDim }}>
          {agentName}
        </span>
      )}
      <span style={styles.time}>{time}</span>
    </motion.div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 12px',
    borderRadius: radii.sm,
    backgroundColor: colors.bgPanel,
  },
  icon: {
    fontSize: 10,
    color: colors.textDim,
    flexShrink: 0,
  },
  toolName: {
    fontSize: 11,
    fontFamily: fonts.sans,
    fontWeight: 400,
    color: colors.textMuted,
    flex: 1,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  agent: {
    fontSize: 10,
    fontFamily: fonts.sans,
    fontWeight: 500,
    flexShrink: 0,
  },
  time: {
    fontSize: 9,
    color: colors.textDim,
    fontFamily: fonts.mono,
    flexShrink: 0,
  },
};
