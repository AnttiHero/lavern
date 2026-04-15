/**
 * Admin routes — operator-only observability endpoints.
 *
 * Gated by `X-Admin-Key` header against `LAVERN_ADMIN_KEY`. Returns 503 when
 * the admin key is unset (admin endpoints disabled in that case). Constant-time
 * comparison to prevent timing attacks, matching the pattern in waitlist.ts.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import crypto from 'node:crypto';
import { config } from '../../config.js';
import { getDailySpendStats } from '../../utils/spend-tracker.js';
import { getUserSpendBreakdown } from '../../db/database.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('ADMIN');

function verifyAdminKey(
  request: FastifyRequest,
): { ok: true } | { ok: false; status: number; error: string } {
  const raw = request.headers['x-admin-key'];
  if (typeof raw !== 'string') {
    return { ok: false, status: 401, error: 'Missing X-Admin-Key header' };
  }
  if (!config.billableHours.adminKey) {
    return { ok: false, status: 503, error: 'Admin endpoints not configured' };
  }
  const expected = config.billableHours.adminKey;
  const keyBuf = Buffer.from(raw);
  const expectedBuf = Buffer.from(expected);
  if (keyBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(keyBuf, expectedBuf)) {
    return { ok: false, status: 403, error: 'Invalid admin key' };
  }
  return { ok: true };
}

export function registerAdminRoutes(fastify: FastifyInstance): void {
  // ── GET /api/admin/spend-status ──────────────────────────────────────
  //
  // Returns current daily spend trajectory for operator dashboards / cron
  // polls. Mirror of the data that drives owner-webhook alerts.
  fastify.get('/api/admin/spend-status', async (request, reply) => {
    const auth = verifyAdminKey(request);
    if (!auth.ok) {
      return reply.status(auth.status).send({ error: auth.error });
    }

    const stats = getDailySpendStats();
    logger.info('spend-status requested', {
      date: stats.date,
      pct: stats.pct.toFixed(1),
    });

    return reply.send({
      date: stats.date,
      totalUsd: Number(stats.totalUsd.toFixed(2)),
      capUsd: stats.capUsd,
      pct: Number(stats.pct.toFixed(1)),
      remainingUsd: Number(stats.remainingUsd.toFixed(2)),
      capReached: stats.capReached,
      thresholdsFired: stats.thresholdsFired,
      nextThresholdPct: stats.nextThresholdPct,
      ownerWebhookConfigured: Boolean(config.ownerAlertWebhook),
    });
  });

  // ── GET /api/admin/user-spend ────────────────────────────────────────
  //
  // Per-user spend breakdown within a date range. The primary operational
  // question when a trajectory alert fires is "who's driving this?" — this
  // endpoint answers that in one SQL query against the session_archive.
  //
  // Query params:
  //   ?since=<ISO-8601>   — inclusive lower bound; default: today 00:00 UTC
  //   ?until=<ISO-8601>   — inclusive upper bound; default: now
  //   ?limit=<1..500>     — max rows; default 50
  //
  // Rows are ordered totalUsd DESC so the top spenders surface first. The
  // anonymous bucket (userId=null) is included — useful for spotting unauth
  // API traffic spikes that the per-session rate limiter didn't catch.
  fastify.get('/api/admin/user-spend', async (request, reply) => {
    const auth = verifyAdminKey(request);
    if (!auth.ok) {
      return reply.status(auth.status).send({ error: auth.error });
    }

    const q = request.query as Record<string, string | undefined>;

    // Default window: today 00:00 UTC → now. Matches the daily spend tracker's
    // reset boundary so the numbers line up with /spend-status.
    const now = new Date();
    const todayStart = new Date(Date.UTC(
      now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0,
    ));

    const since = q.since ?? todayStart.toISOString();
    const until = q.until ?? now.toISOString();

    // Validate ISO strings — SQLite compares them as text, so garbage in would
    // return arbitrary (possibly huge) result sets rather than a clean 400.
    if (Number.isNaN(Date.parse(since)) || Number.isNaN(Date.parse(until))) {
      return reply.status(400).send({ error: 'since/until must be valid ISO-8601 timestamps' });
    }

    // Clamp limit to a sane range. 500 is plenty — if you need more, paginate.
    const rawLimit = Number(q.limit);
    const limit = Number.isFinite(rawLimit) && rawLimit >= 1 && rawLimit <= 500
      ? Math.floor(rawLimit) : 50;

    const rows = getUserSpendBreakdown(since, until, limit);

    logger.info('user-spend requested', { since, until, limit, rows: rows.length });

    return reply.send({
      since,
      until,
      rows: rows.map((r) => ({
        userId: r.userId,
        email: r.email,
        sessions: r.sessions,
        totalUsd: Number((r.totalUsd ?? 0).toFixed(4)),
        avgUsd: Number((r.avgUsd ?? 0).toFixed(4)),
        maxUsd: Number((r.maxUsd ?? 0).toFixed(4)),
        lastSessionAt: r.lastSessionAt,
      })),
      // Totals let dashboards show "top-10 accounts for X% of spend today"
      // without a second round-trip.
      summary: {
        totalUsd: Number(rows.reduce((acc, r) => acc + (r.totalUsd ?? 0), 0).toFixed(4)),
        totalSessions: rows.reduce((acc, r) => acc + (r.sessions ?? 0), 0),
        userCount: rows.length,
      },
    });
  });
}
