/**
 * Quality Baseline Types — Statistical expectations per document type.
 *
 * Baselines are computed from report cards across sessions.
 * Minimum 3 sessions before establishing a baseline.
 *
 * Used by:
 * - check_against_baseline: Compare a session vs expected quality
 * - run_regression_test: Historical comparison
 * - get_quality_trend: Quality over time
 */

// ── Quality Baseline ────────────────────────────────────────────────────

export interface QualityBaseline {
  documentType: string;
  jurisdiction: string;
  sampleSize: number;
  lastUpdated: string;

  expectedScores: {
    dimension: string;
    mean: number;
    stdDev: number;
    min: number;
    max: number;
  }[];

  expectedImprovement: {
    dimension: string;
    meanDelta: number;
    minDelta: number;
  }[];

  expectedVerificationPassRate: number;
  expectedResolutionRate: number;

  expectedCostRange: {
    min: number;
    max: number;
    mean: number;
  };

  expectedDurationRange: {
    minMs: number;
    maxMs: number;
    meanMs: number;
  };
}

// ── Baseline Violations ─────────────────────────────────────────────────

export interface BaselineViolation {
  sessionId: string;
  timestamp: string;
  dimension: string;
  metric: string;
  expected: { min: number; max: number };
  actual: number;
  deviationSigma: number; // How many standard deviations from mean
  severity: 'warning' | 'regression';
}

// ── Quality Trend ───────────────────────────────────────────────────────

export interface QualityTrendPoint {
  sessionId: string;
  timestamp: string;
  overallImprovement: number;
  verificationPassRate: number;
  costUsd: number;
  durationMs: number;
  dimensions: { dimension: string; afterScore: number; delta: number }[];
}

export interface QualityTrend {
  documentType: string;
  jurisdiction: string;
  points: QualityTrendPoint[];
  direction: 'improving' | 'stable' | 'declining';
  averageImprovement: number;
}
