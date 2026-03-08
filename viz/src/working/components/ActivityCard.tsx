/**
 * ActivityCard — Speech bubble chat messages for agent activity events.
 *
 * Renders agent_start, agent_stop, and tool_used stream cards as
 * compact speech bubbles with agent avatar. Lighter weight than
 * FindingCard but still visually engaging — like a team chat room.
 *
 * agent_start → "{Avatar} [bubble: 'Hi! I'm going to analyze the document structure']"
 * tool_used   → "{Avatar} [bubble: '📄 Reading your document...']"
 * agent_stop  → "{Avatar} [bubble: '✓ Done! (3.2s)']"
 */

import type { StreamCard } from '../hooks/useWorkingState.js';
import type { AgentProfile } from '../../staffing/hooks/useAgentProfiles.js';
import { AgentAvatar } from './AgentAvatar.js';
import { formatToolName, toolIcon, INTERESTING_TOOLS } from '../utils/toolLabels.js';
import { colors, fonts, radii, categoryColor } from '../../staffing/styles/tokens.js';

type AgentStartCard = Extract<StreamCard, { kind: 'agent_start' }>;
type AgentStopCard = Extract<StreamCard, { kind: 'agent_stop' }>;
type ToolUsedCard = Extract<StreamCard, { kind: 'tool_used' }>;

interface ActivityCardProps {
  card: AgentStartCard | AgentStopCard | ToolUsedCard;
  profileMap: Map<string, AgentProfile>;
}

/** Warm, conversational greetings for agent_start. */
const GREETING_VERBS = [
  'On it!',
  'Let me take a look.',
  'Starting now.',
  'I\'ll handle this.',
  'Working on it!',
];

function pickGreeting(role: string, timestamp: string): string {
  // Mix role name + timestamp so the same agent says different things each time
  const seed = role + timestamp;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  return GREETING_VERBS[Math.abs(hash) % GREETING_VERBS.length];
}

function resolveAgent(role: string, profileMap: Map<string, AgentProfile>) {
  const profile = profileMap.get(role);
  const displayName = profile?.displayName ?? role.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const color = profile ? categoryColor(profile.category) : colors.textMuted;
  return { profile, displayName, color };
}

export function ActivityCard({ card, profileMap }: ActivityCardProps) {
  if (card.kind === 'agent_start') {
    const { profile, displayName, color } = resolveAgent(card.role, profileMap);
    const task = card.task.length > 70 ? card.task.slice(0, 67) + '...' : card.task;
    const greeting = pickGreeting(card.role, card.timestamp);

    return (
      <div style={styles.row}>
        <AgentAvatar role={card.role} size="sm" profile={profile} />
        <div style={styles.bubbleCol}>
          <span style={{ ...styles.name, color }}>{displayName}</span>
          <div style={{ ...styles.bubble, borderColor: `${color}30` }}>
            <span style={styles.greeting}>{greeting}</span>{' '}
            <span style={styles.taskText}>{task}</span>
          </div>
        </div>
      </div>
    );
  }

  if (card.kind === 'agent_stop') {
    const { profile, displayName, color } = resolveAgent(card.role, profileMap);
    const duration = (card.durationMs / 1000).toFixed(1);

    return (
      <div style={styles.row}>
        <AgentAvatar role={card.role} size="sm" profile={profile} />
        <div style={styles.bubbleCol}>
          <span style={{ ...styles.name, color }}>{displayName}</span>
          <div style={{ ...styles.doneBubble, borderColor: `${colors.success}30` }}>
            <span style={styles.checkmark}>{'\u2713'}</span>
            <span style={styles.doneText}>Done!</span>
            <span style={styles.duration}>{duration}s</span>
          </div>
        </div>
      </div>
    );
  }

  // tool_used
  const agentRole = card.agent ?? '';
  if (!agentRole) return null;

  // Skip infrastructure tools (they produce their own cards)
  if (!INTERESTING_TOOLS.has(card.tool)) return null;

  const { profile, displayName, color } = resolveAgent(agentRole, profileMap);
  const icon = toolIcon(card.tool);
  const label = formatToolName(card.tool);

  return (
    <div style={styles.row}>
      <AgentAvatar role={agentRole} size="sm" profile={profile} />
      <div style={styles.bubbleCol}>
        <span style={{ ...styles.name, color }}>{displayName}</span>
        <div style={{ ...styles.toolBubble, borderColor: `${color}20` }}>
          <span style={styles.toolEmoji}>{icon}</span>
          <span style={styles.toolLabel}>{label}...</span>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  row: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    padding: '2px 0',
  },
  bubbleCol: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 2,
    minWidth: 0,
    flex: 1,
  },
  name: {
    fontSize: 11,
    fontFamily: fonts.sans,
    fontWeight: 600,
    lineHeight: 1,
  },
  bubble: {
    display: 'inline-block',
    backgroundColor: colors.bgCard,
    border: '1px solid',
    borderRadius: `2px ${radii.md} ${radii.md} ${radii.md}`,
    padding: '6px 10px',
    maxWidth: '85%',
  },
  greeting: {
    fontSize: 12,
    fontFamily: fonts.sans,
    fontWeight: 500,
    color: colors.textSecondary,
  },
  taskText: {
    fontSize: 12,
    fontFamily: fonts.sans,
    fontWeight: 400,
    color: colors.textMuted,
    fontStyle: 'italic' as const,
  },
  doneBubble: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    backgroundColor: `rgba(74, 124, 80, 0.06)`,
    border: '1px solid',
    borderRadius: `2px ${radii.md} ${radii.md} ${radii.md}`,
    padding: '5px 10px',
  },
  checkmark: {
    fontSize: 13,
    fontWeight: 700,
    color: colors.success,
  },
  doneText: {
    fontSize: 12,
    fontFamily: fonts.sans,
    fontWeight: 500,
    color: colors.success,
  },
  duration: {
    fontSize: 10,
    fontFamily: fonts.mono,
    color: colors.textDim,
  },
  toolBubble: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.bgPanel,
    border: '1px solid',
    borderRadius: `2px ${radii.md} ${radii.md} ${radii.md}`,
    padding: '5px 10px',
  },
  toolEmoji: {
    fontSize: 13,
    flexShrink: 0,
  },
  toolLabel: {
    fontSize: 12,
    fontFamily: fonts.sans,
    fontWeight: 400,
    color: colors.textMuted,
  },
};
