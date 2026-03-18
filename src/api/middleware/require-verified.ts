/**
 * Email verification enforcement middleware.
 *
 * Blocks authenticated users whose email is not yet verified from
 * accessing paid operations. Anonymous requests (QuickStart) and
 * exempt paths (auth, billing, read-only metadata) pass through.
 */
import type { FastifyRequest, FastifyReply } from 'fastify';
import { isEmailVerified } from '../../db/database.js';

/**
 * Create a Fastify onRequest hook that enforces email verification.
 *
 * @param exemptPrefixes — URL prefixes that unverified users may access
 *   (e.g. `/api/auth/`, `/api/billing/`). Matched with startsWith.
 */
export function createRequireVerifiedHook(
  exemptPrefixes: string[],
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    // No userId means unauthenticated (public/QuickStart) — skip
    const userId = (request as FastifyRequest & { userId?: string }).userId;
    if (!userId) return;

    // API clients (Bearer auth) are machine agents — skip verification
    const client = (request as FastifyRequest & { client?: { type: string } }).client;
    if (client) return;

    // Read-only methods never mutate — skip
    if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') return;

    // Exempt paths (auth, billing, etc.)
    const urlPath = request.url.split('?')[0];
    for (const prefix of exemptPrefixes) {
      if (urlPath.startsWith(prefix)) return;
    }

    // Check verification status
    if (!isEmailVerified(userId)) {
      return reply.status(403).send({
        error: 'Email verification required',
        code: 'EMAIL_NOT_VERIFIED',
        detail: 'Please verify your email address before using Lavern.',
      });
    }
  };
}
