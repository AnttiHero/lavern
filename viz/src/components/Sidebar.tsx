/**
 * Sidebar — Agent roster with status indicators.
 *
 * Warm editorial design — Inter font, white background, muted accents.
 * Shows agents with their current status (idle/working/talking),
 * event count, and color-coded role.
 */

import { useEffect, useState } from 'react';
import type { ShemEvent, AgentRole } from '../types/events.js';
import { AGENT_COLORS, AGENT_LABELS } from '../types/events.js';
import { colors, fonts, radii } from '../staffing/styles/tokens.js';

interface AgentInfo {
  role: string;
  status: 'idle' | 'working' | 'talking' | 'active';
  eventCount: number;
  lastEvent?: string;
}

const ALL_ROLES: string[] = [
  'design-reviewer',
  'ethics-auditor',
  'service-designer',
  'plain-language-specialist',
  'client-proxy',
  'transformation-specialist',
  'meaning-guardian',
  'synthesis-editor',
];

interface SidebarProps {
  events: ShemEvent[];
}

export function Sidebar({ events }: SidebarProps) {
  const [agentInfos, setAgentInfos] = useState<Map<string, AgentInfo>>(new Map());

  useEffect(() => {
    const infos = new Map<string, AgentInfo>();

    // Initialize all agents
    for (const role of ALL_ROLES) {
      infos.set(role, { role, status: 'idle', eventCount: 0 });
    }

    // Process events to update statuses
    const activeAgents = new Set<string>();

    for (const event of events) {
      if (event.type === 'agent_start') {
        activeAgents.add(event.role);
        const info = infos.get(event.role);
        if (info) {
          info.status = 'active';
          info.eventCount++;
          info.lastEvent = 'Started';
        }
      } else if (event.type === 'agent_stop') {
        activeAgents.delete(event.role);
        const info = infos.get(event.role);
        if (info) {
          info.status = 'idle';
          info.eventCount++;
          info.lastEvent = `Done (${(event.durationMs / 1000).toFixed(1)}s)`;
        }
      } else if (event.type === 'finding_posted') {
        const info = infos.get(event.agent);
        if (info) {
          info.status = 'talking';
          info.eventCount++;
          info.lastEvent = `[${event.severity}] ${event.category}`;
        }
      } else if (event.type === 'challenge_posted') {
        const info = infos.get(event.challenger);
        if (info) {
          info.status = 'talking';
          info.eventCount++;
          info.lastEvent = 'Challenge!';
        }
      }
    }

    setAgentInfos(infos);
  }, [events]);

  return (
    <div style={styles.container}>
      <h3 style={styles.title}>Agents</h3>
      <div style={styles.roster}>
        {ALL_ROLES.map((role) => {
          const info = agentInfos.get(role) || { role, status: 'idle' as const, eventCount: 0 };
          const color = `#${(AGENT_COLORS[role] || 0xcccccc).toString(16).padStart(6, '0')}`;

          return (
            <div key={role} style={styles.agentCard}>
              <div style={styles.agentHeader}>
                <div
                  style={{
                    ...styles.colorDot,
                    backgroundColor: color,
                  }}
                />
                <span style={styles.agentName}>
                  {AGENT_LABELS[role] || role}
                </span>
                <span
                  style={{
                    ...styles.statusBadge,
                    backgroundColor: statusBg[info.status],
                    color: statusFg[info.status],
                  }}
                >
                  {info.status}
                </span>
              </div>
              {info.lastEvent && (
                <div style={styles.lastEvent}>{info.lastEvent}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const statusBg: Record<string, string> = {
  idle: colors.bgPanel,
  active: 'rgba(74, 124, 80, 0.1)',
  working: 'rgba(46, 125, 156, 0.1)',
  talking: 'rgba(184, 134, 11, 0.1)',
};

const statusFg: Record<string, string> = {
  idle: colors.textDim,
  active: colors.success,
  working: colors.sonnet,
  talking: colors.warning,
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: 200,
    height: '100%',
    backgroundColor: colors.bgCard,
    borderRight: `1px solid ${colors.border}`,
    padding: 12,
    overflowY: 'auto',
    flexShrink: 0,
  },
  title: {
    color: colors.textMuted,
    fontSize: 11,
    fontFamily: fonts.sans,
    fontWeight: 600,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 12,
    paddingBottom: 8,
    borderBottom: `1px solid ${colors.border}`,
  },
  roster: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 4,
  },
  agentCard: {
    backgroundColor: colors.bgPanel,
    borderRadius: radii.sm,
    padding: '8px 10px',
  },
  agentHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  colorDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    flexShrink: 0,
  },
  agentName: {
    flex: 1,
    fontSize: 11,
    color: colors.textSecondary,
    fontFamily: fonts.sans,
    fontWeight: 500,
  },
  statusBadge: {
    fontSize: 9,
    padding: '1px 6px',
    borderRadius: radii.pill,
    fontFamily: fonts.sans,
    fontWeight: 500,
    textTransform: 'capitalize' as const,
  },
  lastEvent: {
    fontSize: 10,
    color: colors.textDim,
    fontFamily: fonts.sans,
    marginTop: 4,
    paddingLeft: 14,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
};
