/**
 * AgentThinkingBubble — Ephemeral "agent is analyzing..." indicator.
 *
 * Shows at the bottom of the InsightFeed when agents are actively working.
 * Displays the agent's avatar with a breathing glow and animated dots.
 *
 * v18: Simplified — tool checklist removed (tool_used events now appear
 *      inline in the conversation feed via ActivityCard). The bubble
 *      is now a compact liveness indicator only.
 */

import type { ActiveThinkingAgent } from '../hooks/useWorkingState.js';
import type { AgentProfile } from '../../staffing/hooks/useAgentProfiles.js';
import { AgentAvatar } from './AgentAvatar.js';
import { colors, fonts, radii, categoryColor } from '../../staffing/styles/tokens.js';

interface AgentThinkingBubbleProps {
  agent: ActiveThinkingAgent;
  profile?: AgentProfile;
}

export function AgentThinkingBubble({ agent, profile }: AgentThinkingBubbleProps) {
  const color = profile ? categoryColor(profile.category) : colors.textMuted;
  const displayName = profile?.displayName ?? agent.role.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  return (
    <div style={styles.row}>
      <div style={{
        ...styles.avatarWrap,
        boxShadow: `0 0 8px ${color}40, 0 0 16px ${color}20`,
        animation: 'thinkingGlow 2s ease-in-out infinite',
      }}>
        <AgentAvatar role={agent.role} size="lg" profile={profile} />
      </div>

      <div style={{ ...styles.bubble, borderLeftColor: color }}>
        <div style={styles.header}>
          <span style={{ ...styles.agentName, color }}>{displayName}</span>
          <span style={styles.analyzing}>
            is analyzing
            <span style={styles.dots}>
              <span style={styles.dot1}>.</span>
              <span style={styles.dot2}>.</span>
              <span style={styles.dot3}>.</span>
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  row: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
  },
  avatarWrap: {
    borderRadius: '50%',
    flexShrink: 0,
  },
  bubble: {
    flex: 1,
    backgroundColor: colors.bgPanel,
    border: `1px solid ${colors.border}`,
    borderLeft: '3px solid',
    borderRadius: radii.md,
    padding: '10px 14px',
    minWidth: 0,
  },
  header: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 6,
  },
  agentName: {
    fontSize: 12,
    fontFamily: fonts.sans,
    fontWeight: 600,
  },
  analyzing: {
    fontSize: 12,
    fontFamily: fonts.sans,
    fontWeight: 400,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  dots: {
    display: 'inline',
    letterSpacing: 1,
  },
  dot1: {
    animation: 'dotPulse 1.4s ease-in-out 0s infinite',
  },
  dot2: {
    animation: 'dotPulse 1.4s ease-in-out 0.2s infinite',
  },
  dot3: {
    animation: 'dotPulse 1.4s ease-in-out 0.4s infinite',
  },
};
