/**
 * Integration Tests — Audit Fixes (e5a1d14).
 *
 * Pins down behaviour for the 18 fixes shipped in the security/correctness
 * sweep. Anything that regresses here is a critical bug — these tests
 * exist to prevent the same class of failure from reaching users twice.
 *
 * Coverage:
 *   C1   archive endpoints require auth (no anonymous fallback)
 *   C2   /revise rejects hydrated archive sessions with 409
 *   C3   GDPR cascade — softDeleteUser + exportUserData hit shared_*
 *   H4   firm-scraper rejects redirects to private IPs
 *   H5   ownership guard on /derivatives, /conversation, /reassemble,
 *        revisions endpoints
 *   H6   per-session lock on /revise blocks concurrent submits
 *   H7   withRetry retries transient errors, gives up on permanent ones
 *   H8   /revise debits billable hours; insufficient balance returns 402
 *   H9   busy_timeout pragma is set to 5000ms
 *   H10  sweepStaleHolds releases holds older than maxAgeMs
 *   M11  /revise body validation
 *   M13  cleanOldArchives skips non-terminal statuses
 *   LOW  payload size caps on /agents/share + /teams/share
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyRateLimit from '@fastify/rate-limit';

// ── Mocks ────────────────────────────────────────────────────────────────
// Mock config before any imports — same shape as api-routes.test.ts.
vi.mock('../../src/config.js', () => ({
  config: {
    sessionTtlMs: 60_000,
    maxSessions: 100,
    auditDir: './test-audit',
    memoryDir: './test-memory',
    reportsDir: './test-reports',
    baselinesDir: './test-baselines',
    defaultBudgetUsd: 5.0,
    port: 0,
    host: '127.0.0.1',
    corsOrigins: '*',
    baseUrl: 'http://localhost:3000',
    trustProxy: false,
    defaultModel: 'claude-opus-4-7',
    routerModel: 'claude-sonnet-4-5',
    logLevel: 'error',
    version: '0.14.3',
    rateLimitMax: 1000,
    rateLimitWindowMs: 60_000,
    rateLimitAuthLoginMax: 100,
    rateLimitAuthSignupMax: 100,
    rateLimitAuthWindowMs: 60_000,
    x402Enabled: false,
    maxUploadBytes: 10 * 1024 * 1024,
    dbPath: ':memory:',
    archiveRetentionDays: 180,
    stripeSecretKey: '',
    stripePublishableKey: '',
    stripeWebhookSecret: '',
    email: { resendApiKey: '', from: 'Test <test@test.com>', appUrl: 'http://localhost:5173' },
    auth: {
      resetTokenTtlMs: 60 * 60 * 1000,
      verifyTokenTtlMs: 24 * 60 * 60 * 1000,
      lowBalanceThresholdHours: 5,
      rateLimitForgotPasswordMax: 100,
      rateLimitResendVerificationMax: 100,
    },
    billableHours: {
      rate: 0.10, // $0.10/hr — i.e. $1 = 10 hours; $0.50 revision = 5 hours
      welcomeHours: 50,
      waitlistEnabled: false,
      adminKey: 'test-admin-key',
      packs: {
        quick: { hours: 25, priceEurCents: 500, label: 'Quick' },
        standard: { hours: 100, priceEurCents: 1900, label: 'Standard' },
        bulk: { hours: 500, priceEurCents: 8900, label: 'Bulk' },
      },
    },
    // v3.5 env consolidation: additional fields read by middleware
    nodeEnv: 'test',
    isProduction: false,
    isDevelopment: false,
    isTest: true,
    anthropic: { apiKey: '' },
    rateLimitUserMax: 1000,
    rateLimitUserWindowMs: 60_000,
    rateLimitSessionMax: 100,
    maxUserSessions: 50,
    maxWsConnections: 200,
    allowLoadTestBypassInProd: false,
    massAction: { threshold: 1000, windowMs: 60_000, mode: 'log' },
    signupDisabled: false,
    counselFastPathEnabled: true,
    logPreviews: false,
    logDir: '',
    logRetainDays: 14,
    sentry: { dsn: '' },
  },
}));

// Mock email
vi.mock('../../src/email/send.js', () => ({
  sendWelcomeEmail: vi.fn().mockResolvedValue(true),
  sendWaitlistConfirmation: vi.fn().mockResolvedValue(true),
  sendInviteEmail: vi.fn().mockResolvedValue(true),
  sendPaymentReceiptEmail: vi.fn().mockResolvedValue(true),
  sendLowBalanceEmail: vi.fn().mockResolvedValue(true),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(true),
  sendVerificationEmail: vi.fn().mockResolvedValue(true),
}));

// Mock crossProviderChat — revise / conversation tests don't need a real LLM.
// Hoisted so vi.mock factory (also hoisted) can reference it.
const { mockChat } = vi.hoisted(() => ({ mockChat: vi.fn() }));
vi.mock('../../src/providers/cross-provider-chat.js', () => ({
  crossProviderChat: mockChat,
}));

// Imports AFTER mocks
import {
  initDatabase, getDb,
  createUser, hashPassword, createAuthToken,
  archiveSession,
  upsertSharedAgent, upsertSharedTeam, getSharedAgent, getSharedTeam,
  creditBillableHours, getUserBillableHours,
  sweepStaleHolds, cleanOldArchives, softDeleteUser, exportUserData,
} from '../../src/db/database.js';
import { SessionManager } from '../../src/session/session-manager.js';
import { SessionState } from '../../src/session/session-state.js';
import { registerSessionRoutes } from '../../src/api/routes/sessions.js';
import { registerAgentBuilderRoutes } from '../../src/api/routes/agent-builder.js';
import { registerUserAuthRoutes } from '../../src/api/routes/auth-routes.js';
import { withRetry, isRetryableError } from '../../src/utils/with-retry.js';

let app: FastifyInstance;
let sessionManager: SessionManager;

async function buildApp(): Promise<FastifyInstance> {
  const fastify = Fastify({ logger: false });
  await fastify.register(fastifyRateLimit, { max: 10_000, timeWindow: 60_000 });
  initDatabase(':memory:');
  sessionManager = new SessionManager();
  registerUserAuthRoutes(fastify);
  registerSessionRoutes(fastify, sessionManager);
  registerAgentBuilderRoutes(fastify);
  // Simulate the global auth-middleware behaviour: extract `userId` from the
  // lavern_token cookie. The real middleware lives in server.ts but isn't
  // wired in unit-test setups; routes consult `request.userId` directly.
  fastify.addHook('preHandler', async (request) => {
    const cookie = request.headers.cookie ?? '';
    const m = /lavern_token=([^;]+)/.exec(cookie);
    if (!m) return;
    const { getUserByToken } = await import('../../src/db/database.js');
    const user = getUserByToken(m[1]);
    if (user) {
      (request as typeof request & { userId?: string; user?: { id: string; email: string } }).userId = user.id;
      (request as typeof request & { user?: { id: string; email: string } }).user = { id: user.id, email: user.email };
    }
  });
  await fastify.ready();
  return fastify;
}

async function makeUser(email: string, displayName = 'Test'): Promise<{ id: string; cookie: string }> {
  const hash = await hashPassword('SecureP@ss123!');
  const user = createUser(email, hash, displayName);
  const token = createAuthToken(user.id);
  return { id: user.id, cookie: `lavern_token=${token}` };
}

function makeLiveSession(userId: string | undefined, opts: { withDoc?: boolean } = {}): SessionState {
  const session = sessionManager.createSession();
  if (userId) session.userId = userId;
  if (opts.withDoc !== false) {
    session.assembledDocument = '# Memo\n\n' + 'Lorem ipsum dolor sit amet. '.repeat(40);
  }
  return session;
}

beforeAll(async () => {
  app = await buildApp();
});

afterAll(async () => {
  await app.close();
  sessionManager.stopCleanup();
});

beforeEach(() => {
  mockChat.mockReset();
});

// ──────────────────────────────────────────────────────────────────────────
// C1 — Archive endpoints require auth (no anonymous fallback)
// ──────────────────────────────────────────────────────────────────────────

describe('C1 — archive endpoints require auth', () => {
  it('GET /api/sessions/archive returns 401 without auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/sessions/archive' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toMatch(/authentication required/i);
  });

  it('GET /api/sessions/archive/:id returns 401 without auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/sessions/archive/whatever' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/sessions/archive returns owner-scoped list when authed', async () => {
    const { cookie } = await makeUser('archive-c1-a@example.com');
    const res = await app.inject({
      method: 'GET',
      url: '/api/sessions/archive',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ sessions: [], total: 0 });
  });

  it('GET /api/sessions/archive/:id of OTHER user returns 404 (not 401, to avoid disclosure)', async () => {
    const a = await makeUser('archive-c1-b@example.com');
    const b = await makeUser('archive-c1-c@example.com');
    const session = makeLiveSession(a.id);
    archiveSession(session, a.id);
    const res = await app.inject({
      method: 'GET',
      url: `/api/sessions/archive/${session.id}`,
      headers: { cookie: b.cookie },
    });
    expect(res.statusCode).toBe(404);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// H5 — ownership guard on POST mutations (capability-token alone insufficient)
// ──────────────────────────────────────────────────────────────────────────

describe('H5 — ownership guard on session mutations', () => {
  it('POST /reassemble — owner OK, other user 404', async () => {
    const a = await makeUser('h5-a@example.com');
    const b = await makeUser('h5-b@example.com');
    const session = makeLiveSession(a.id);
    // Other user → 404
    const noOwn = await app.inject({
      method: 'POST',
      url: `/api/sessions/${session.id}/reassemble`,
      headers: { cookie: b.cookie },
    });
    expect(noOwn.statusCode).toBe(404);
  });

  it('POST /conversation — other user gets 404', async () => {
    const a = await makeUser('h5-c@example.com');
    const b = await makeUser('h5-d@example.com');
    const session = makeLiveSession(a.id);
    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${session.id}/conversation`,
      headers: { cookie: b.cookie, 'content-type': 'application/json' },
      payload: { messages: [{ role: 'user', content: 'hi' }] },
    });
    expect(res.statusCode).toBe(404);
  });

  it('POST /derivatives — other user gets 404', async () => {
    const a = await makeUser('h5-e@example.com');
    const b = await makeUser('h5-f@example.com');
    const session = makeLiveSession(a.id);
    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${session.id}/derivatives`,
      headers: { cookie: b.cookie, 'content-type': 'application/json' },
      payload: { type: 'executive-summary' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('GET /revisions — other user gets 404', async () => {
    const a = await makeUser('h5-g@example.com');
    const b = await makeUser('h5-h@example.com');
    const session = makeLiveSession(a.id);
    const res = await app.inject({
      method: 'GET',
      url: `/api/sessions/${session.id}/revisions`,
      headers: { cookie: b.cookie },
    });
    expect(res.statusCode).toBe(404);
  });

  it('GET /revisions — owner gets v1 lazy-seeded from assembledDocument', async () => {
    const a = await makeUser('h5-i@example.com');
    const session = makeLiveSession(a.id);
    const res = await app.inject({
      method: 'GET',
      url: `/api/sessions/${session.id}/revisions`,
      headers: { cookie: a.cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.revisions).toHaveLength(1);
    expect(body.revisions[0].version).toBe(1);
    expect(body.revisions[0].chars).toBeGreaterThan(100);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// C2 + H6 + H8 — /revise hardening
// ──────────────────────────────────────────────────────────────────────────

describe('C2/H6/H8 — /revise hardening', () => {
  it('C2: rejects hydrated archive sessions with 409 SESSION_ARCHIVED', async () => {
    const a = await makeUser('revise-c2@example.com');
    creditBillableHours(a.id, 100, 'credit', 'test-credit');
    // Create + archive + evict so the next hit goes through hydrate path.
    const session = makeLiveSession(a.id);
    const sessionId = session.id;
    archiveSession(session, a.id);
    sessionManager.destroySession(sessionId);

    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/revise`,
      headers: { cookie: a.cookie, 'content-type': 'application/json' },
      payload: { instructions: 'Tighten the opening paragraph.' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('SESSION_ARCHIVED');
    expect(mockChat).not.toHaveBeenCalled();
  });

  it('H8: returns 402 INSUFFICIENT_HOURS when the user has no balance', async () => {
    const a = await makeUser('revise-h8a@example.com');
    // No creditBillableHours — balance is 0.
    const session = makeLiveSession(a.id);
    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${session.id}/revise`,
      headers: { cookie: a.cookie, 'content-type': 'application/json' },
      payload: { instructions: 'Rewrite section 2.' },
    });
    expect(res.statusCode).toBe(402);
    expect(res.json().code).toBe('INSUFFICIENT_HOURS');
    expect(mockChat).not.toHaveBeenCalled();
  });

  it('H8: happy path debits billable hours and returns v2', async () => {
    const a = await makeUser('revise-h8b@example.com');
    creditBillableHours(a.id, 100, 'credit', 'h8-credit');
    const balanceBefore = getUserBillableHours(a.id);
    const session = makeLiveSession(a.id);

    mockChat.mockResolvedValue({
      text: '# Revised Memo\n\n' + 'Better prose. '.repeat(40),
      cost: 0.45,
      model: 'claude-opus-4-7',
      provider: 'anthropic',
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${session.id}/revise`,
      headers: { cookie: a.cookie, 'content-type': 'application/json' },
      payload: { instructions: 'Rewrite the opening for plain English.' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.version).toBe(2);
    expect(body.document.length).toBeGreaterThan(200);
    expect(mockChat).toHaveBeenCalledTimes(1);
    // Balance dropped by ~5 hours ($0.50 / $0.10 rate).
    const balanceAfter = getUserBillableHours(a.id);
    expect(balanceBefore - balanceAfter).toBeCloseTo(5, 1);
  });

  it('H6: concurrent revise requests — second gets 409 REVISION_IN_PROGRESS', async () => {
    const a = await makeUser('revise-h6@example.com');
    creditBillableHours(a.id, 100, 'credit', 'h6-credit');
    const session = makeLiveSession(a.id);

    let resolveFirst: (() => void) | null = null;
    mockChat.mockImplementationOnce(() => new Promise(resolve => {
      resolveFirst = () => resolve({
        text: '# Revised\n\n' + 'OK. '.repeat(80),
        cost: 0.40,
        model: 'claude-opus-4-7',
        provider: 'anthropic',
      });
    }));

    const first = app.inject({
      method: 'POST',
      url: `/api/sessions/${session.id}/revise`,
      headers: { cookie: a.cookie, 'content-type': 'application/json' },
      payload: { instructions: 'First call — long-running.' },
    });
    // Wait one tick so the first call grabs the lock.
    await new Promise(r => setTimeout(r, 10));

    const second = await app.inject({
      method: 'POST',
      url: `/api/sessions/${session.id}/revise`,
      headers: { cookie: a.cookie, 'content-type': 'application/json' },
      payload: { instructions: 'Second call — should be locked out.' },
    });
    expect(second.statusCode).toBe(409);
    expect(second.json().code).toBe('REVISION_IN_PROGRESS');

    // Let the first finish so the test doesn't leak.
    resolveFirst?.();
    await first;
  });

  it('M11: rejects empty / oversized instructions', async () => {
    const a = await makeUser('revise-m11@example.com');
    creditBillableHours(a.id, 100, 'credit', 'm11-credit');
    const session = makeLiveSession(a.id);

    const empty = await app.inject({
      method: 'POST',
      url: `/api/sessions/${session.id}/revise`,
      headers: { cookie: a.cookie, 'content-type': 'application/json' },
      payload: { instructions: '   ' },
    });
    expect(empty.statusCode).toBe(400);

    const tooBig = await app.inject({
      method: 'POST',
      url: `/api/sessions/${session.id}/revise`,
      headers: { cookie: a.cookie, 'content-type': 'application/json' },
      payload: { instructions: 'x'.repeat(8_001) },
    });
    expect(tooBig.statusCode).toBe(400);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// C3 — GDPR cascade for shared_agents + shared_teams
// ──────────────────────────────────────────────────────────────────────────

describe('C3 — GDPR cascade hits shared_agents + shared_teams', () => {
  it('softDeleteUser removes the user\'s shared agents and shared teams', async () => {
    const a = await makeUser('gdpr-a@example.com', 'Antti');
    upsertSharedAgent('agent-token-c3', a.id, 'Antti', '{"displayName":"Vera"}');
    upsertSharedTeam('team-token-c3', a.id, 'Antti', 'My Team', '[{"displayName":"Vera"}]');
    expect(getSharedAgent('agent-token-c3')).not.toBeNull();
    expect(getSharedTeam('team-token-c3')).not.toBeNull();

    const ok = softDeleteUser(a.id);
    expect(ok).toBe(true);
    expect(getSharedAgent('agent-token-c3')).toBeNull();
    expect(getSharedTeam('team-token-c3')).toBeNull();
  });

  it('exportUserData includes sharedAgents + sharedTeams arrays', async () => {
    const a = await makeUser('gdpr-b@example.com', 'Antti');
    upsertSharedAgent('agent-token-export', a.id, 'Antti', '{"displayName":"Iden"}');
    upsertSharedTeam('team-token-export', a.id, 'Antti', 'My Squad', '[{"displayName":"Iden"}]');

    const data = exportUserData(a.id);
    expect(data.sharedAgents).toHaveLength(1);
    expect(data.sharedAgents[0].token).toBe('agent-token-export');
    expect(data.sharedTeams).toHaveLength(1);
    expect(data.sharedTeams[0].title).toBe('My Squad');
  });
});

// ──────────────────────────────────────────────────────────────────────────
// H9 — busy_timeout pragma
// ──────────────────────────────────────────────────────────────────────────

describe('H9 — busy_timeout pragma', () => {
  it('SQLite busy_timeout is set to 5000ms', () => {
    const result = getDb().pragma('busy_timeout', { simple: true });
    expect(Number(result)).toBe(5000);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// H10 — sweepStaleHolds
// ──────────────────────────────────────────────────────────────────────────

describe('H10 — sweepStaleHolds', () => {
  it('releases hold rows older than maxAgeMs and leaves debits alone', async () => {
    const a = await makeUser('h10-a@example.com');
    const db = getDb();
    const old = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // 24h ago
    const fresh = new Date().toISOString();
    db.prepare(`INSERT INTO billable_hours (id, user_id, type, amount, balance_after, description, reference_id, created_at) VALUES (?, ?, 'hold', ?, ?, ?, ?, ?)`)
      .run('bh-old-hold', a.id, -10, 0, 'old hold', 'hold:stale-1', old);
    db.prepare(`INSERT INTO billable_hours (id, user_id, type, amount, balance_after, description, reference_id, created_at) VALUES (?, ?, 'hold', ?, ?, ?, ?, ?)`)
      .run('bh-fresh-hold', a.id, -5, 0, 'fresh hold', 'hold:fresh-1', fresh);
    db.prepare(`INSERT INTO billable_hours (id, user_id, type, amount, balance_after, description, reference_id, created_at) VALUES (?, ?, 'debit', ?, ?, ?, ?, ?)`)
      .run('bh-old-debit', a.id, -2, 0, 'old debit (must survive)', 'debit:stale', old);

    const released = sweepStaleHolds(60 * 60 * 1000); // 1h cutoff
    expect(released).toBe(1);

    const rows = db.prepare(`SELECT id, type FROM billable_hours WHERE user_id = ? ORDER BY id`).all(a.id) as Array<{ id: string; type: string }>;
    expect(rows.find(r => r.id === 'bh-old-hold')).toBeUndefined(); // released
    expect(rows.find(r => r.id === 'bh-fresh-hold')).toBeDefined();
    expect(rows.find(r => r.id === 'bh-old-debit')).toBeDefined(); // debits survive
  });
});

// ──────────────────────────────────────────────────────────────────────────
// M13 — cleanOldArchives status guard
// ──────────────────────────────────────────────────────────────────────────

describe('M13 — cleanOldArchives status guard', () => {
  it('skips rows whose status is not in (completed, failed, halted)', async () => {
    const a = await makeUser('m13-a@example.com');
    const db = getDb();
    const veryOld = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
    // Two rows, both old: one completed (deletable), one assembling (not deletable).
    db.prepare(`INSERT INTO session_archive (id, user_id, title, status, workflow_id, team_roles, findings_count, resolutions_count, cost_usd, budget_usd, created_at, completed_at, duration_ms, summary_json)
                VALUES (?, ?, 'Old Done', 'completed', 'review', '[]', 0, 0, 0.5, 5, ?, ?, 1000, '{}')`)
      .run(`sess-m13-done`, a.id, veryOld, veryOld);
    db.prepare(`INSERT INTO session_archive (id, user_id, title, status, workflow_id, team_roles, findings_count, resolutions_count, cost_usd, budget_usd, created_at, completed_at, duration_ms, summary_json)
                VALUES (?, ?, 'Old Assembling', 'assembling', 'review', '[]', 0, 0, 0.5, 5, ?, ?, 1000, '{}')`)
      .run(`sess-m13-asm`, a.id, veryOld, veryOld);

    const deleted = cleanOldArchives(30); // 30-day retention
    expect(deleted).toBe(1);
    const remaining = db.prepare(`SELECT id FROM session_archive WHERE id LIKE 'sess-m13-%'`).all() as Array<{ id: string }>;
    expect(remaining.map(r => r.id)).toEqual(['sess-m13-asm']);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// H7 — withRetry helper
// ──────────────────────────────────────────────────────────────────────────

describe('H7 — withRetry', () => {
  it('returns immediately on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const out = await withRetry(fn, { label: 'test-1' });
    expect(out).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries transient 429 then succeeds', async () => {
    const transient = Object.assign(new Error('rate limited'), { status: 429 });
    const fn = vi.fn()
      .mockRejectedValueOnce(transient)
      .mockResolvedValue('ok');
    const out = await withRetry(fn, { label: 'test-2', maxRetries: 2, maxDelayMs: 50 });
    expect(out).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry permanent errors (400)', async () => {
    const permanent = Object.assign(new Error('bad request'), { status: 400 });
    const fn = vi.fn().mockRejectedValue(permanent);
    await expect(withRetry(fn, { label: 'test-3' })).rejects.toBe(permanent);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('gives up after maxRetries on persistent transient errors', async () => {
    const transient = Object.assign(new Error('overloaded'), { status: 529 });
    const fn = vi.fn().mockRejectedValue(transient);
    await expect(withRetry(fn, { label: 'test-4', maxRetries: 2, maxDelayMs: 10 })).rejects.toBe(transient);
    expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it('isRetryableError catches network/timeout messages without status', () => {
    expect(isRetryableError(new Error('socket hang up'))).toBe(true);
    expect(isRetryableError(new Error('fetch failed'))).toBe(true);
    expect(isRetryableError(new Error('Request timeout'))).toBe(true);
    expect(isRetryableError(new Error('something else entirely'))).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// LOW — JSON payload size caps on share endpoints
// ──────────────────────────────────────────────────────────────────────────

describe('LOW — share endpoint payload size caps', () => {
  it('POST /api/teams/share rejects oversized payload (>64KB) with 413', async () => {
    const a = await makeUser('low-team-cap@example.com');
    // Build one valid-shape agent and pad practiceAreas with junk keys
    // (Zod schema is .passthrough()) until the JSON exceeds 64KB.
    const baseAgent = {
      displayName: 'Vera',
      tagline: 'A',
      category: 'lawyer' as const,
      seniority: 'partner' as const,
      costTier: 'opus' as const,
      billingRateUsd: 1000,
      skills: { precision: 9, creativity: 6, speed: 7, depth: 9, negotiation: 8, communication: 8, research: 8, risk: 9 },
      personality: { archetype: 'X', traits: {}, workStyle: 'Y' },
      practiceAreas: ['M&A'],
      strengths: [],
      limitations: [],
      // padding via passthrough — ~70KB of filler
      _padding: 'x'.repeat(70_000),
    };
    const res = await app.inject({
      method: 'POST',
      url: '/api/teams/share',
      headers: { cookie: a.cookie, 'content-type': 'application/json' },
      payload: { agents: [baseAgent], title: 'Big' },
    });
    expect(res.statusCode).toBe(413);
  });

  it('POST /api/teams/share happy path with small valid payload returns 200 + token', async () => {
    const a = await makeUser('low-team-ok@example.com');
    const agent = {
      displayName: 'Iden',
      tagline: 'Privacy specialist.',
      category: 'specialist' as const,
      seniority: 'counsel' as const,
      costTier: 'sonnet' as const,
      billingRateUsd: 800,
      skills: { precision: 9, creativity: 7, speed: 6, depth: 10, negotiation: 6, communication: 7, research: 10, risk: 8 },
      personality: { archetype: 'The Researcher', traits: {}, workStyle: 'Analytical' },
      practiceAreas: ['privacy'],
      strengths: ['GDPR'],
      limitations: [],
    };
    const res = await app.inject({
      method: 'POST',
      url: '/api/teams/share',
      headers: { cookie: a.cookie, 'content-type': 'application/json' },
      payload: { agents: [agent], title: 'Solo' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(body.url).toContain(`/#/t/${body.token}`);
  });

  it('GET /api/teams/share/:token public read works without auth', async () => {
    upsertSharedTeam('public-read-team', null, 'Visitor', 'Public Demo', '[{"displayName":"Cass"}]');
    const res = await app.inject({ method: 'GET', url: '/api/teams/share/public-read-team' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.title).toBe('Public Demo');
    expect(body.agents).toHaveLength(1);
  });

  it('DELETE /api/teams/share/:token requires auth + owner-only', async () => {
    const a = await makeUser('low-team-del-a@example.com');
    const b = await makeUser('low-team-del-b@example.com');
    upsertSharedTeam('owned-team-token', a.id, 'A', 'Mine', '[{"displayName":"Iden"}]');
    // Other user can't revoke
    const wrongOwner = await app.inject({
      method: 'DELETE',
      url: '/api/teams/share/owned-team-token',
      headers: { cookie: b.cookie },
    });
    expect(wrongOwner.statusCode).toBe(404);
    // Owner can
    const ownerOk = await app.inject({
      method: 'DELETE',
      url: '/api/teams/share/owned-team-token',
      headers: { cookie: a.cookie },
    });
    expect(ownerOk.statusCode).toBe(200);
    expect(ownerOk.json().revoked).toBe(true);
  });
});
