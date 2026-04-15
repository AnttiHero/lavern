/**
 * Unit tests — Per-user spend aggregation (src/db/database.ts).
 *
 * Drives the `GET /api/admin/user-spend` operator endpoint. Tests use raw
 * SQL inserts rather than archiveSession() because the latter requires a
 * full SessionState fixture and we only care about the aggregation math.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initDatabase, getDb, getUserSpendBreakdown } from '../../src/db/database.js';

beforeAll(() => {
  initDatabase(':memory:');

  const db = getDb();
  // Seed users. We need to insert directly rather than via createUser() to
  // keep the test independent of bcrypt cost.
  db.prepare(`
    INSERT INTO users (id, email, password_hash, created_at, updated_at)
    VALUES (?, ?, '', ?, ?)
  `).run('u1', 'alice@example.com', '2026-04-15T00:00:00Z', '2026-04-15T00:00:00Z');
  db.prepare(`
    INSERT INTO users (id, email, password_hash, created_at, updated_at)
    VALUES (?, ?, '', ?, ?)
  `).run('u2', 'bob@example.com', '2026-04-15T00:00:00Z', '2026-04-15T00:00:00Z');

  const insertArchive = db.prepare(`
    INSERT INTO session_archive (id, user_id, cost_usd, created_at, completed_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  // Alice: 3 sessions today, $0.50 + $1.20 + $0.30 = $2.00
  insertArchive.run('s_a1', 'u1', 0.5, '2026-04-15T09:00:00Z', '2026-04-15T09:05:00Z');
  insertArchive.run('s_a2', 'u1', 1.2, '2026-04-15T10:00:00Z', '2026-04-15T10:05:00Z');
  insertArchive.run('s_a3', 'u1', 0.3, '2026-04-15T11:00:00Z', '2026-04-15T11:05:00Z');

  // Bob: 1 session today, $5.00
  insertArchive.run('s_b1', 'u2', 5.0, '2026-04-15T12:00:00Z', '2026-04-15T12:05:00Z');

  // Anonymous (user_id NULL): 2 sessions today, $0.10 + $0.40
  insertArchive.run('s_x1', null, 0.1, '2026-04-15T13:00:00Z', '2026-04-15T13:05:00Z');
  insertArchive.run('s_x2', null, 0.4, '2026-04-15T14:00:00Z', '2026-04-15T14:05:00Z');

  // Yesterday session — should NOT appear in today's range
  insertArchive.run('s_old', 'u1', 99.99, '2026-04-14T10:00:00Z', '2026-04-14T10:05:00Z');
});

afterAll(() => {
  try { getDb().close(); } catch { /* already closed */ }
});

describe('getUserSpendBreakdown', () => {
  const todayStart = '2026-04-15T00:00:00Z';
  const todayEnd = '2026-04-15T23:59:59Z';

  it('groups and totals per user within the window', () => {
    const rows = getUserSpendBreakdown(todayStart, todayEnd);

    // 3 rows: alice, bob, anonymous
    expect(rows).toHaveLength(3);

    // Bob ($5.00) outspends Alice ($2.00) outspends anonymous ($0.50)
    expect(rows[0].userId).toBe('u2');
    expect(rows[0].email).toBe('bob@example.com');
    expect(rows[0].totalUsd).toBeCloseTo(5.0, 5);
    expect(rows[0].sessions).toBe(1);

    expect(rows[1].userId).toBe('u1');
    expect(rows[1].email).toBe('alice@example.com');
    expect(rows[1].totalUsd).toBeCloseTo(2.0, 5);
    expect(rows[1].sessions).toBe(3);
    expect(rows[1].maxUsd).toBeCloseTo(1.2, 5);

    // Anonymous bucket is preserved
    const anon = rows.find((r) => r.userId === null);
    expect(anon).toBeDefined();
    expect(anon?.email).toBeNull();
    expect(anon?.totalUsd).toBeCloseTo(0.5, 5);
    expect(anon?.sessions).toBe(2);
  });

  it('excludes sessions outside the window', () => {
    const rows = getUserSpendBreakdown(todayStart, todayEnd);
    // Yesterday's $99.99 session must not bleed into today's totals
    const alice = rows.find((r) => r.userId === 'u1');
    expect(alice?.totalUsd).toBeCloseTo(2.0, 5);
  });

  it('returns an empty array for a window with no sessions', () => {
    const rows = getUserSpendBreakdown('2025-01-01T00:00:00Z', '2025-01-02T00:00:00Z');
    expect(rows).toEqual([]);
  });

  it('respects the limit parameter', () => {
    const rows = getUserSpendBreakdown(todayStart, todayEnd, 1);
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe('u2'); // Top spender only
  });

  it('yesterday-only window returns the excluded $99.99 session', () => {
    const rows = getUserSpendBreakdown('2026-04-14T00:00:00Z', '2026-04-14T23:59:59Z');
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe('u1');
    expect(rows[0].totalUsd).toBeCloseTo(99.99, 5);
  });
});
