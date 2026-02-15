/**
 * ContextMeter — Horizontal progress bar with milestone markers.
 *
 * Shows the context completeness score (0–100) as a warm progress bar
 * with milestone dots at 25/50/75/100. Celebrates milestone crossings
 * with a confetti burst.
 */

import { useEffect, useRef } from 'react';
import type { ContextScoreBreakdown, ContextMilestone } from '../hooks/useContextScore.js';
import { TrophyShelf } from './TrophyShelf.js';
import { colors, fonts, radii, spacing } from '../../staffing/styles/tokens.js';

interface Props {
  breakdown: ContextScoreBreakdown;
  milestones: ContextMilestone[];
  newMilestone: number | null;
}

// ── Color thresholds ─────────────────────────────────────────────────────

function barColor(score: number): string {
  if (score >= 75) return colors.accent;
  if (score >= 50) return colors.success;
  if (score >= 25) return colors.warning;
  return colors.textDim;
}

function statusLabel(score: number): string {
  if (score >= 75) return 'Exceptional \u2014 your team will do their best work';
  if (score >= 50) return 'Strong briefing';
  if (score >= 25) return 'Good foundation';
  return 'Getting started';
}

// ── Confetti ─────────────────────────────────────────────────────────────

async function fireConfetti(grand = false) {
  try {
    const { default: confetti } = await import('canvas-confetti');
    confetti({
      particleCount: grand ? 120 : 60,
      spread: grand ? 80 : 55,
      origin: { x: 0.5, y: 0.3 },
      colors: grand
        ? [colors.accent, colors.success, colors.warning, '#F5D0A9', '#E8DDD3']
        : [colors.accent, colors.success, '#F5D0A9', '#E8DDD3'],
      gravity: 1.2,
      decay: 0.92,
      scalar: grand ? 1.0 : 0.8,
    });
  } catch {
    // canvas-confetti not available — degrade silently
  }
}

export function ContextMeter({ breakdown, milestones, newMilestone }: Props) {
  const prevMilestoneRef = useRef<number | null>(null);

  // Fire confetti on milestone crossing (grand burst at 100%)
  useEffect(() => {
    if (newMilestone && newMilestone !== prevMilestoneRef.current && newMilestone >= 75) {
      prevMilestoneRef.current = newMilestone;
      fireConfetti(newMilestone >= 100);
    }
  }, [newMilestone]);

  const score = breakdown.total;
  const color = barColor(score);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.label}>Context Score</span>
        <span style={{ ...styles.score, color }}>{score}</span>
      </div>

      {/* Progress bar with milestones */}
      <div style={styles.barTrack}>
        <div
          style={{
            ...styles.barFill,
            width: `${Math.min(100, score)}%`,
            backgroundColor: color,
          }}
        />

        {/* Milestone dots */}
        {milestones.map(m => (
          <div
            key={m.threshold}
            style={{
              ...styles.milestoneDot,
              left: `${m.threshold}%`,
              backgroundColor: m.reached ? color : colors.border,
              borderColor: m.reached ? color : colors.border,
            }}
            title={m.label}
          />
        ))}
      </div>

      {/* Status label */}
      <div style={{ ...styles.status, color }}>
        {statusLabel(score)}
      </div>

      {/* Trophy badges */}
      <TrophyShelf milestones={milestones} newMilestone={newMilestone} />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    marginBottom: spacing.lg,
    padding: `${spacing.md}px ${spacing.lg}px`,
    backgroundColor: colors.bgCard,
    borderRadius: radii.md,
    border: `1px solid ${colors.border}`,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  label: {
    fontSize: 11,
    fontFamily: fonts.sans,
    fontWeight: 600,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  score: {
    fontSize: 20,
    fontFamily: fonts.mono,
    fontWeight: 600,
    letterSpacing: -0.5,
  },
  barTrack: {
    position: 'relative',
    height: 6,
    backgroundColor: colors.bgPanel,
    borderRadius: 3,
    overflow: 'visible',
  },
  barFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: '100%',
    borderRadius: 3,
    transition: 'width 0.4s ease, background-color 0.4s ease',
  },
  milestoneDot: {
    position: 'absolute',
    top: '50%',
    width: 10,
    height: 10,
    borderRadius: '50%',
    border: '2px solid',
    backgroundColor: '#fff',
    transform: 'translate(-50%, -50%)',
    transition: 'background-color 0.3s ease, color 0.3s ease, border-color 0.3s ease',
    zIndex: 1,
  },
  status: {
    marginTop: 8,
    fontSize: 12,
    fontFamily: fonts.sans,
    fontWeight: 500,
    transition: 'color 0.3s ease',
  },
};
