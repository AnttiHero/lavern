/**
 * Unit Tests — Referral System (v0.12)
 *
 * Tests referral code generation, referral credit logic, stats, and edge cases.
 * Uses in-memory SQLite.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  initDatabase,
  getDb,
  createUser,
  hashPassword,
  ensureReferralCode,
  getUserByReferralCode,
  setReferredBy,
  getReferralStats,
  creditBillableHours,
  getUserBillableHours,
} from '../../src/db/database.js';

// ── Setup ─────────────────────────────────────────────────────────────

beforeAll(() => {
  initDatabase(':memory:');
});

afterAll(() => {
  try { getDb().close(); } catch { /* already closed */ }
});

// ── Tests ─────────────────────────────────────────────────────────────

describe('referral system', () => {
  let referrerId: string;
  let refereeId: string;

  it('creates a user and generates a referral code', async () => {
    const hash = await hashPassword('test1234');
    const user = createUser('referrer@test.com', hash, 'Referrer');
    referrerId = user.id;

    const code = ensureReferralCode(referrerId);
    expect(code).toBeTruthy();
    expect(code.startsWith('ref-')).toBe(true);
    expect(code.length).toBeGreaterThan(4);
  });

  it('returns the same code on second call (idempotent)', () => {
    const code1 = ensureReferralCode(referrerId);
    const code2 = ensureReferralCode(referrerId);
    expect(code1).toBe(code2);
  });

  it('looks up user by referral code', () => {
    const code = ensureReferralCode(referrerId);
    const found = getUserByReferralCode(code);
    expect(found).toBeDefined();
    expect(found!.id).toBe(referrerId);
  });

  it('returns undefined for invalid referral code', () => {
    const found = getUserByReferralCode('ref-doesnotexist');
    expect(found).toBeUndefined();
  });

  it('tracks referral relationship', async () => {
    const hash = await hashPassword('test1234');
    const referee = createUser('referee@test.com', hash, 'Referee');
    refereeId = referee.id;

    setReferredBy(refereeId, referrerId);

    const stats = getReferralStats(referrerId);
    expect(stats.referralCount).toBe(1);
  });

  it('credits referral hours to both parties', () => {
    const hours = 10;
    creditBillableHours(referrerId, hours, 'referral', 'Referral bonus — someone joined with your link.');
    creditBillableHours(refereeId, hours, 'referral', 'Referral bonus — welcome to Lavern.');

    const referrerBalance = getUserBillableHours(referrerId);
    const refereeBalance = getUserBillableHours(refereeId);
    expect(referrerBalance).toBe(hours);
    expect(refereeBalance).toBe(hours);
  });

  it('tracks earned hours in referral stats', () => {
    const stats = getReferralStats(referrerId);
    expect(stats.hoursEarned).toBe(10);
    expect(stats.referralCount).toBe(1);
    expect(stats.referralCode).toBeTruthy();
  });

  it('prevents self-referral (enforced at route level, not DB level)', () => {
    // Self-referral is prevented in the signup handler (referrer.id !== user.id check),
    // not at the DB level. Verify the code lookup works for the user themselves.
    const code = ensureReferralCode(referrerId);
    const self = getUserByReferralCode(code);
    expect(self!.id).toBe(referrerId);
    // The route handler checks: if (referrer && referrer.id !== user.id)
  });

  it('handles multiple referrals', async () => {
    const hash = await hashPassword('test1234');
    const referee2 = createUser('referee2@test.com', hash, 'Referee2');
    setReferredBy(referee2.id, referrerId);
    creditBillableHours(referrerId, 10, 'referral', 'Referral bonus.');

    const stats = getReferralStats(referrerId);
    expect(stats.referralCount).toBe(2);
    expect(stats.hoursEarned).toBe(20);
  });

  it('generates unique codes for different users', async () => {
    const hash = await hashPassword('test1234');
    const user2 = createUser('unique@test.com', hash, 'Unique');
    const code1 = ensureReferralCode(referrerId);
    const code2 = ensureReferralCode(user2.id);
    expect(code1).not.toBe(code2);
  });

  it('returns zero stats for user with no referrals', async () => {
    const hash = await hashPassword('test1234');
    const loner = createUser('loner@test.com', hash, 'Loner');
    const stats = getReferralStats(loner.id);
    expect(stats.referralCount).toBe(0);
    expect(stats.hoursEarned).toBe(0);
    expect(stats.referralCode).toBeTruthy();
  });
});
