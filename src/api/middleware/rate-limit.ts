/**
 * Per-User Rate Limiting — Prevents one user from starving others.
 *
 * The global @fastify/rate-limit is per-IP (100/min). This middleware adds
 * a per-user layer keyed by auth token (userId). Runs AFTER auth middleware
 * so we have the userId available.
 *
 * Limits:
 *   - 30 API requests/min per authenticated user
 *   - 5 concurrent sessions max per user
 *
 * Unauthenticated requests fall through to the global per-IP limit.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { SessionManager } from '../../session/session-manager.js';
import { config } from '../../config.js';

// ── Config ────────────────────────────────────────────────────────────────
// 120/min = 2 rps sustained. Modern SPAs fan out multiple reads per view
// (profile, billing, custom agents, saved teams, polling). 30/min was
// tripping during normal dashboard navigation.
const PER_USER_MAX = config.rateLimitUserMax;
const PER_USER_WINDOW_MS = config.rateLimitUserWindowMs;
const MAX_CONCURRENT_SESSIONS = config.maxUserSessions;

// ── Sliding window counters ──────────────────────────────────────────────

interface UserWindow {
  timestamps: number[];
  lastCleanup: number;
}

const userWindows = new Map<string, UserWindow>();

// Periodic cleanup to prevent memory leak from inactive users
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
let lastGlobalCleanup = Date.now();

function cleanupStaleUsers(): void {
  const now = Date.now();
  if (now - lastGlobalCleanup < CLEANUP_INTERVAL_MS) return;
  lastGlobalCleanup = now;

  for (const [userId, window] of userWindows) {
    if (now - window.lastCleanup > PER_USER_WINDOW_MS * 2) {
      userWindows.delete(userId);
    }
  }
}

/**
 * Check if a user is within their per-user rate limit.
 * Returns { allowed: true } or { allowed: false, retryAfterMs }.
 */
function checkUserRateLimit(userId: string): { allowed: boolean; retryAfterMs?: number; remaining?: number } {
  const now = Date.now();
  cleanupStaleUsers();

  let window = userWindows.get(userId);
  if (!window) {
    window = { timestamps: [], lastCleanup: now };
    userWindows.set(userId, window);
  }

  // Remove timestamps outside the window
  const cutoff = now - PER_USER_WINDOW_MS;
  window.timestamps = window.timestamps.filter(ts => ts > cutoff);
  window.lastCleanup = now;

  if (window.timestamps.length >= PER_USER_MAX) {
    // Calculate when the oldest request in the window will expire
    const oldestInWindow = window.timestamps[0];
    const retryAfterMs = oldestInWindow + PER_USER_WINDOW_MS - now;
    return { allowed: false, retryAfterMs: Math.max(1000, retryAfterMs) };
  }

  window.timestamps.push(now);
  return { allowed: true, remaining: PER_USER_MAX - window.timestamps.length };
}

/**
 * Count how many active (non-completed) sessions a user has.
 */
function countUserSessions(userId: string, sessionManager: SessionManager): number {
  let count = 0;
  for (const session of sessionManager.getAllSessions()) {
    if (session.userId === userId && !session.isHalted()) {
      count++;
    }
  }
  return count;
}

// ── Fastify hook ─────────────────────────────────────────────────────────

/**
 * Create a per-user rate limiting hook.
 * Returns a Fastify onRequest hook to register after auth middleware.
 */
export function createPerUserRateLimitHook(sessionManager: SessionManager) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = (request as FastifyRequest & { userId?: string }).userId;

    // No authenticated user — skip (global per-IP rate limit still applies)
    if (!userId) return;

    // ── Per-user request rate ────────────────────────────────────────────
    const result = checkUserRateLimit(userId);
    if (!result.allowed) {
      const retryAfterSec = Math.ceil((result.retryAfterMs ?? 60000) / 1000);
      reply.header('Retry-After', String(retryAfterSec));
      reply.header('X-RateLimit-Limit', String(PER_USER_MAX));
      reply.header('X-RateLimit-Remaining', '0');
      return reply.status(429).send({
        error: 'Too many requests',
        message: `Rate limit exceeded: ${PER_USER_MAX} requests per ${PER_USER_WINDOW_MS / 1000}s. Retry after ${retryAfterSec}s.`,
        retryAfter: retryAfterSec,
      });
    }

    // Add rate limit headers for successful requests
    reply.header('X-RateLimit-Limit', String(PER_USER_MAX));
    reply.header('X-RateLimit-Remaining', String(result.remaining ?? 0));

    // ── Concurrent session cap (only on session creation) ────────────────
    const urlPath = request.url.split('?')[0];
    if (request.method === 'POST' && urlPath === '/api/sessions') {
      const activeSessions = countUserSessions(userId, sessionManager);
      if (activeSessions >= MAX_CONCURRENT_SESSIONS) {
        return reply.status(429).send({
          error: 'Too many active sessions',
          message: `You have ${activeSessions} active sessions (max ${MAX_CONCURRENT_SESSIONS}). Wait for existing sessions to complete or cancel them.`,
          activeSessions,
          maxSessions: MAX_CONCURRENT_SESSIONS,
        });
      }
    }
  };
}

/**
 * Exported for testing.
 */
export { PER_USER_MAX, PER_USER_WINDOW_MS, MAX_CONCURRENT_SESSIONS };
