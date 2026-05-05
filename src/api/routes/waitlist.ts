/**
 * Waitlist Routes — Join, check status, admin invite & listing.
 *
 * POST  /api/waitlist         — Join waitlist (public, no auth needed)
 * GET   /api/waitlist/status  — Check status (public)
 * POST  /api/waitlist/invite  — Admin: invite user
 * GET   /api/waitlist/list    — Admin: list entries
 */

import * as crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../../config.js';
import {
  addWaitlistEntry,
  getWaitlistEntry,
  inviteWaitlistEntry,
  getWaitlistEntries,
  countWaitlist,
  logAuditEvent,
} from '../../db/database.js';
import { sendWaitlistConfirmation, sendInviteEmail } from '../../email/send.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('WAITLIST');

// ── Schemas ──────────────────────────────────────────────────────────────

const JoinWaitlistSchema = z.object({
  email: z.string().email().max(200),
  source: z.string().max(100).optional(),
}).strict();

const InviteSchema = z.object({
  email: z.string().email().max(200),
}).strict();

// ── Helpers ──────────────────────────────────────────────────────────────

function verifyAdminKey(request: { headers: Record<string, string | string[] | undefined> }): string | null {
  const key = request.headers['x-admin-key'];
  if (typeof key !== 'string') return 'Missing X-Admin-Key header';
  if (!config.billableHours.adminKey) return 'Admin endpoints not configured';
  // Constant-time comparison to prevent timing attacks
  const expected = config.billableHours.adminKey;
  const keyBuf = Buffer.from(key);
  const expectedBuf = Buffer.from(expected);
  if (keyBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(keyBuf, expectedBuf)) {
    return 'Invalid admin key';
  }
  return null;
}

// ── Routes ───────────────────────────────────────────────────────────────

export function registerWaitlistRoutes(fastify: FastifyInstance): void {

  // ── POST /api/waitlist — Join the waitlist ──────────────────────────────

  fastify.post('/api/waitlist', async (request, reply) => {
    const parsed = JoinWaitlistSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid request', details: parsed.error.issues });
    }
    const { email, source } = parsed.data;

    // Check for duplicate
    const existing = getWaitlistEntry(email);
    if (existing) {
      return reply.status(409).send({ error: 'This email is already on the waitlist.' });
    }

    const entry = addWaitlistEntry(email, source ?? 'website');

    logAuditEvent({
      action: 'waitlist_join',
      resource: 'waitlist',
      ip: request.ip,
      userAgent: request.headers['user-agent'],
      detail: { email: entry.email, source: entry.source },
    });

    // Fire-and-forget — don't block the response on email delivery
    sendWaitlistConfirmation(entry.email).catch(err => logger.error('waitlist_confirmation_failed', err));

    return reply.status(201).send({
      id: entry.id,
      email: entry.email,
      status: entry.status,
      message: "You're on the list.",
    });
  });

  // ── GET /api/waitlist/status — Check waitlist status ────────────────────

  fastify.get('/api/waitlist/status', async (request, reply) => {
    const { email } = request.query as { email?: string };
    if (!email || typeof email !== 'string') {
      return reply.status(400).send({ error: 'Missing email query parameter' });
    }

    const entry = getWaitlistEntry(email);
    return reply.send({ status: entry?.status ?? 'not_found' });
  });

  // ── POST /api/waitlist/invite — Admin: invite a user ────────────────────

  fastify.post('/api/waitlist/invite', async (request, reply) => {
    const adminError = verifyAdminKey(request);
    if (adminError === 'Admin endpoints not configured') {
      return reply.status(503).send({ error: adminError });
    }
    if (adminError) {
      return reply.status(401).send({ error: adminError });
    }

    const parsed = InviteSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid request', details: parsed.error.issues });
    }
    const { email } = parsed.data;

    // Ensure the email is on the waitlist
    const entry = getWaitlistEntry(email);
    if (!entry) {
      return reply.status(404).send({ error: 'Email not found on waitlist' });
    }
    if (entry.status !== 'waiting') {
      return reply.status(409).send({ error: `Entry already has status: ${entry.status}` });
    }

    try {
      const inviteCode = inviteWaitlistEntry(email);

      logAuditEvent({
        action: 'waitlist_invite',
        resource: 'waitlist',
        ip: request.ip,
        userAgent: request.headers['user-agent'],
        detail: { email, inviteCode },
      });

      // Send invite email with the code — fire-and-forget
      sendInviteEmail(email, inviteCode).catch(err => logger.error('invite_email_failed', err));

      return reply.send({ inviteCode, email });
    } catch (err) {
      logger.error('invite_failed', { error: err instanceof Error ? err.message : String(err) });
      return reply.status(500).send({ error: 'Failed to invite. Please try again.' });
    }
  });

  // ── GET /api/waitlist/list — Admin: list waitlist entries ────────────────

  fastify.get('/api/waitlist/list', async (request, reply) => {
    const adminError = verifyAdminKey(request);
    if (adminError === 'Admin endpoints not configured') {
      return reply.status(503).send({ error: adminError });
    }
    if (adminError) {
      return reply.status(401).send({ error: adminError });
    }

    const query = request.query as { status?: string; limit?: string };
    const status = query.status;
    const parsedLimit = query.limit ? parseInt(query.limit, 10) : 100;
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 100;

    const entries = getWaitlistEntries({ status, limit });
    const counts = countWaitlist();

    logAuditEvent({
      action: 'waitlist_list',
      resource: 'waitlist',
      ip: request.ip,
      userAgent: request.headers['user-agent'],
      detail: { filterStatus: status, resultCount: entries.length },
    });

    return reply.send({ entries, counts });
  });
}
