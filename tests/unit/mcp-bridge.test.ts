/**
 * Unit tests — Remote MCP Bridge (Stage 1 scaffolding).
 *
 * Covers the bits we can verify without standing up Fastify:
 *   - Allowlist membership
 *   - Auth verification (shared secret + session ID)
 *   - Feature-flag guard (refuses to register with weak/missing secret)
 *
 * Live JSON-RPC dispatch is exercised by the integration smoke test.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  COUNSEL_REMOTE_TOOLS,
  isRemoteToolAllowed,
} from '../../src/mcp/remote-bridge/tool-allowlist.js';
import {
  authenticateBridgeRequest,
  BRIDGE_SECRET_ENV,
} from '../../src/mcp/remote-bridge/session-auth.js';
import type { FastifyRequest } from 'fastify';
import type { SessionManager } from '../../src/session/session-manager.js';
import type { SessionState } from '../../src/session/session-state.js';

// Minimal fake FastifyRequest — the auth helper only touches `.headers`.
function fakeReq(headers: Record<string, string | undefined>): FastifyRequest {
  return { headers } as unknown as FastifyRequest;
}

// Minimal fake SessionManager — `.getSession(id)` is all that's called.
function fakeManager(sessions: Record<string, SessionState | undefined>): SessionManager {
  return {
    getSession: (id: string) => sessions[id],
  } as unknown as SessionManager;
}

const VALID_SESSION = { id: 'sess_abc123' } as unknown as SessionState;
const STRONG_SECRET = 'x'.repeat(40); // ≥32 chars — passes the weakness guard

describe('remote MCP bridge — allowlist', () => {
  it('exposes exactly the 12 Counsel-subset tools', () => {
    expect(COUNSEL_REMOTE_TOOLS).toHaveLength(12);
  });

  it('allow-lists mcp__shem__ tools used by counsel workflow', () => {
    expect(isRemoteToolAllowed('mcp__shem__get_current_step')).toBe(true);
    expect(isRemoteToolAllowed('mcp__shem__search_knowledge_base')).toBe(true);
  });

  it('denies mutation-heavy tools not in Counsel', () => {
    // Debate board, scoring engine, approval gate: all outside Counsel.
    expect(isRemoteToolAllowed('mcp__shem__post_finding')).toBe(false);
    expect(isRemoteToolAllowed('mcp__shem__request_approval')).toBe(false);
    expect(isRemoteToolAllowed('mcp__shem__score_output')).toBe(false);
  });

  it('denies arbitrary unknown names', () => {
    expect(isRemoteToolAllowed('')).toBe(false);
    expect(isRemoteToolAllowed('Read')).toBe(false);
    expect(isRemoteToolAllowed('mcp__shem__DROP_TABLE')).toBe(false);
  });
});

describe('remote MCP bridge — session auth', () => {
  let prevSecret: string | undefined;

  beforeEach(() => {
    prevSecret = process.env[BRIDGE_SECRET_ENV];
    process.env[BRIDGE_SECRET_ENV] = STRONG_SECRET;
  });

  afterEach(() => {
    if (prevSecret === undefined) delete process.env[BRIDGE_SECRET_ENV];
    else process.env[BRIDGE_SECRET_ENV] = prevSecret;
  });

  it('503s when the bridge secret is not configured', () => {
    delete process.env[BRIDGE_SECRET_ENV];
    const result = authenticateBridgeRequest(
      fakeReq({ authorization: `Bearer ${STRONG_SECRET}`, 'x-lavern-session-id': 'sess_abc123' }),
      fakeManager({ sess_abc123: VALID_SESSION }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(503);
      expect(result.code).toBe('bridge_not_configured');
    }
  });

  it('401s when Authorization header is missing', () => {
    const result = authenticateBridgeRequest(
      fakeReq({ 'x-lavern-session-id': 'sess_abc123' }),
      fakeManager({ sess_abc123: VALID_SESSION }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(401);
  });

  it('403s when the secret does not match (constant-time)', () => {
    const result = authenticateBridgeRequest(
      fakeReq({ authorization: `Bearer ${'y'.repeat(40)}`, 'x-lavern-session-id': 'sess_abc123' }),
      fakeManager({ sess_abc123: VALID_SESSION }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });

  it('403s when the supplied token is a length-different prefix of the secret', () => {
    // Prevents accidental `timingSafeEqual` length mismatch throwing; we
    // should return a clean 403 instead.
    const result = authenticateBridgeRequest(
      fakeReq({ authorization: `Bearer short`, 'x-lavern-session-id': 'sess_abc123' }),
      fakeManager({ sess_abc123: VALID_SESSION }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });

  it('400s when the session-id header is missing', () => {
    const result = authenticateBridgeRequest(
      fakeReq({ authorization: `Bearer ${STRONG_SECRET}` }),
      fakeManager({}),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });

  it('400s when the session id is malformed', () => {
    const result = authenticateBridgeRequest(
      fakeReq({ authorization: `Bearer ${STRONG_SECRET}`, 'x-lavern-session-id': 'bad id with spaces!' }),
      fakeManager({}),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('bad_session_id');
  });

  it('404s when the session id is well-formed but not resident', () => {
    const result = authenticateBridgeRequest(
      fakeReq({ authorization: `Bearer ${STRONG_SECRET}`, 'x-lavern-session-id': 'sess_notfound' }),
      fakeManager({}),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
      expect(result.code).toBe('session_not_resident');
    }
  });

  it('returns the session on success', () => {
    const result = authenticateBridgeRequest(
      fakeReq({ authorization: `Bearer ${STRONG_SECRET}`, 'x-lavern-session-id': 'sess_abc123' }),
      fakeManager({ sess_abc123: VALID_SESSION }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.session.id).toBe('sess_abc123');
  });
});
