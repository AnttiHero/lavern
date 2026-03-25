/**
 * Unit Tests — Mass-Action Guard (src/api/middleware/mass-action-guard.ts)
 *
 * Tests:
 * - Normal session creation allowed (under threshold)
 * - Flags when same template exceeds threshold
 * - Flags when similar request text exceeds threshold
 * - Respects time window (old entries ignored)
 * - Cleanup removes old entries
 * - Hard cap prevents memory leak
 * - Block mode returns allowed: false
 * - Flag mode returns allowed: true but flagged: true
 * - Different users tracked independently
 * - Empty/missing request text handled gracefully
 * - Config defaults work correctly
 * - Both thresholds triggered at once
 * - Template and similar thresholds independent
 * - Fingerprint normalization
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMassActionGuard } from '../../src/api/middleware/mass-action-guard.js';

describe('Mass-Action Guard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows normal session creation under threshold', () => {
    const guard = createMassActionGuard({ templateThreshold: 10 });
    for (let i = 0; i < 10; i++) {
      const result = guard.check('user-1', 'review', `review contract ${i}`);
      expect(result.allowed).toBe(true);
      expect(result.flagged).toBe(false);
    }
  });

  it('flags when same template exceeds threshold', () => {
    const guard = createMassActionGuard({ templateThreshold: 3 });
    // First 3 are fine
    for (let i = 0; i < 3; i++) {
      const result = guard.check('user-1', 'counsel', `question ${i}`);
      expect(result.flagged).toBe(false);
    }
    // 4th triggers the flag
    const result = guard.check('user-1', 'counsel', 'question 4');
    expect(result.flagged).toBe(true);
    expect(result.allowed).toBe(true); // default action is 'flag'
    expect(result.reason).toContain('counsel');
    expect(result.templateCount).toBe(4);
  });

  it('flags when similar request text exceeds threshold', () => {
    const guard = createMassActionGuard({ similarRequestThreshold: 2 });
    // Same request text repeated
    guard.check('user-1', 'review', 'Please send a demand letter to tenant at 123 Main St');
    guard.check('user-1', 'counsel', 'Please send a demand letter to tenant at 123 Main St');
    // 3rd with same text triggers
    const result = guard.check('user-1', 'legal-design', 'Please send a demand letter to tenant at 123 Main St');
    expect(result.flagged).toBe(true);
    expect(result.similarCount).toBe(3);
    expect(result.reason).toContain('similar request text');
  });

  it('respects time window — old entries do not count', () => {
    const guard = createMassActionGuard({
      templateThreshold: 2,
      windowMs: 60_000, // 1 minute
    });

    guard.check('user-1', 'review', 'contract review');
    guard.check('user-1', 'review', 'contract review');

    // Advance past the window
    vi.advanceTimersByTime(61_000);

    // Should not be flagged — old events are outside window
    const result = guard.check('user-1', 'review', 'contract review');
    expect(result.flagged).toBe(false);
    expect(result.templateCount).toBe(1);
  });

  it('cleanup removes old entries', () => {
    const guard = createMassActionGuard({
      windowMs: 60_000,
    });

    guard.check('user-1', 'review', 'contract review');
    guard.check('user-2', 'counsel', 'question');

    // Advance past 2x window (cleanup cutoff)
    vi.advanceTimersByTime(121_000);

    guard.cleanup();

    // New check should start fresh — templateCount should be 1
    const result = guard.check('user-1', 'review', 'new review');
    expect(result.templateCount).toBe(1);
  });

  it('hard cap prevents memory leak', () => {
    const guard = createMassActionGuard({
      templateThreshold: 2000, // high threshold so we don't trigger flags
      windowMs: 999_999_999, // very long window
    });

    // Insert 1050 entries — should be capped to 1000
    for (let i = 0; i < 1050; i++) {
      guard.check('user-1', 'review', `request ${i}`);
    }

    // The guard should still work (no crash, no infinite memory)
    const result = guard.check('user-1', 'review', 'final request');
    expect(result.allowed).toBe(true);
    // templateCount should be at most 1001 (1000 cap + 1 new)
    expect(result.templateCount!).toBeLessThanOrEqual(1001);
  });

  it('block mode returns allowed: false when flagged', () => {
    const guard = createMassActionGuard({
      templateThreshold: 2,
      action: 'block',
    });

    guard.check('user-1', 'review', 'a');
    guard.check('user-1', 'review', 'b');

    const result = guard.check('user-1', 'review', 'c');
    expect(result.flagged).toBe(true);
    expect(result.allowed).toBe(false);
  });

  it('flag mode returns allowed: true but flagged: true', () => {
    const guard = createMassActionGuard({
      templateThreshold: 2,
      action: 'flag',
    });

    guard.check('user-1', 'review', 'a');
    guard.check('user-1', 'review', 'b');

    const result = guard.check('user-1', 'review', 'c');
    expect(result.flagged).toBe(true);
    expect(result.allowed).toBe(true);
  });

  it('tracks different users independently', () => {
    const guard = createMassActionGuard({ templateThreshold: 2 });

    guard.check('user-1', 'review', 'a');
    guard.check('user-1', 'review', 'b');
    // user-1 is at threshold

    // user-2 starts fresh
    const result = guard.check('user-2', 'review', 'c');
    expect(result.flagged).toBe(false);
    expect(result.templateCount).toBe(1);
  });

  it('handles empty request text gracefully', () => {
    const guard = createMassActionGuard({ similarRequestThreshold: 2 });

    // Empty text should not trigger similar-text detection
    guard.check('user-1', 'review', '');
    guard.check('user-1', 'review', '');
    const result = guard.check('user-1', 'review', '');
    // similarCount should be 0 because empty fingerprints are excluded
    expect(result.similarCount).toBe(0);
    expect(result.flagged).toBe(false);
  });

  it('handles undefined/null-like request text gracefully', () => {
    const guard = createMassActionGuard({ similarRequestThreshold: 2 });

    const result = guard.check('user-1', 'review', undefined as unknown as string);
    expect(result.allowed).toBe(true);
    expect(result.flagged).toBe(false);
  });

  it('config defaults work correctly', () => {
    // No config — should use defaults
    const guard = createMassActionGuard();

    // Should be able to create 10 sessions without being flagged (default threshold is 10)
    for (let i = 0; i < 10; i++) {
      const result = guard.check('user-1', 'review', `request ${i}`);
      expect(result.flagged).toBe(false);
    }

    // 11th should be flagged
    const result = guard.check('user-1', 'review', 'request 11');
    expect(result.flagged).toBe(true);
  });

  it('triggers both template and similar thresholds simultaneously', () => {
    const guard = createMassActionGuard({
      templateThreshold: 2,
      similarRequestThreshold: 2,
    });

    const sameText = 'send demand letter to tenant';
    guard.check('user-1', 'review', sameText);
    guard.check('user-1', 'review', sameText);

    const result = guard.check('user-1', 'review', sameText);
    expect(result.flagged).toBe(true);
    // Both reasons should appear
    expect(result.reason).toContain('template');
    expect(result.reason).toContain('similar request text');
  });

  it('normalizes request text for fingerprinting (case, whitespace)', () => {
    const guard = createMassActionGuard({ similarRequestThreshold: 2 });

    guard.check('user-1', 'review', 'Send demand letter to tenant');
    guard.check('user-1', 'counsel', 'send  DEMAND   letter  to  tenant');

    // Should match because fingerprint normalizes case and whitespace
    const result = guard.check('user-1', 'legal-design', '  SEND demand LETTER to tenant  ');
    expect(result.flagged).toBe(true);
    expect(result.similarCount).toBe(3);
  });

  it('template and similar thresholds are independent', () => {
    const guard = createMassActionGuard({
      templateThreshold: 100, // very high
      similarRequestThreshold: 2,
    });

    // Same text, different templates — should trigger similar but not template
    guard.check('user-1', 'review', 'identical text');
    guard.check('user-1', 'counsel', 'identical text');
    const result = guard.check('user-1', 'legal-design', 'identical text');

    expect(result.flagged).toBe(true);
    expect(result.templateCount).toBe(1); // only 1 per template
    expect(result.similarCount).toBe(3);
  });
});
