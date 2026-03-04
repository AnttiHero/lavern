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
        <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
          {/* Document outline — draws on */}
          <path
            d="M18 8 L18 56 L46 56 L46 16 L38 8 Z"
            stroke={colors.border}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              strokeDasharray: 180,
              strokeDashoffset: 180,
              animation: 'svgDrawOn 1.4s ease forwards 0.2s',
              '--path-length': '180',
            } as React.CSSProperties}
          />
          {/* Page fold */}
          <path
            d="M38 8 L38 16 L46 16"
            stroke={colors.border}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              strokeDasharray: 16,
              strokeDashoffset: 16,
              animation: 'svgDrawOn 0.4s ease forwards 1.4s',
              '--path-length': '16',
            } as React.CSSProperties}
          />
          {/* Text lines — staggered draw-on */}
          {[26, 32, 38, 44].map((y, i) => (
            <path
              key={y}
              d={`M24 ${y} L${36 + (i % 2 === 0 ? 4 : -2)} ${y}`}
              stroke={colors.textDim}
              strokeWidth="1.2"
              strokeLinecap="round"
              opacity={0.4}
              style={{
                strokeDasharray: 18,
                strokeDashoffset: 18,
                animation: `svgDrawOn 0.3s ease forwards ${1.6 + i * 0.15}s`,
                '--path-length': '18',
              } as React.CSSProperties}
            />
          ))}
          {/* Pen nib — appears last */}
          <path
            d="M10 48 L14 40 L18 48 Z"
            stroke={colors.textDim}
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.35}
            style={{
              strokeDasharray: 30,
              strokeDashoffset: 30,
              animation: 'svgDrawOn 0.5s ease forwards 2.2s',
              '--path-length': '30',
            } as React.CSSProperties}
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
