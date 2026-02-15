/**
 * TeamPanel — Left sidebar showing the dynamic team roster.
 *
 * Reads the actual team from useTeamRoster (sessionStorage).
 * Click an agent to filter the ThinkingStream.
 */

import type { AgentProfile } from '../../staffing/hooks/useAgentProfiles.js';
import type { AgentStatus } from '../hooks/useWorkingState.js';
import { AgentChip } from './AgentChip.js';
import { colors, fonts, radii } from '../../staffing/styles/tokens.js';

interface TeamPanelProps {
  team: AgentProfile[];
  agentStatuses: Map<string, AgentStatus>;
  filterByAgent: string | null;
  onFilterAgent: (role: string | null) => void;
  activeAgentCount: number;
  totalEventCount: number;
}

export function TeamPanel({
  team,
  agentStatuses,
  filterByAgent,
  onFilterAgent,
  activeAgentCount,
  totalEventCount,
}: TeamPanelProps) {
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

      <div style={styles.roster}>
        {team.map(profile => (
          <AgentChip
            key={profile.role}
            profile={profile}
            status={agentStatuses.get(profile.role)}
            isFiltered={filterByAgent === profile.role}
            onClick={() =>
              onFilterAgent(filterByAgent === profile.role ? null : profile.role)
            }
          />
        ))}
      </div>

      <div style={styles.stats}>
        <div style={styles.statRow}>
          <span style={styles.statLabel}>Active</span>
          <span style={styles.statValue}>{activeAgentCount}</span>
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
    width: 240,
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
