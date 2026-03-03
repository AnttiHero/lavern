/**
 * TrophyShelf — Horizontal row of earned milestone trophies.
 *
 * Renders law-themed SVG badges as the context score crosses
 * milestones (25/50/75/100). New badges enter with a fade+scale
 * animation and a brief accent glow pulse.
 */

import type { ContextMilestone } from '../hooks/useContextScore.js';
import { TROPHY_DEFINITIONS } from '../data/trophies.js';
import { colors, fonts, radii, spacing } from '../../staffing/styles/tokens.js';

interface Props {
  milestones: ContextMilestone[];
  newMilestone: number | null;
}

export function TrophyShelf({ milestones, newMilestone }: Props) {
  // Only show trophies whose milestone is reached
  const earned = TROPHY_DEFINITIONS.filter(
    t => milestones.some(m => m.threshold === t.threshold && m.reached),
  );

  if (earned.length === 0) return null;

  return (
    <div style={styles.shelf} data-testid="trophy-shelf">
      {earned.map(trophy => {
        const isNew = newMilestone === trophy.threshold;
        return (
          <div
            key={trophy.id}
            style={{
              ...styles.badge,
              ...(isNew ? {
                animation: 'trophyEnter 0.35s ease forwards, trophyGlow 1s ease 0.35s forwards',
              } : {}),
            }}
            title={trophy.description}
            data-testid={`trophy-${trophy.id}`}
          >
            <div
              style={styles.icon}
              dangerouslySetInnerHTML={{ __html: trophy.svg }}
            />
            <span style={styles.label}>{trophy.label}</span>
          </div>
        );
      })}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  shelf: {
    display: 'flex',
    gap: spacing.sm,
    flexWrap: 'wrap',
    marginTop: spacing.md,
  },
  badge: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '5px 12px 5px 8px',
    backgroundColor: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.md,
  },
  icon: {
    width: 24,
    height: 24,
    flexShrink: 0,
    color: colors.text,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 11,
    fontFamily: fonts.sans,
    fontWeight: 600,
    color: colors.textSecondary,
    letterSpacing: 0.3,
    textTransform: 'uppercase' as const,
    whiteSpace: 'nowrap' as const,
  },
};
