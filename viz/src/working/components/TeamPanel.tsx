/**
 * TeamPanel — Left sidebar showing the dynamic team roster.
 *
 * v12: Wider (280px), richer agent cards with task, elapsed time, finding counts.
 *      Orchestrator shown at top when present.
 */

import { useMemo } from 'react';
import type { AgentProfile } from '../../staffing/hooks/useAgentProfiles.js';
import type { AgentStatus, ActiveThinkingAgent } from '../hooks/useWorkingState.js';
import { AgentChip } from './AgentChip.js';
import { colors, fonts, radii } from '../../staffing/styles/tokens.js';

interface TeamPanelProps {
  team: AgentProfile[];
  agentStatuses: Map<string, AgentStatus>;
  filterByAgent: string | null;
  onFilterAgent: (role: string | null) => void;
  activeAgentCount: number;
  totalEventCount: number;
  findingCounts: Map<string, number>;
  activeThinkingAgents: Map<string, ActiveThinkingAgent>;
}

export function TeamPanel({
  team,
  agentStatuses,
  filterByAgent,
  onFilterAgent,
  activeAgentCount,
  totalEventCount,
  findingCounts,
  activeThinkingAgents,
}: TeamPanelProps) {
  // Split orchestrator from team members
  const { orchestrators, members } = useMemo(() => {
    const orch: AgentProfile[] = [];
    const mem: AgentProfile[] = [];
    for (const p of team) {
      if (p.category === 'orchestrator') orch.push(p);
      else mem.push(p);
    }
    return { orchestrators: orch, members: mem };
  }, [team]);

  const totalFindings = useMemo(() => {
    let sum = 0;
    for (const c of findingCounts.values()) sum += c;
    return sum;
  }, [findingCounts]);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>Your Team</h3>
        <span style={styles.count}>{team.length}</span>
      </div>

      {filterByAgent && (
        <button
          onClick={() => onFilterAgent(null)}
          style={styles.clearFilter}
        >
          Show all agents
        </button>
      )}

      {/* Orchestrator section */}
      {orchestrators.length > 0 && (
        <div style={styles.orchestratorSection}>
          <span style={styles.sectionLabel}>Team Lead</span>
          {orchestrators.map(profile => (
            <AgentChip
              key={profile.role}
              profile={profile}
              status={agentStatuses.get(profile.role)}
              isFiltered={filterByAgent === profile.role}
              onClick={() =>
                onFilterAgent(filterByAgent === profile.role ? null : profile.role)
              }
              thinkingAgent={activeThinkingAgents.get(profile.role)}
              findingCount={findingCounts.get(profile.role) ?? 0}
            />
          ))}
        </div>
      )}

      {/* Team members */}
      <div style={styles.roster}>
        {members.length > 0 && orchestrators.length > 0 && (
          <span style={styles.sectionLabel}>Agents</span>
        )}
        {members.map(profile => (
          <AgentChip
            key={profile.role}
            profile={profile}
            status={agentStatuses.get(profile.role)}
            isFiltered={filterByAgent === profile.role}
            onClick={() =>
              onFilterAgent(filterByAgent === profile.role ? null : profile.role)
            }
            thinkingAgent={activeThinkingAgents.get(profile.role)}
            findingCount={findingCounts.get(profile.role) ?? 0}
          />
        ))}
      </div>

      <div style={styles.stats}>
        <div style={styles.statRow}>
          <span style={styles.statLabel}>Active</span>
          <span style={styles.statValue}>{activeAgentCount}</span>
        </div>
        <div style={styles.statRow}>
          <span style={styles.statLabel}>Findings</span>
          <span style={styles.statValue}>{totalFindings}</span>
        </div>
        <div style={styles.statRow}>
          <span style={styles.statLabel}>Events</span>
          <span style={styles.statValue}>{totalEventCount}</span>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: 280,
    height: '100%',
    backgroundColor: colors.bgCard,
    borderRight: `1px solid ${colors.border}`,
    display: 'flex',
    flexDirection: 'column' as const,
    flexShrink: 0,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 16px 10px',
    borderBottom: `1px solid ${colors.border}`,
  },
  title: {
    color: colors.textMuted,
    fontSize: 11,
    fontFamily: fonts.sans,
    fontWeight: 600,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
    margin: 0,
  },
  count: {
    fontSize: 11,
    color: colors.textDim,
    fontFamily: fonts.mono,
  },
  clearFilter: {
    background: colors.accentLight,
    border: `1px solid rgba(196, 93, 62, 0.2)`,
    borderRadius: radii.sm,
    color: colors.accent,
    fontFamily: fonts.sans,
    fontSize: 11,
    fontWeight: 500,
    padding: '5px 10px',
    margin: '8px 12px 0',
    cursor: 'pointer',
    textAlign: 'center' as const,
  },
  orchestratorSection: {
    padding: '8px 8px 4px',
    borderBottom: `1px solid ${colors.border}`,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 2,
  },
  sectionLabel: {
    fontSize: 9,
    fontFamily: fonts.sans,
    fontWeight: 600,
    color: colors.textDim,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
    padding: '0 10px',
    marginBottom: 2,
  },
  roster: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '8px 8px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 2,
  },
  stats: {
    padding: '10px 16px',
    borderTop: `1px solid ${colors.border}`,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 4,
  },
  statRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 10,
    color: colors.textDim,
    fontFamily: fonts.sans,
    fontWeight: 500,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.3,
  },
  statValue: {
    fontSize: 12,
    color: colors.textSecondary,
    fontFamily: fonts.mono,
    fontWeight: 500,
  },
};
