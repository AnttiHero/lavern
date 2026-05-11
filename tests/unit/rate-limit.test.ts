/**
 * Unit Tests — Per-User Rate Limiting (src/api/middleware/rate-limit.ts)
 *
 * Tests:
 * - Sliding window rate limit enforcement
 * - Rate limit allows requests within window
 * - Rate limit rejects when limit exceeded
 * - Retry-After calculation
 * - Stale user cleanup (memory leak prevention)
 * - Concurrent session cap (on session creation only)
 * - Unauthenticated users skip per-user limits
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock config before importing rate-limit
vi.mock('../../src/config.js', () => ({
  config: {
    sessionTtlMs: 60000,
    maxSessions: 100,
    auditDir: './test-audit',
    memoryDir: './test-memory',
    reportsDir: './test-reports',
    baselinesDir: './test-baselines',
    defaultBudgetUsd: 5.0,
    port: 3000,
    host: '0.0.0.0',
    corsOrigins: '*',
    baseUrl: 'http://localhost:3000',
    trustProxy: false,
    defaultModel: 'claude-opus-4-7',
    routerModel: 'claude-sonnet-4-5',
    logLevel: 'info',
    version: '0.10.0',
    // v3.5 env consolidation: rate-limit.ts now reads these from config
    rateLimitUserMax: 120,
    rateLimitUserWindowMs: 60000,
    maxUserSessions: 5,
  },
}));

// Import after mock setup
import {
  createPerUserRateLimitHook,
  PER_USER_MAX,
  PER_USER_WINDOW_MS,
  MAX_CONCURRENT_SESSIONS,
} from '../../src/api/middleware/rate-limit.js';

describe('Rate limit config', () => {
  it('has sensible defaults', () => {
    expect(PER_USER_MAX).toBe(120);
    expect(PER_USER_WINDOW_MS).toBe(60000);
    expect(MAX_CONCURRENT_SESSIONS).toBe(5);
  });
});

describe('createPerUserRateLimitHook', () => {
  let hook: ReturnType<typeof createPerUserRateLimitHook>;
  let mockSessionManager: any;

  beforeEach(() => {
    vi.useFakeTimers();

    mockSessionManager = {
      getAllSessions: vi.fn().mockReturnValue([]),
    };

    hook = createPerUserRateLimitHook(mockSessionManager);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function makeRequest(userId?: string, method = 'GET', url = '/api/test'): any {
    return {
      userId,
      method,
      url,
    };
  }

  function makeReply(): any {
    const headers: Record<string, string> = {};
    const reply = {
      _statusCode: 200,
      _body: null as any,
      _headers: headers,
      header(name: string, value: string) {
        headers[name] = value;
        return reply;
      },
      status(code: number) {
        reply._statusCode = code;
        return reply;
      },
      send(body: any) {
        reply._body = body;
        return reply;
      },
    };
    return reply;
  }

  it('skips rate limiting for unauthenticated requests', async () => {
    const req = makeRequest(undefined); // no userId
    const reply = makeReply();
    await hook(req, reply);
    expect(reply._body).toBeNull(); // no response sent = pass-through
  });

  it('allows requests within rate limit', async () => {
    const req = makeRequest('user-1');
    const reply = makeReply();
    await hook(req, reply);
    expect(reply._body).toBeNull(); // allowed
    expect(reply._headers['X-RateLimit-Limit']).toBe(String(PER_USER_MAX));
    expect(parseInt(reply._headers['X-RateLimit-Remaining'])).toBeLessThan(PER_USER_MAX);
  });

  it('rejects requests when rate limit exceeded', async () => {
    const userId = `rate-test-${Date.now()}`;

    // Exhaust the rate limit
    for (let i = 0; i < PER_USER_MAX; i++) {
      const req = makeRequest(userId);
      const reply = makeReply();
      await hook(req, reply);
      expect(reply._body).toBeNull(); // should all be allowed
    }

    // Next request should be rejected
    const req = makeRequest(userId);
    const reply = makeReply();
    await hook(req, reply);
    expect(reply._statusCode).toBe(429);
    expect(reply._body?.error).toBe('Too many requests');
    expect(reply._headers['Retry-After']).toBeDefined();
    expect(reply._headers['X-RateLimit-Remaining']).toBe('0');
  });

  it('allows requests again after window expires', async () => {
    const userId = `window-test-${Date.now()}`;

    // Exhaust the rate limit
    for (let i = 0; i < PER_USER_MAX; i++) {
      await hook(makeRequest(userId), makeReply());
    }

    // Verify rejected
    const rejectedReply = makeReply();
    await hook(makeRequest(userId), rejectedReply);
    expect(rejectedReply._statusCode).toBe(429);

    // Advance time past the window
    vi.advanceTimersByTime(PER_USER_WINDOW_MS + 1000);

    // Should be allowed again
    const allowedReply = makeReply();
    await hook(makeRequest(userId), allowedReply);
    expect(allowedReply._body).toBeNull(); // allowed
  });

  it('rejects session creation when at concurrent session cap', async () => {
    const userId = `session-cap-${Date.now()}`;

    // Mock active sessions at cap
    mockSessionManager.getAllSessions.mockReturnValue(
      Array.from({ length: MAX_CONCURRENT_SESSIONS }, (_, i) => ({
        userId,
        isHalted: () => false,
      }))
    );

    const req = makeRequest(userId, 'POST', '/api/sessions');
    const reply = makeReply();
    await hook(req, reply);

    expect(reply._statusCode).toBe(429);
    expect(reply._body?.error).toBe('Too many active sessions');
    expect(reply._body?.activeSessions).toBe(MAX_CONCURRENT_SESSIONS);
  });

  it('allows session creation when under concurrent cap', async () => {
    const userId = `session-ok-${Date.now()}`;

    // Mock 2 active sessions (under cap of 5)
    mockSessionManager.getAllSessions.mockReturnValue([
      { userId, isHalted: () => false },
      { userId, isHalted: () => false },
    ]);

    const req = makeRequest(userId, 'POST', '/api/sessions');
    const reply = makeReply();
    await hook(req, reply);

    expect(reply._body).toBeNull(); // allowed
  });

  it('does not check session cap for non-session-creation requests', async () => {
    const userId = `non-session-${Date.now()}`;

    // Mock sessions at cap
    mockSessionManager.getAllSessions.mockReturnValue(
      Array.from({ length: MAX_CONCURRENT_SESSIONS }, () => ({
        userId,
        isHalted: () => false,
      }))
    );

    // GET request — should not check session cap
    const req = makeRequest(userId, 'GET', '/api/sessions');
    const reply = makeReply();
    await hook(req, reply);
    expect(reply._body).toBeNull(); // allowed

    // POST to non-sessions endpoint — should not check session cap
    const req2 = makeRequest(userId, 'POST', '/api/briefing/analyze');
    const reply2 = makeReply();
    await hook(req2, reply2);
    expect(reply2._body).toBeNull(); // allowed
  });

  it('excludes halted sessions from concurrent count', async () => {
    const userId = `halted-${Date.now()}`;

    // Mock sessions: some halted
    mockSessionManager.getAllSessions.mockReturnValue([
      { userId, isHalted: () => false },
      { userId, isHalted: () => true },  // halted — shouldn't count
      { userId, isHalted: () => true },  // halted
      { userId, isHalted: () => false },
      { userId, isHalted: () => false },
    ]);

    // Only 3 active (2 halted) — should allow (cap is 5)
    const req = makeRequest(userId, 'POST', '/api/sessions');
    const reply = makeReply();
    await hook(req, reply);
    expect(reply._body).toBeNull(); // allowed
  });

  it('only counts sessions for the requesting user', async () => {
    const userId = `my-user-${Date.now()}`;

    // Mock sessions: many from other users, few from this user
    mockSessionManager.getAllSessions.mockReturnValue([
      { userId: 'other-user-1', isHalted: () => false },
      { userId: 'other-user-2', isHalted: () => false },
      { userId: 'other-user-3', isHalted: () => false },
      { userId, isHalted: () => false }, // only 1 for this user
    ]);

    const req = makeRequest(userId, 'POST', '/api/sessions');
    const reply = makeReply();
    await hook(req, reply);
    expect(reply._body).toBeNull(); // allowed — only 1 session for this user
  });

  it('rate limits are per-user (not global)', async () => {
    const user1 = `user-a-${Date.now()}`;
    const user2 = `user-b-${Date.now()}`;

    // Exhaust user1's limit
    for (let i = 0; i < PER_USER_MAX; i++) {
      await hook(makeRequest(user1), makeReply());
    }

    // user1 should be rejected
    const rejectedReply = makeReply();
    await hook(makeRequest(user1), rejectedReply);
    expect(rejectedReply._statusCode).toBe(429);

    // user2 should still be allowed
    const allowedReply = makeReply();
    await hook(makeRequest(user2), allowedReply);
    expect(allowedReply._body).toBeNull();
  });
});
