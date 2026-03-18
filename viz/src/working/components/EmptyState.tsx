/**
 * EmptyState — Warm team greeting when waiting for events.
 *
 * v18: Replaced cold SVG document icon with team avatars and
 * personalized greeting text. Makes the user feel like they're
 * in a room with their legal team, about to get started.
 */

import type { AgentProfile } from '../../staffing/hooks/useAgentProfiles.js';
import { AgentAvatar } from './AgentAvatar.js';
import { colors, fonts } from '../../staffing/styles/tokens.js';

interface EmptyStateProps {
  isConnected: boolean;
  team?: AgentProfile[];
}

export function EmptyState({ isConnected, team }: EmptyStateProps) {
  // Pick up to 4 team members for the avatar row
  const visibleTeam = (team ?? []).slice(0, 4);
  const teamNames = visibleTeam.map(p => p.displayName.split(' ')[0]);

  const nameList = teamNames.length > 2
    ? `${teamNames.slice(0, -1).join(', ')}, and ${teamNames[teamNames.length - 1]}`
    : teamNames.length > 0
      ? teamNames.join(' and ')
      : '';

  return (
    <div style={styles.container}>
      {/* Team avatar row */}
      {visibleTeam.length > 0 && (
        <div style={styles.avatarRow}>
          {visibleTeam.map((profile, i) => (
            <div
              key={profile.role}
              style={{
                marginLeft: i > 0 ? -8 : 0,
                zIndex: visibleTeam.length - i,
                animation: `fadeSlideUp 0.4s ease ${0.1 + i * 0.1}s both`,
              }}
            >
              <AgentAvatar role={profile.role} size="lg" profile={profile} />
            </div>
          ))}
        </div>
      )}

      <h3 style={styles.title}>
        {isConnected
          ? visibleTeam.length > 0
            ? 'Your team is getting ready...'
            : 'Waiting for the team to begin...'
          : 'Welcome to Lavern'
        }
      </h3>

      <p style={styles.description}>
        {isConnected
          ? nameList
            ? `${nameList} ${teamNames.length === 1 ? 'is' : 'are'} reviewing your briefing. They\u2019ll share their findings here as they work.`
            : 'Events will appear here as your agents start working. Each finding, challenge, and decision will be visible in real time.'
          : 'Running in demo mode \u2014 no backend connected. Connect to a live session or go back to start a new engagement.'
        }
      </p>

      {isConnected && (
        <p style={styles.reassurance}>
          This is completely normal \u2014 sit back and watch the magic happen {'\u2728'}
        </p>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 40px',
    textAlign: 'center' as const,
  },
  avatarRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontFamily: fonts.serif,
    fontWeight: 300,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  description: {
    fontSize: 13,
    fontFamily: fonts.sans,
    fontWeight: 400,
    color: colors.textDim,
    lineHeight: '1.6',
    maxWidth: 400,
    marginBottom: 12,
  },
  reassurance: {
    fontSize: 12,
    fontFamily: fonts.serif,
    fontWeight: 400,
    fontStyle: 'italic' as const,
    color: colors.textDim,
    opacity: 0.7,
    margin: 0,
  },
};
