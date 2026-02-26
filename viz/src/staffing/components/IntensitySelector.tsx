/**
 * IntensitySelector — Discrete 4-stop selector.
 *
 * Simple segmented button row — click to select. No drag.
 * Warm editorial — muted labels, clean transitions.
 */

import { colors, fonts, radii, spacing } from '../styles/tokens.js';
import type { IntensityLevel } from '../hooks/useEngagementConfig.js';

const LEVELS: {
  level: IntensityLevel;
  label: string;
  description: string;
  teamSize: number;
}[] = [
  { level: 'quick', label: 'Swift', description: 'Lean and fast', teamSize: 3 },
  { level: 'standard', label: 'Balanced', description: 'Right-sized for most matters', teamSize: 6 },
  { level: 'thorough', label: 'Thorough', description: 'Full coverage, high confidence', teamSize: 10 },
  { level: 'maximal', label: 'Full Force', description: 'Every resource. Every angle.', teamSize: 14 },
];

interface Props {
  intensity: IntensityLevel;
  onSelect: (level: IntensityLevel) => void;
}

export function IntensitySelector({ intensity, onSelect }: Props) {
  const activeIndex = LEVELS.findIndex(l => l.level === intensity);
  const activeLevel = LEVELS[activeIndex];

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.label}>Depth</span>
      </div>

      {/* Segmented button row */}
      <div style={styles.buttonRow}>
        {LEVELS.map((l, i) => {
          const isActive = l.level === intensity;
          const isLast = i === LEVELS.length - 1;
          return (
            <button
              key={l.level}
              onClick={() => onSelect(l.level)}
              style={{
                ...styles.button,
                backgroundColor: isActive ? colors.text : 'transparent',
                color: isActive ? '#fff' : colors.textSecondary,
                fontWeight: isActive ? 600 : 400,
                borderRight: isLast ? 'none' : `1px solid ${colors.border}`,
              }}
            >
              {l.label}
            </button>
          );
        })}
      </div>

      {/* Description */}
      <div style={styles.description}>
        {activeLevel.description}
        <span style={styles.teamHint}> · ~{activeLevel.teamSize} agents</span>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: 11,
    fontFamily: fonts.sans,
    fontWeight: 500,
    color: colors.textDim,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  buttonRow: {
    display: 'flex',
    gap: 0,
    borderRadius: radii.md,
    overflow: 'hidden',
    border: `1px solid ${colors.border}`,
  },
  button: {
    flex: 1,
    padding: '8px 4px',
    border: 'none',
    backgroundColor: 'transparent',
    fontFamily: fonts.sans,
    fontSize: 12,
    cursor: 'pointer',
    transition: 'background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease',
  },
  description: {
    fontSize: 12,
    fontFamily: fonts.sans,
    color: colors.textMuted,
    marginTop: 2,
  },
  teamHint: {
    color: colors.textDim,
  },
};
