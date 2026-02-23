/**
 * AgentChip — Rich mini-card for an agent in the TeamPanel sidebar.
 *
 * v12: Category color bar, display name, current task (truncated),
 *      live elapsed time when active, findings count badge, pulse when active.
 */

import { useState, useEffect } from 'react';
import type { AgentProfile } from '../../staffing/hooks/useAgentProfiles.js';
import type { AgentStatus, ActiveThinkingAgent } from '../hooks/useWorkingState.js';
import { colors, fonts, radii, categoryColor } from '../../staffing/styles/tokens.js';

interface AgentChipProps {
  profile: AgentProfile;
  status: AgentStatus | undefined;
  isFiltered: boolean;
  onClick: () => void;
  thinkingAgent?: ActiveThinkingAgent;
  findingCount: number;
}

export function AgentChip({ profile, status, isFiltered, onClick, thinkingAgent, findingCount }: AgentChipProps) {
  const catColor = categoryColor(profile.category);
  const isActive = status?.status === 'active';

  // Live elapsed timer when thinking
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!thinkingAgent) { setElapsed(0); return; }
    const start = new Date(thinkingAgent.startTimestamp).getTime();
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [thinkingAgent?.startTimestamp]);

  const elapsedStr = elapsed < 60
    ? `${elapsed}s`
    : `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`;

  const taskText = thinkingAgent?.task ?? status?.taskDescription;

  return (
    <button
      onClick={onClick}
      style={{
        ...styles.chip,
        backgroundColor: isFiltered ? colors.bgPanel : 'transparent',
        borderColor: isFiltered ? colors.borderSelected : 'transparent',
        animation: isActive ? 'activeAgentGlow 2s ease-in-out infinite' : undefined,
      }}
    >
      {/* Category color bar */}
      <div style={{ ...styles.colorBar, backgroundColor: catColor }} />

      <div style={styles.info}>
        {/* Name row */}
        <div style={styles.nameRow}>
          <span style={styles.name}>{profile.displayName}</span>
          {isActive && (
            <span style={styles.activeDot}>{'\u2022'}</span>
          )}
          {findingCount > 0 && (
            <span style={styles.findingBadge}>{findingCount}</span>
          )}
        </div>

        {/* Current task */}
        {taskText && (
          <span style={styles.task}>{taskText}</span>
        )}

        {/* Elapsed time when active */}
        {thinkingAgent && (
          <span style={styles.elapsed}>{elapsedStr}</span>
        )}

        {/* Status when not active */}
        {!thinkingAgent && status?.lastActivity && (
          <span style={styles.activity}>{status.lastActivity}</span>
        )}
      </div>
    </button>
  );
}

const styles: Record<string, React.CSSProperties> = {
  chip: {
    display: 'flex',
    alignItems: 'stretch',
    gap: 8,
    width: '100%',
    padding: '8px 10px',
    border: '1px solid transparent',
    borderRadius: radii.md,
    cursor: 'pointer',
    textAlign: 'left' as const,
    transition: 'background-color 0.15s ease, border-color 0.15s ease',
    fontFamily: fonts.sans,
    minHeight: 40,
  },
  colorBar: {
    width: 3,
    borderRadius: 2,
    flexShrink: 0,
    alignSelf: 'stretch',
  },
  info: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 2,
    minWidth: 0,
  },
  nameRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  name: {
    fontSize: 12,
    fontWeight: 500,
    color: colors.textSecondary,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    flex: 1,
  },
  activeDot: {
    color: colors.success,
    fontSize: 10,
    flexShrink: 0,
  },
  findingBadge: {
    fontSize: 9,
    fontFamily: fonts.mono,
    fontWeight: 600,
    color: colors.textMuted,
    backgroundColor: colors.bgPanel,
    padding: '0 5px',
    borderRadius: radii.pill,
    flexShrink: 0,
    lineHeight: '16px',
  },
  task: {
    fontSize: 10,
    color: colors.textDim,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    lineHeight: '14px',
  },
  elapsed: {
    fontSize: 9,
    fontFamily: fonts.mono,
    color: colors.success,
    fontWeight: 500,
  },
  activity: {
    fontSize: 10,
    color: colors.textDim,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
};
