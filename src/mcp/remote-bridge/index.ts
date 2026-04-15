/**
 * Remote MCP Bridge — Public Entry Point.
 *
 * Feature-flagged off by default. To enable:
 *   1. Set `LAVERN_MANAGED_AGENTS_BRIDGE=1`
 *   2. Set `LAVERN_MANAGED_AGENTS_BRIDGE_SECRET=<strong random>` (vault value
 *      shared with the Managed Agents deployment).
 *
 * Without both env vars set, `maybeRegisterRemoteBridge` is a no-op and the
 * HTTP endpoint does not exist — this is the important property while we
 * ship the bridge scaffolding in production without wiring it into the
 * live agent path.
 */

import type { FastifyInstance } from 'fastify';
import type { SessionManager } from '../../session/session-manager.js';
import { registerBridgeServer } from './server.js';
import { BRIDGE_SECRET_ENV } from './session-auth.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('MCP-BRIDGE');

const FLAG_ENV = 'LAVERN_MANAGED_AGENTS_BRIDGE';

export function isBridgeEnabled(): boolean {
  return process.env[FLAG_ENV] === '1';
}

/**
 * Register the remote MCP bridge on `fastify` if (and only if) the feature
 * flag is set AND the bridge secret is configured. Logs and refuses to
 * register in any other state so a half-configured bridge cannot
 * accidentally be exposed.
 */
export function maybeRegisterRemoteBridge(
  fastify: FastifyInstance,
  sessionManager: SessionManager,
): void {
  if (!isBridgeEnabled()) return;

  const secret = process.env[BRIDGE_SECRET_ENV] ?? '';
  if (!secret) {
    logger.warn('remote MCP bridge flag is set but secret is missing — refusing to register', {
      flag: FLAG_ENV,
      secretEnv: BRIDGE_SECRET_ENV,
    });
    return;
  }
  // Reject weak secrets loudly — a trivially guessable bridge secret would
  // hand an unauthenticated remote attacker the whole Counsel tool surface.
  if (secret.length < 32) {
    logger.warn('remote MCP bridge secret is too short (<32 chars) — refusing to register', {
      secretEnv: BRIDGE_SECRET_ENV,
    });
    return;
  }

  registerBridgeServer(fastify, sessionManager);
  logger.info('remote MCP bridge registered at POST /api/mcp/bridge (Stage 1: scaffolded, tools return not_yet_wired)');
}

// Re-exports so callers don't need to know the internal module layout.
export { COUNSEL_REMOTE_TOOLS, isRemoteToolAllowed } from './tool-allowlist.js';
