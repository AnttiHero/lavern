/**
 * Unit Tests — Billing Analytics (v0.12)
 *
 * Tests the analytics data aggregation from session_archive.
 * Uses in-memory SQLite.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  initDatabase,
  getDb,
  createUser,
  hashPassword,
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

// ── Helpers ───────────────────────────────────────────────────────────

function insertSession(userId: string, opts: { costUsd?: number; workflowId?: string; createdAt?: string } = {}) {
  const db = getDb();
  const id = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const now = opts.createdAt ?? new Date().toISOString();
  db.prepare(`
    INSERT INTO session_archive (id, user_id, cost_usd, workflow_id, created_at, completed_at, status)
    VALUES (?, ?, ?, ?, ?, ?, 'completed')
  `).run(id, userId, opts.costUsd ?? 0.5, opts.workflowId ?? 'review', now, now);
  return id;
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('billing analytics queries', () => {
  let userId: string;
  let otherUserId: string;

  it('sets up test users', async () => {
    const hash = await hashPassword('test1234');
    const user = createUser('analytics@test.com', hash, 'Analyst');
    userId = user.id;
    const other = createUser('other@test.com', hash, 'Other');
    otherUserId = other.id;
  });

  it('returns empty data for user with no sessions', () => {
    const db = getDb();
    const row = db.prepare(`
      SELECT COUNT(*) as cnt, COALESCE(SUM(cost_usd), 0) as cost
      FROM session_archive WHERE user_id = ?
    `).get(userId) as { cnt: number; cost: number };

    expect(row.cnt).toBe(0);
    expect(row.cost).toBe(0);
  });

  it('counts sessions correctly for the user', () => {
    insertSession(userId, { costUsd: 1.50, workflowId: 'review' });
    insertSession(userId, { costUsd: 2.00, workflowId: 'counsel' });
    insertSession(userId, { costUsd: 0.75, workflowId: 'review' });
    // Other user's session — should not be counted
    insertSession(otherUserId, { costUsd: 5.00, workflowId: 'full-bench' });

    const db = getDb();
    const row = db.prepare(`
      SELECT COUNT(*) as cnt, AVG(cost_usd) as avg_cost
      FROM session_archive WHERE user_id = ?
    `).get(userId) as { cnt: number; avg_cost: number };

    expect(row.cnt).toBe(3);
    expect(row.avg_cost).toBeCloseTo(1.4167, 2);
  });

  it('groups workflow breakdown correctly', () => {
    const db = getDb();
    const workflows = db.prepare(`
      SELECT workflow_id, COUNT(*) as cnt FROM session_archive
      WHERE user_id = ? AND workflow_id IS NOT NULL
      GROUP BY workflow_id ORDER BY cnt DESC
    `).all(userId) as Array<{ workflow_id: string; cnt: number }>;

    expect(workflows).toHaveLength(2);
    expect(workflows[0].workflow_id).toBe('review');
    expect(workflows[0].cnt).toBe(2);
    expect(workflows[1].workflow_id).toBe('counsel');
    expect(workflows[1].cnt).toBe(1);
  });

  it('isolates user data (no cross-user leakage)', () => {
    const db = getDb();
    const otherRow = db.prepare(`
      SELECT COUNT(*) as cnt FROM session_archive WHERE user_id = ?
    `).get(otherUserId) as { cnt: number };

    expect(otherRow.cnt).toBe(1);
  });

  it('week-based aggregation works with date filtering', () => {
    const db = getDb();
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const row = db.prepare(`
      SELECT COUNT(*) as cnt, COALESCE(SUM(cost_usd), 0) as cost
      FROM session_archive
      WHERE user_id = ? AND created_at >= ? AND created_at < ?
    `).get(userId, weekStart.toISOString(), weekEnd.toISOString()) as { cnt: number; cost: number };

    // All 3 sessions were created "now", so they should be in the current week
    expect(row.cnt).toBe(3);
    expect(row.cost).toBeCloseTo(4.25, 2);
  });

  it('past weeks return zero when no data', () => {
    const db = getDb();
    const pastStart = new Date('2024-01-01T00:00:00Z');
    const pastEnd = new Date('2024-01-08T00:00:00Z');

    const row = db.prepare(`
      SELECT COUNT(*) as cnt, COALESCE(SUM(cost_usd), 0) as cost
      FROM session_archive
      WHERE user_id = ? AND created_at >= ? AND created_at < ?
    `).get(userId, pastStart.toISOString(), pastEnd.toISOString()) as { cnt: number; cost: number };

    expect(row.cnt).toBe(0);
    expect(row.cost).toBe(0);
  });

  it('billable hours balance is accurate', () => {
    creditBillableHours(userId, 50, 'welcome', 'Welcome hours');
    const balance = getUserBillableHours(userId);
    expect(balance).toBe(50);
  });
});
