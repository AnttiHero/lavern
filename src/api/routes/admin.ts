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
}
