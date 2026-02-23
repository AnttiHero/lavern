/**
 * ActiveThinkingCard — Persistent thinking indicator for an active agent.
 *
 * Appears on agent_start, shows animated dots + task description + elapsed timer,
 * accumulates tool chips as tool_used events arrive.
 * Disappears on agent_stop.
 */

import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import type { ActiveThinkingAgent } from '../hooks/useWorkingState.js';
import { colors, fonts, radii, categoryColor } from '../../staffing/styles/tokens.js';
import type { AgentProfile } from '../../staffing/hooks/useAgentProfiles.js';

interface ActiveThinkingCardProps {
  agent: ActiveThinkingAgent;
  profile?: AgentProfile;
}

/** Make raw tool names readable: analyze_heading_structure → Analyze heading structure */
function humanize(tool: string): string {
  return tool
    .replace(/[_-]/g, ' ')
    .replace(/^./, c => c.toUpperCase());
}

export function ActiveThinkingCard({ agent, profile }: ActiveThinkingCardProps) {
  const catColor = profile ? categoryColor(profile.category) : colors.textMuted;
  const agentName = profile?.displayName ?? agent.role.replace(/-/g, ' ');

  // Live elapsed timer
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = new Date(agent.startTimestamp).getTime();
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [agent.startTimestamp]);

  const elapsedStr = elapsed < 60
    ? `${elapsed}s`
    : `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`;

  // Show last 4 tools
  const recentTools = agent.toolsUsed.slice(-4);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.25 }}
      style={{ ...styles.card, borderLeftColor: catColor }}
    >
      <div style={styles.header}>
        <div style={{ ...styles.colorBar, backgroundColor: catColor }} />
        <span style={{ ...styles.agentName, color: catColor }}>{agentName}</span>
        <span style={styles.thinkingDots}>
          <span style={styles.dot1}>{'\u2022'}</span>
          <span style={styles.dot2}>{'\u2022'}</span>
          <span style={styles.dot3}>{'\u2022'}</span>
        </span>
        <span style={styles.elapsed}>{elapsedStr}</span>
      </div>

      <div style={styles.task}>{agent.task}</div>

      {recentTools.length > 0 && (
        <div style={styles.toolRow}>
          {recentTools.map((tool, i) => (
            <span key={i} style={styles.toolChip}>
              {humanize(tool)}
            </span>
          ))}
          {agent.toolsUsed.length > 4 && (
            <span style={styles.moreChip}>+{agent.toolsUsed.length - 4}</span>
          )}
        </div>
      )}
    </motion.div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    backgroundColor: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderLeft: '3px solid',
    borderRadius: radii.md,
    padding: '10px 14px',
    animation: 'activeThinkingPulse 2s ease-in-out infinite',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  colorBar: {
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
  thinkingDots: {
    display: 'flex',
    gap: 2,
    fontSize: 12,
    color: colors.textDim,
  },
  dot1: { animation: 'thinkingDotBounce 1.2s ease-in-out infinite' },
  dot2: { animation: 'thinkingDotBounce 1.2s ease-in-out 0.2s infinite' },
  dot3: { animation: 'thinkingDotBounce 1.2s ease-in-out 0.4s infinite' },
  elapsed: {
    fontSize: 10,
    fontFamily: fonts.mono,
    color: colors.textDim,
    flexShrink: 0,
  },
  task: {
    fontSize: 12,
    fontFamily: fonts.sans,
    fontWeight: 400,
    color: colors.textSecondary,
    marginTop: 5,
    lineHeight: '1.4',
    paddingLeft: 12,
  },
  toolRow: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 4,
    marginTop: 6,
    paddingLeft: 12,
  },
  toolChip: {
    fontSize: 9,
    fontFamily: fonts.sans,
    fontWeight: 500,
    color: colors.textDim,
    backgroundColor: colors.bgPanel,
    padding: '2px 6px',
    borderRadius: radii.sm,
    whiteSpace: 'nowrap' as const,
  },
  moreChip: {
    fontSize: 9,
    fontFamily: fonts.mono,
    color: colors.textDim,
    padding: '2px 4px',
  },
};
