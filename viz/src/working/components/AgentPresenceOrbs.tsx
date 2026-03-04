/**
 * AgentPresenceOrbs — Horizontal row of mini agent avatars representing team members.
 *
 * Replaces the old 20px colored dots with 24px DiceBear avatars.
 * Active agents glow with their category color. Complete agents are slightly dimmed.
 * Hover shows agent name + current task in a tooltip.
 */

import { useState } from 'react';
import type { AgentProfile } from '../../staffing/hooks/useAgentProfiles.js';
import type { AgentStatus, ActiveThinkingAgent } from '../hooks/useWorkingState.js';
import { AgentAvatar } from './AgentAvatar.js';
import { categoryColor, colors, fonts } from '../../staffing/styles/tokens.js';

interface AgentPresenceOrbsProps {
  team: AgentProfile[];
  agentStatuses: Map<string, AgentStatus>;
  activeThinkingAgents: Map<string, ActiveThinkingAgent>;
}

export function AgentPresenceOrbs({
  team,
  agentStatuses,
  activeThinkingAgents,
}: AgentPresenceOrbsProps) {
  const [hoveredRole, setHoveredRole] = useState<string | null>(null);

  // Only show agents that have actually been dispatched (have a status or are active)
  const visibleTeam = team.filter(agent =>
    agentStatuses.has(agent.role) || activeThinkingAgents.has(agent.role)
  );

  return (
    <div style={styles.container}>
      {visibleTeam.map((agent, idx) => {
        const status = agentStatuses.get(agent.role);
        const isActive = activeThinkingAgents.has(agent.role);
        const isComplete = status?.status === 'complete';
        const color = categoryColor(agent.category);
        const thinkingAgent = activeThinkingAgents.get(agent.role);

        const opacity = isActive ? 1 : isComplete ? 0.65 : 0.5;
        const glowShadow = isActive
          ? `0 0 6px ${color}, 0 0 12px ${color}40`
          : 'none';

        return (
          <div
            key={agent.role}
            style={{ position: 'relative' as const, display: 'inline-block' }}
            onMouseEnter={() => setHoveredRole(agent.role)}
            onMouseLeave={() => setHoveredRole(null)}
          >
            <div style={{
              opacity,
              boxShadow: glowShadow,
              borderRadius: '50%',
              transition: 'opacity 0.4s ease, box-shadow 0.4s ease',
              animation: isActive ? `orbFloat 3s ease-in-out ${idx * 0.2}s infinite` : 'none',
            }}>
              <AgentAvatar role={agent.role} size="sm" profile={agent} />
            </div>

            {/* Checkmark overlay for completed agents */}
            {isComplete && (
              <div style={styles.checkOverlay}>{'\u2713'}</div>
            )}

            {/* Tooltip */}
            {hoveredRole === agent.role && (
              <div style={styles.tooltip}>
                <div style={styles.tooltipName}>{agent.displayName}</div>
                {isActive && thinkingAgent?.task && (
                  <div style={styles.tooltipTask}>
                    {thinkingAgent.task.length > 60
                      ? thinkingAgent.task.slice(0, 57) + '...'
                      : thinkingAgent.task}
                  </div>
                )}
                {isComplete && <div style={styles.tooltipTask}>Completed</div>}
                {!isActive && !isComplete && <div style={styles.tooltipTask}>Waiting</div>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap' as const,
  },
  checkOverlay: {
    position: 'absolute' as const,
    bottom: -2,
    right: -2,
    width: 12,
    height: 12,
    borderRadius: '50%',
    backgroundColor: colors.success,
    color: '#fff',
    fontSize: 8,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 1,
  },
  tooltip: {
    position: 'absolute' as const,
    bottom: '100%',
    left: '50%',
    transform: 'translateX(-50%)',
    marginBottom: 8,
    backgroundColor: colors.text,
    color: colors.bg,
    borderRadius: 6,
    padding: '6px 10px',
    whiteSpace: 'nowrap' as const,
    zIndex: 100,
    pointerEvents: 'none' as const,
    minWidth: 100,
    maxWidth: 220,
  },
  tooltipName: {
    fontSize: 11,
    fontWeight: 600,
    fontFamily: fonts.sans,
  },
  tooltipTask: {
    fontSize: 10,
    fontFamily: fonts.sans,
    opacity: 0.75,
    marginTop: 2,
    whiteSpace: 'normal' as const,
  },
};
