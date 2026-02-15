/**
 * EmptyState — Shown when no events have arrived yet or in demo mode.
 */

import { colors, fonts } from '../../staffing/styles/tokens.js';

interface EmptyStateProps {
  isConnected: boolean;
}

export function EmptyState({ isConnected }: EmptyStateProps) {
  return (
    <div style={styles.container}>
      <div style={styles.icon}>
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
          <circle cx="24" cy="24" r="22" stroke={colors.border} strokeWidth="2" />
          <path
            d="M16 20L24 28L32 20"
            stroke={colors.textDim}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <h3 style={styles.title}>
        {isConnected ? 'Waiting for the team to begin...' : 'No session connected'}
      </h3>
      <p style={styles.description}>
        {isConnected
          ? 'Events will appear here as your agents start working. Each finding, challenge, and decision will be visible in real time.'
          : 'Running in demo mode — no backend connected. Connect to a live session or go back to start a new engagement.'
        }
      </p>
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
  icon: {
    marginBottom: 20,
    opacity: 0.5,
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
  },
};
