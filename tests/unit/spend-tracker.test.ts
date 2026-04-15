/**
 * Unit tests — Global Daily Spend Tracker (src/utils/spend-tracker.ts).
 *
 * Focuses on the multi-threshold trajectory alert behavior added in the
 * cost-observability pass. We don't cover the DB-hydration branch here; that
 * path runs on first use and is covered by the integration smoke test.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  _resetForTesting,
  recordSpend,
  getDailySpendStats,
  checkDailySpendCap,
} from '../../src/utils/spend-tracker.js';
import { config } from '../../src/config.js';

describe('spend-tracker', () => {
  beforeEach(() => {
    _resetForTesting();
  });

  it('starts at zero with no thresholds fired', () => {
    const stats = getDailySpendStats();
    expect(stats.totalUsd).toBe(0);
    expect(stats.pct).toBe(0);
    expect(stats.thresholdsFired).toEqual([]);
    expect(stats.nextThresholdPct).toBe(50);
    expect(stats.capReached).toBe(false);
  });

  it('records positive spend and rejects non-finite / non-positive values', () => {
    recordSpend(1.5);
    recordSpend(0);
    recordSpend(-3);
    recordSpend(Number.NaN);
    recordSpend(Number.POSITIVE_INFINITY);
    expect(getDailySpendStats().totalUsd).toBeCloseTo(1.5, 5);
  });

  it('fires alerts in order 50% → 75% → 90% and never repeats within the day', () => {
    const cap = config.dailySpendCapUsd;

    // Cross 50% only
    recordSpend(cap * 0.55);
    let stats = getDailySpendStats();
    expect(stats.thresholdsFired).toEqual(['50%']);
    expect(stats.nextThresholdPct).toBe(75);

    // Another small bump under 75% → no new fires
    recordSpend(cap * 0.1);
    stats = getDailySpendStats();
    expect(stats.thresholdsFired).toEqual(['50%']);

    // Jump over 75% and 90% in one hit → both fire, ordered
    recordSpend(cap * 0.3);
    stats = getDailySpendStats();
    expect(stats.thresholdsFired).toEqual(['50%', '75%', '90%']);
    expect(stats.nextThresholdPct).toBeNull();
  });

  it('cap blocks new sessions once reached', () => {
    const cap = config.dailySpendCapUsd;
    recordSpend(cap + 1);
    const check = checkDailySpendCap();
    expect(check.allowed).toBe(false);
    expect(check.reason).toMatch(/Daily spend cap reached/i);
    expect(getDailySpendStats().capReached).toBe(true);
  });

  it('remainingUsd never goes negative', () => {
    recordSpend(config.dailySpendCapUsd * 2);
    expect(getDailySpendStats().remainingUsd).toBe(0);
  });
});
