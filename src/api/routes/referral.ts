/**
 * Referral Routes — Get referral code, stats, and share link.
 *
 * GET /api/referral — Get current user's referral code and stats
 */

import type { FastifyInstance } from 'fastify';
import { getUserByToken, getReferralStats } from '../../db/database.js';
import { parseCookieToken } from '../middleware/auth.js';
import { config } from '../../config.js';

export function registerReferralRoutes(fastify: FastifyInstance): void {

  // ── GET /api/referral ──────────────────────────────────────────────────

  fastify.get('/api/referral', async (request, reply) => {
    const token = parseCookieToken(request.headers.cookie);
    if (!token) {
      return reply.status(401).send({ error: 'Not authenticated.' });
    }

    const user = getUserByToken(token);
    if (!user) {
      return reply.status(401).send({ error: 'Session expired.' });
    }

    const stats = getReferralStats(user.id);
    const shareUrl = `${config.email.appUrl}/#/login?ref=${stats.referralCode}`;

    return reply.send({
      referralCode: stats.referralCode,
      shareUrl,
      referralCount: stats.referralCount,
      hoursEarned: stats.hoursEarned,
      hoursPerReferral: config.billableHours.referralHours,
    });
  });
}
