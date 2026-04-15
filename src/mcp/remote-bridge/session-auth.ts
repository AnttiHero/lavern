/**
 * Remote MCP Bridge — Session Authentication.
 *
 * The Managed Agents runtime authenticates to our bridge using a static
 * vault-stored shared secret (documented in docs/managed-agents-migration.md
 * as "vault-static auth, not per-session JWTs"). On top of that static secret,
 * each request carries the Lavern session ID whose tools it wants to invoke.
 *
 * Two-factor check per request:
 *   1. `Authorization: Bearer <LAVERN_MANAGED_AGENTS_BRIDGE_SECRET>` — proves
 *      the caller is the Managed Agents service.
 *   2. `X-Lavern-Session-Id: <sessionId>` — identifies which live session's
 *      tools and state to execute against. The session must be resident in
 *      the SessionManager (archived sessions are not addressable — their
 *      tools have no live event bus).
 *
 * Constant-time comparison on the shared secret to prevent timing attacks,
 * matching the pattern used in `src/api/routes/admin.ts` and `waitlist.ts`.
 */

import crypto from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import type { SessionManager } from '../../session/session-manager.js';
import type { SessionState } from '../../session/session-state.js';

export type AuthResult =
  | { ok: true; session: SessionState }
  | { ok: false; status: number; code: string; error: string };

/** Env var carrying the shared bridge secret. Must be set when the bridge
 *  is enabled via `LAVERN_MANAGED_AGENTS_BRIDGE=1`; the bridge refuses to
 *  register without it. */
export const BRIDGE_SECRET_ENV = 'LAVERN_MANAGED_AGENTS_BRIDGE_SECRET';

export function getBridgeSecret(): string {
  return process.env[BRIDGE_SECRET_ENV] ?? '';
}

/**
 * Verify a bridge request's shared secret + session ID. Returns the live
 * SessionState on success, or a structured error describing which check
 * failed (the bridge server maps this to an HTTP response).
 */
export function authenticateBridgeRequest(
  request: FastifyRequest,
  sessionManager: SessionManager,
): AuthResult {
  const secret = getBridgeSecret();
  if (!secret) {
    // Fail closed — if the server started somehow without the secret, every
    // call is denied rather than silently granting access.
    return { ok: false, status: 503, code: 'bridge_not_configured', error: 'Remote MCP bridge not configured' };
  }

  const authHeader = request.headers['authorization'];
  if (typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    return { ok: false, status: 401, code: 'missing_auth', error: 'Missing or malformed Authorization header' };
  }
  const token = authHeader.slice('Bearer '.length).trim();

  const tokenBuf = Buffer.from(token);
  const secretBuf = Buffer.from(secret);
  if (
    tokenBuf.length !== secretBuf.length ||
    !crypto.timingSafeEqual(tokenBuf, secretBuf)
  ) {
    return { ok: false, status: 403, code: 'invalid_auth', error: 'Invalid bridge credentials' };
  }

  const rawSessionId = request.headers['x-lavern-session-id'];
  if (typeof rawSessionId !== 'string' || rawSessionId.length === 0) {
    return { ok: false, status: 400, code: 'missing_session', error: 'Missing X-Lavern-Session-Id header' };
  }
  // Session IDs are generated via crypto.randomBytes → base64url; reject
  // anything with structural oddities to keep log strings clean and avoid
  // header-injection mischief.
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(rawSessionId)) {
    return { ok: false, status: 400, code: 'bad_session_id', error: 'Malformed session ID' };
  }

  const session = sessionManager.getSession(rawSessionId);
  if (!session) {
    // Archived sessions cannot be served — the bridge only operates against
    // live sessions because tool execution requires the live event bus and
    // mutable debate state. The Managed Agents caller should treat this as
    // a terminal error for that session.
    return { ok: false, status: 404, code: 'session_not_resident', error: 'Session not resident in memory' };
  }

  return { ok: true, session };
}
