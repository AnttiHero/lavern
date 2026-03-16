/**
 * Unit Tests — Billing (src/api/routes/billing.ts)
 *
 * Tests plan limits and canStartSession budget enforcement.
 * These are the core billing gating functions — if they break,
 * users can either run up unlimited bills or get incorrectly blocked.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the database module before importing billing
vi.mock('../../src/db/database.js', () => ({
  getUserByToken: vi.fn(),
  getUserPlan: vi.fn(),
  setUserPlan: vi.fn(),
  setUserStripeCustomer: vi.fn(),
  recordBillingEvent: vi.fn(),
  getUserMonthlyUsage: vi.fn().mockReturnValue({ total_cost_usd: 0, engagement_count: 0 }),
  getUserBillableHours: vi.fn().mockReturnValue(0),
  creditBillableHours: vi.fn(),
}));

// Mock config
vi.mock('../../src/config.js', () => ({
  config: {
    stripe: {
      secretKey: 'sk_test_fake',
      publishableKey: 'pk_test_fake',
      webhookSecret: 'whsec_fake',
      successUrl: 'http://localhost/success',
      cancelUrl: 'http://localhost/cancel',
      plans: {
        starter: { monthlyCapUsd: 50, maxSessionBudget: 10, label: 'Starter' },
        professional: { monthlyCapUsd: 200, maxSessionBudget: 25, label: 'Professional' },
        enterprise: { monthlyCapUsd: 1000, maxSessionBudget: 50, label: 'Enterprise' },
      },
    },
    billableHours: {
      rate: 2.50,
      packs: {
        quick: { hours: 25, priceEurCents: 500, label: 'Quick' },
        standard: { hours: 100, priceEurCents: 1900, label: 'Standard' },
        bulk: { hours: 500, priceEurCents: 8900, label: 'Bulk' },
      },
    },
  },
}));

import { getPlanLimits, canStartSession } from '../../src/api/routes/billing.js';
import { getUserPlan, getUserMonthlyUsage, getUserBillableHours } from '../../src/db/database.js';

describe('getPlanLimits', () => {
  it('returns correct limits for starter plan', () => {
    const limits = getPlanLimits('starter');
    expect(limits.monthlyCapUsd).toBe(50);
    expect(limits.maxSessionBudget).toBe(10);
    expect(limits.label).toBe('Starter');
  });

  it('returns correct limits for professional plan', () => {
    const limits = getPlanLimits('professional');
    expect(limits.monthlyCapUsd).toBe(200);
    expect(limits.maxSessionBudget).toBe(25);
  });

  it('returns correct limits for enterprise plan', () => {
    const limits = getPlanLimits('enterprise');
    expect(limits.monthlyCapUsd).toBe(1000);
  });

  it('returns free tier defaults for unknown plan', () => {
    const limits = getPlanLimits('unknown-plan');
    expect(limits.monthlyCapUsd).toBe(15);
    expect(limits.maxSessionBudget).toBe(5);
    expect(limits.label).toBe('Free');
  });

  it('returns free tier for "free" plan', () => {
    const limits = getPlanLimits('free');
    expect(limits.monthlyCapUsd).toBe(15);
    expect(limits.label).toBe('Free');
  });
});

describe('canStartSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows session when user has billable hours', () => {
    vi.mocked(getUserBillableHours).mockReturnValue(10); // 10 hours
    const result = canStartSession('user-1');
    expect(result.allowed).toBe(true);
    expect(result.remainingHours).toBe(10);
    expect(result.remainingBudget).toBe(25); // 10 * $2.50
  });

  it('blocks session when billable hours too low', () => {
    vi.mocked(getUserBillableHours).mockReturnValue(0.1); // 0.1 hours = $0.25
    const result = canStartSession('user-1');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('too low');
  });

  it('allows session on free tier with remaining budget', () => {
    vi.mocked(getUserBillableHours).mockReturnValue(0);
    vi.mocked(getUserPlan).mockReturnValue(null);
    vi.mocked(getUserMonthlyUsage).mockReturnValue({ total_cost_usd: 5, engagement_count: 2 });

    const result = canStartSession('user-1');
    expect(result.allowed).toBe(true);
    expect(result.remainingBudget).toBe(10); // $15 cap - $5 used
  });

  it('blocks free tier when budget exceeded', () => {
    vi.mocked(getUserBillableHours).mockReturnValue(0);
    vi.mocked(getUserPlan).mockReturnValue(null);
    vi.mocked(getUserMonthlyUsage).mockReturnValue({ total_cost_usd: 15, engagement_count: 10 });

    const result = canStartSession('user-1');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('remaining');
  });

  it('allows paid plan with remaining budget', () => {
    vi.mocked(getUserBillableHours).mockReturnValue(0);
    vi.mocked(getUserPlan).mockReturnValue({
      plan: 'professional',
      plan_expires_at: new Date(Date.now() + 86400000).toISOString(), // tomorrow
    });
    vi.mocked(getUserMonthlyUsage).mockReturnValue({ total_cost_usd: 50, engagement_count: 5 });

    const result = canStartSession('user-1');
    expect(result.allowed).toBe(true);
    expect(result.remainingBudget).toBe(150); // $200 cap - $50 used
  });

  it('downgrades to free limits when plan expired', () => {
    vi.mocked(getUserBillableHours).mockReturnValue(0);
    vi.mocked(getUserPlan).mockReturnValue({
      plan: 'professional',
      plan_expires_at: new Date(Date.now() - 86400000).toISOString(), // yesterday
    });
    vi.mocked(getUserMonthlyUsage).mockReturnValue({ total_cost_usd: 14, engagement_count: 3 });

    const result = canStartSession('user-1');
    // Free tier cap is $15, used $14 → $1 remaining → allowed (> $0.50 min)
    expect(result.allowed).toBe(true);
    expect(result.remainingBudget).toBe(1); // $15 - $14
  });

  it('blocks when expired plan and free tier exceeded', () => {
    vi.mocked(getUserBillableHours).mockReturnValue(0);
    vi.mocked(getUserPlan).mockReturnValue({
      plan: 'professional',
      plan_expires_at: new Date(Date.now() - 86400000).toISOString(), // yesterday
    });
    vi.mocked(getUserMonthlyUsage).mockReturnValue({ total_cost_usd: 20, engagement_count: 5 });

    const result = canStartSession('user-1');
    expect(result.allowed).toBe(false);
    expect(result.remainingBudget).toBe(0);
  });

  it('blocks when remaining budget below minimum session cost', () => {
    vi.mocked(getUserBillableHours).mockReturnValue(0);
    vi.mocked(getUserPlan).mockReturnValue(null);
    vi.mocked(getUserMonthlyUsage).mockReturnValue({ total_cost_usd: 14.60, engagement_count: 8 });

    const result = canStartSession('user-1');
    // Remaining: $15 - $14.60 = $0.40, below $0.50 minimum
    expect(result.allowed).toBe(false);
  });
});
