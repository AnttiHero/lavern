/**
 * AgentPresenceOrbs — Horizontal row of colored circles representing team members.
 *
 * Replaces the 280px TeamPanel sidebar with a compact ~200px horizontal strip.
 * Each orb glows when its agent is active, dims when idle/complete.
 * Hover shows agent name + current task in a tooltip.
 */

import { useState } from 'react';
import type { AgentProfile } from '../../staffing/hooks/useAgentProfiles.js';
import type { AgentStatus, ActiveThinkingAgent } from '../hooks/useWorkingState.js';
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

  return (
    <div style={styles.container}>
      {team.map((agent, idx) => {
        const status = agentStatuses.get(agent.role);
        const isActive = activeThinkingAgents.has(agent.role);
        const isComplete = status?.status === 'complete';
        const color = categoryColor(agent.category);
        const thinkingAgent = activeThinkingAgents.get(agent.role);

        const opacity = isActive ? 1 : isComplete ? 0.6 : 0.25;
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
            <div
              style={{
                width: 20,
                height: 20,
                borderRadius: '50%',
                backgroundColor: isActive || isComplete ? color : colors.border,
                opacity,
                boxShadow: glowShadow,
                transition: 'opacity 0.4s ease, box-shadow 0.4s ease, background-color 0.4s ease',
                cursor: 'default',
                animation: isActive ? `orbFloat 3s ease-in-out ${idx * 0.2}s infinite` : 'none',
              }}
            />

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
