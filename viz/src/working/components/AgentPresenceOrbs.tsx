/**
 * AgentPresenceOrbs — Horizontal row of mini agent avatars representing team members.
 *
 * v2: Orbs respond to real events:
 *   - Entrance animation when agent first appears
 *   - Active glow and float when agent is working
 *   - Tooltip shows latest tool action
 *   - Completed agents show green checkmark with brief flash
 */

import { useState, useRef, useEffect } from 'react';
import type { AgentProfile } from '../../staffing/hooks/useAgentProfiles.js';
import type { AgentStatus, ActiveThinkingAgent } from '../hooks/useWorkingState.js';
import { AgentAvatar } from './AgentAvatar.js';
import { categoryColor, colors, fonts } from '../../staffing/styles/tokens.js';
import { formatToolAction } from '../utils/formatToolAction.js';

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

  // Track which agents have been seen to trigger entrance animations
  const seenAgentsRef = useRef(new Set<string>());
  const [newAgents, setNewAgents] = useState(new Set<string>());

  // Only show agents that have actually been dispatched (have a status or are active)
  const visibleTeam = team.filter(agent =>
    agentStatuses.has(agent.role) || activeThinkingAgents.has(agent.role)
  );

  // Detect newly appeared agents for entrance animation
  useEffect(() => {
    const currentlyVisible = new Set(visibleTeam.map(a => a.role));
    const brandNew = new Set<string>();
    for (const role of currentlyVisible) {
      if (!seenAgentsRef.current.has(role)) {
        brandNew.add(role);
        seenAgentsRef.current.add(role);
      }
    }
    if (brandNew.size > 0) {
      setNewAgents(brandNew);
      // Clear "new" state after entrance animation completes
      const timer = setTimeout(() => setNewAgents(new Set()), 600);
      return () => clearTimeout(timer);
    }
  }, [visibleTeam]);

  return (
    <div style={styles.container}>
      {visibleTeam.map((agent, idx) => {
        const status = agentStatuses.get(agent.role);
        const isActive = activeThinkingAgents.has(agent.role);
        const isComplete = status?.status === 'complete';
        const isNew = newAgents.has(agent.role);
        const color = categoryColor(agent.category);
        const thinkingAgent = activeThinkingAgents.get(agent.role);

        // Get latest tool action for tooltip
        const latestTool = thinkingAgent?.toolsUsed?.[thinkingAgent.toolsUsed.length - 1];
        const toolDesc = latestTool ? formatToolAction(latestTool) : null;

        const opacity = isActive ? 1 : isComplete ? 0.65 : 0.5;
        const glowShadow = isActive
          ? `0 0 6px ${color}, 0 0 12px ${color}40`
          : 'none';

        // Entrance animation: scale up from 0
        const entranceStyle = isNew ? {
          animation: 'orbEntrance 0.5s ease-out forwards',
        } : {};

        return (
          <div
            key={agent.role}
            style={{
              position: 'relative' as const,
              display: 'inline-block',
              ...entranceStyle,
            }}
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
            <div style={{
              ...styles.tooltip,
              opacity: hoveredRole === agent.role ? 1 : 0,
              transform: hoveredRole === agent.role
                ? 'translateX(-50%) translateY(0)'
                : 'translateX(-50%) translateY(4px)',
              pointerEvents: 'none' as const,
              transition: 'opacity 0.2s ease, transform 0.2s ease',
            }}>
              <div style={styles.tooltipName}>{agent.displayName}</div>
              {isActive && toolDesc && (
                <div style={styles.tooltipTask}>{toolDesc}</div>
              )}
              {isActive && !toolDesc && thinkingAgent?.task && (
                <div style={styles.tooltipTask}>
                  {thinkingAgent.task.length > 60
                    ? thinkingAgent.task.slice(0, 57) + '...'
                    : thinkingAgent.task}
                </div>
              )}
              {isComplete && <div style={styles.tooltipTask}>Completed</div>}
              {!isActive && !isComplete && <div style={styles.tooltipTask}>Waiting</div>}
            </div>
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
    backgroundColor: 'rgba(26, 26, 26, 0.92)',
    backdropFilter: 'blur(8px)',
    color: colors.bg,
    borderRadius: 6,
    padding: '6px 10px',
    whiteSpace: 'normal' as const,
    zIndex: 100,
    minWidth: 100,
    maxWidth: 220,
    textAlign: 'center' as const,
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
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
