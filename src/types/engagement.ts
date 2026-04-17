/**
 * Engagement Configuration Types — Investment dial, intensity levels, YOLO mode.
 *
 * Defines the intensity profiles that control how The Shem operates:
 * - Quick: Minimal team, low budget, no gates (fast & cheap)
 * - Standard: Balanced team, critical gates only (default)
 * - Thorough: Large team, all standard gates (high assurance)
 * - Maximal: Full firm, all gates + extra review (maximum quality)
 *
 * Each intensity level maps to a Claude API `effort` parameter:
 *   quick → low, standard → medium, thorough → high, maximal → max
 *
 * The frontend EngagementConfigurator uses these profiles to recommend
 * team composition and set session options.
 */

// ── Effort Level (Claude API) ────────────────────────────────────────────

/**
 * Claude API effort levels — controls thinking depth and token spend.
 * @see https://platform.claude.com/docs/en/build-with-claude/effort
 */
export type EffortLevel = 'low' | 'medium' | 'high' | 'max';

// ── Intensity Level ──────────────────────────────────────────────────────

export type IntensityLevel = 'quick' | 'standard' | 'thorough' | 'maximal';

export interface IntensityProfile {
  level: IntensityLevel;
  label: string;
  description: string;
  /** Claude API effort level — controls thinking depth and token spend */
  effort: EffortLevel;
  /** Budget multiplier relative to standard (1.0) */
  budgetMultiplier: number;
  /** Suggested number of agents for this intensity */
  suggestedTeamSize: number;
  /** How many gates should fire */
  gateFrequency: 'none' | 'critical' | 'standard' | 'all';
  /** Estimated wall-clock time range in minutes */
  estimatedMinutes: [number, number];
  /** Color hint for UI (hex) */
  color: string;
}

export const INTENSITY_PROFILES: Record<IntensityLevel, IntensityProfile> = {
  quick: {
    level: 'quick',
    label: 'Quick',
    description: 'Minimal team, low cost. Best for simple queries and fast turnaround.',
    effort: 'low',
    budgetMultiplier: 0.3,
    suggestedTeamSize: 3,
    gateFrequency: 'none',
    estimatedMinutes: [2, 5],
    color: '#66BB6A',
  },
  standard: {
    level: 'standard',
    label: 'Standard',
    description: 'Balanced team with critical-only gates. The default for most engagements.',
    effort: 'medium',
    budgetMultiplier: 1.0,
    suggestedTeamSize: 6,
    gateFrequency: 'critical',
    estimatedMinutes: [10, 25],
    color: '#4FC3F7',
  },
  thorough: {
    level: 'thorough',
    label: 'Thorough',
    description: 'Full coverage with standard gates. For complex matters requiring high assurance.',
    effort: 'high',
    budgetMultiplier: 2.0,
    suggestedTeamSize: 10,
    gateFrequency: 'standard',
    estimatedMinutes: [25, 60],
    color: '#CE93D8',
  },
  maximal: {
    level: 'maximal',
    label: 'Maximal',
    description: 'Full firm. Every gate, every specialist, every angle.',
    effort: 'max',
    budgetMultiplier: 4.0,
    suggestedTeamSize: 14,
    gateFrequency: 'all',
    estimatedMinutes: [60, 180],
    color: '#FFD700',
  },
};

// ── Engagement Config ────────────────────────────────────────────────────

export interface EngagementConfig {
  workflowId: string;
  intensity: IntensityLevel;
  budgetUsd: number;
  yoloMode: boolean;
  recommendedRoles?: string[];
}

// ── Helper ───────────────────────────────────────────────────────────────

/**
 * Get the default budget for an intensity level.
 * Based on the multiplier × $10 base.
 */
export function defaultBudgetForIntensity(level: IntensityLevel): number {
  return INTENSITY_PROFILES[level].budgetMultiplier * 10;
}

/**
 * Map an intensity level to a Claude API effort level.
 *
 * quick → low    (fast, cheap, fewer tokens)
 * standard → medium (balanced)
 * thorough → high   (deep reasoning, default Claude behavior)
 * maximal → max    (white-shoe effort — no token limits, Opus 4.7 only)
 */
export function effortForIntensity(level: IntensityLevel): EffortLevel {
  return INTENSITY_PROFILES[level].effort;
}
