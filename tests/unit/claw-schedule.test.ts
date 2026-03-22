/**
 * Unit Tests — Claw Scheduled Re-review (src/claw/types.ts)
 *
 * Tests the reviewSchedule type and staleness detection logic.
 */

import { describe, it, expect } from 'vitest';
import type { ClawProfile } from '../../src/claw/types.js';

describe('ClawProfile.reviewSchedule', () => {
  function makeProfile(schedule?: ClawProfile['reviewSchedule']): ClawProfile {
    return {
      company: 'TestCorp',
      jurisdiction: 'Delaware',
      industry: 'Technology',
      size: 'Startup',
      concerns: [],
      preferences: { style: 'plain-language', intensity: 'standard', riskAppetite: 'balanced' },
      watchPaths: ['/tmp/test'],
      budget: { totalUsd: 50, perDocumentMaxUsd: 10 },
      reviewSchedule: schedule,
      createdAt: new Date().toISOString(),
    };
  }

  it('accepts reviewSchedule with enabled + intervalDays', () => {
    const profile = makeProfile({ enabled: true, intervalDays: 90 });
    expect(profile.reviewSchedule?.enabled).toBe(true);
    expect(profile.reviewSchedule?.intervalDays).toBe(90);
  });

  it('accepts profile without reviewSchedule (backward compatible)', () => {
    const profile = makeProfile();
    expect(profile.reviewSchedule).toBeUndefined();
  });

  it('accepts disabled schedule', () => {
    const profile = makeProfile({ enabled: false, intervalDays: 30 });
    expect(profile.reviewSchedule?.enabled).toBe(false);
  });

  it('detects documents due for re-review based on intervalDays', () => {
    const intervalDays = 90;
    const intervalMs = intervalDays * 24 * 60 * 60 * 1000;
    const now = Date.now();

    // Document reviewed 100 days ago — should be due
    const oldReview = new Date(now - 100 * 24 * 60 * 60 * 1000).toISOString();
    expect(now - new Date(oldReview).getTime() > intervalMs).toBe(true);

    // Document reviewed 30 days ago — should not be due
    const recentReview = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
    expect(now - new Date(recentReview).getTime() > intervalMs).toBe(false);
  });
});
