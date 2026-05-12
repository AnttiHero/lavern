/**
 * Unit Tests — Auth Middleware (src/api/middleware/auth.ts)
 *
 * Tests:
 * - ClientRegistry (register, authenticate, remove, list)
 * - parseCookieToken (parsing lavern_token from cookie headers)
 * - createAuthMiddleware (public path matching: exact, prefix, wildcard, method-specific)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClientRegistry, parseCookieToken, createAuthMiddleware } from '../../src/api/middleware/auth.js';

// ── ClientRegistry ──────────────────────────────────────────────────────

describe('ClientRegistry', () => {
  let registry: ClientRegistry;

  beforeEach(() => {
    registry = new ClientRegistry();
  });

  describe('registerClient', () => {
    it('should register a human client and return an API key', () => {
      const { client, apiKey } = registry.registerClient('human', { name: 'Test User' });
      expect(client.type).toBe('human');
      expect(client.name).toBe('Test User');
      expect(client.id).toMatch(/^client-/);
      expect(apiKey).toMatch(/^shem_human_/);
      expect(client.registeredAt).toBeDefined();
    });

    it('should register an agent client with capabilities', () => {
      const { client, apiKey } = registry.registerClient('agent', {
        name: 'Bot',
        capabilities: ['contract-review', 'research'],
        callbackUrl: 'https://example.com/webhook',
        autoApproveThreshold: 0.8,
      });
      expect(client.type).toBe('agent');
      expect(apiKey).toMatch(/^shem_agent_/);
      expect(client.capabilities).toEqual(['contract-review', 'research']);
      expect(client.callbackUrl).toBe('https://example.com/webhook');
      expect(client.autoApproveThreshold).toBe(0.8);
    });

    it('should generate unique IDs for each client', () => {
      const { client: c1 } = registry.registerClient('human');
      const { client: c2 } = registry.registerClient('human');
      expect(c1.id).not.toBe(c2.id);
    });

    it('should generate unique API keys for each client', () => {
      const { apiKey: k1 } = registry.registerClient('human');
      const { apiKey: k2 } = registry.registerClient('human');
      expect(k1).not.toBe(k2);
    });
  });

  describe('authenticate', () => {
    it('should authenticate with a valid API key', () => {
      const { client, apiKey } = registry.registerClient('agent', { name: 'Auth Test' });
      const authed = registry.authenticate(apiKey);
      expect(authed).not.toBeNull();
      expect(authed!.id).toBe(client.id);
      expect(authed!.name).toBe('Auth Test');
    });

    it('should return null for an invalid API key', () => {
      registry.registerClient('human');
      const result = registry.authenticate('shem_human_invalid_key_12345');
      expect(result).toBeNull();
    });

    it('should return null for an empty API key', () => {
      expect(registry.authenticate('')).toBeNull();
    });

    it('should update lastActiveAt on successful authentication', () => {
      const { client, apiKey } = registry.registerClient('agent');
      expect(client.lastActiveAt).toBeUndefined();

      const authed = registry.authenticate(apiKey);
      expect(authed!.lastActiveAt).toBeDefined();
    });

    it('should not authenticate after client is removed', () => {
      const { client, apiKey } = registry.registerClient('human');
      registry.removeClient(client.id);
      expect(registry.authenticate(apiKey)).toBeNull();
    });
  });

  describe('getClient', () => {
    it('should return a registered client by ID', () => {
      const { client } = registry.registerClient('human', { name: 'Lookup' });
      expect(registry.getClient(client.id)?.name).toBe('Lookup');
    });

    it('should return null for unknown ID', () => {
      expect(registry.getClient('nonexistent')).toBeNull();
    });
  });

  describe('getAllClients', () => {
    it('should return empty array when no clients registered', () => {
      expect(registry.getAllClients()).toEqual([]);
    });

    it('should return all registered clients', () => {
      registry.registerClient('human', { name: 'A' });
      registry.registerClient('agent', { name: 'B' });
      const all = registry.getAllClients();
      expect(all).toHaveLength(2);
      expect(all.map(c => c.name).sort()).toEqual(['A', 'B']);
    });
  });

  describe('removeClient', () => {
    it('should remove a client and return true', () => {
      const { client } = registry.registerClient('human');
      expect(registry.removeClient(client.id)).toBe(true);
      expect(registry.getClient(client.id)).toBeNull();
    });

    it('should return false for unknown client ID', () => {
      expect(registry.removeClient('nonexistent')).toBe(false);
    });

    it('should clean up API key hash mapping', () => {
      const { client, apiKey } = registry.registerClient('human');
      registry.removeClient(client.id);
      // Key should no longer authenticate
      expect(registry.authenticate(apiKey)).toBeNull();
    });
  });
});

// ── parseCookieToken ────────────────────────────────────────────────────

describe('parseCookieToken', () => {
  it('should parse lavern_token from a simple cookie header', () => {
    expect(parseCookieToken('lavern_token=abc123')).toBe('abc123');
  });

  it('should parse lavern_token from multiple cookies', () => {
    expect(parseCookieToken('other=foo; lavern_token=token_value; third=bar')).toBe('token_value');
  });

  it('should return null when lavern_token is not present', () => {
    expect(parseCookieToken('session=xyz; theme=dark')).toBeNull();
  });

  it('should return null for undefined input', () => {
    expect(parseCookieToken(undefined)).toBeNull();
  });

  it('should return null for empty string', () => {
    expect(parseCookieToken('')).toBeNull();
  });

  it('should handle lavern_token with no value', () => {
    // "lavern_token=" → split('=')[1] is '' → '' || null → null
    expect(parseCookieToken('lavern_token=')).toBeNull();
  });

  it('should handle whitespace around the token value', () => {
    expect(parseCookieToken('lavern_token= abc123 ')).toBe('abc123');
  });
});

// ── createAuthMiddleware — Public Path Matching ─────────────────────────

describe('createAuthMiddleware', () => {
  // We test the path-matching logic by calling the middleware with mock request/reply objects.
  // The middleware throws a 401 error when auth fails, so we can check whether it does or doesn't.

  const registry = new ClientRegistry();

  function createMockRequest(method: string, url: string, headers: Record<string, string> = {}): any {
    return {
      method,
      url,
      headers: {
        ...headers,
      },
    };
  }

  function createMockReply(): any {
    return {};
  }

  describe('exact path matching', () => {
    const middleware = createAuthMiddleware(registry, ['/health', '/']);

    it('should allow exact match paths without auth', async () => {
      const req = createMockRequest('GET', '/health');
      // Should not throw
      await expect(middleware(req, createMockReply())).resolves.toBeUndefined();
    });

    it('should allow root path', async () => {
      const req = createMockRequest('GET', '/');
      await expect(middleware(req, createMockReply())).resolves.toBeUndefined();
    });

    it('should reject non-public paths without auth', async () => {
      const req = createMockRequest('GET', '/api/secret');
      await expect(middleware(req, createMockReply())).rejects.toThrow('Authentication required');
    });
  });

  describe('prefix path matching (trailing /)', () => {
    const middleware = createAuthMiddleware(registry, ['/dashboard/']);

    it('should allow paths starting with the prefix', async () => {
      const req = createMockRequest('GET', '/dashboard/index.html');
      await expect(middleware(req, createMockReply())).resolves.toBeUndefined();
    });

    it('should allow the prefix itself', async () => {
      const req = createMockRequest('GET', '/dashboard/');
      await expect(middleware(req, createMockReply())).resolves.toBeUndefined();
    });

    it('should allow deep paths under the prefix', async () => {
      const req = createMockRequest('GET', '/dashboard/assets/app.js');
      await expect(middleware(req, createMockReply())).resolves.toBeUndefined();
    });

    it('should not match /dashboard without trailing slash', async () => {
      const req = createMockRequest('GET', '/dashboard');
      await expect(middleware(req, createMockReply())).rejects.toThrow('Authentication required');
    });
  });

  describe('method-specific exact matching', () => {
    const middleware = createAuthMiddleware(registry, ['GET /api/sessions']);

    it('should allow GET request to the exact path', async () => {
      const req = createMockRequest('GET', '/api/sessions');
      await expect(middleware(req, createMockReply())).resolves.toBeUndefined();
    });

    it('should reject POST to the same path', async () => {
      const req = createMockRequest('POST', '/api/sessions');
      await expect(middleware(req, createMockReply())).rejects.toThrow('Authentication required');
    });

    it('should reject DELETE to the same path', async () => {
      const req = createMockRequest('DELETE', '/api/sessions');
      await expect(middleware(req, createMockReply())).rejects.toThrow('Authentication required');
    });
  });

  describe('method-specific wildcard matching', () => {
    const middleware = createAuthMiddleware(registry, ['GET /api/sessions/*']);

    it('should allow GET to a wildcard sub-path', async () => {
      const req = createMockRequest('GET', '/api/sessions/abc');
      await expect(middleware(req, createMockReply())).resolves.toBeUndefined();
    });

    it('should allow GET to a deeply nested wildcard path', async () => {
      const req = createMockRequest('GET', '/api/sessions/abc/events');
      await expect(middleware(req, createMockReply())).resolves.toBeUndefined();
    });

    it('should reject GET to the wildcard base path (without sub-path)', async () => {
      // "GET /api/sessions/*" does NOT match /api/sessions (the base listing path)
      // This is intentional — session listing requires auth, only per-session access is public
      const req = createMockRequest('GET', '/api/sessions');
      await expect(middleware(req, createMockReply())).rejects.toThrow('Authentication required');
    });

    it('should reject POST to wildcard paths', async () => {
      const req = createMockRequest('POST', '/api/sessions/abc');
      await expect(middleware(req, createMockReply())).rejects.toThrow('Authentication required');
    });
  });

  describe('query string stripping', () => {
    const middleware = createAuthMiddleware(registry, ['/health']);

    it('should strip query strings before matching', async () => {
      const req = createMockRequest('GET', '/health?check=true');
      await expect(middleware(req, createMockReply())).resolves.toBeUndefined();
    });
  });

  describe('Bearer token authentication', () => {
    const authRegistry = new ClientRegistry();
    const middleware = createAuthMiddleware(authRegistry, ['/health']);

    it('should authenticate with valid Bearer token', async () => {
      const { apiKey } = authRegistry.registerClient('agent', { name: 'API Bot' });
      const req = createMockRequest('GET', '/api/protected', {
        authorization: `Bearer ${apiKey}`,
      });
      await expect(middleware(req, createMockReply())).resolves.toBeUndefined();
      // Client should be attached to request
      expect((req as any).client).toBeDefined();
      expect((req as any).client.name).toBe('API Bot');
    });

    it('should reject invalid Bearer token', async () => {
      const req = createMockRequest('GET', '/api/protected', {
        authorization: 'Bearer invalid_token_xyz',
      });
      await expect(middleware(req, createMockReply())).rejects.toThrow('Authentication required');
    });

    it('should reject empty Bearer token', async () => {
      const req = createMockRequest('GET', '/api/protected', {
        authorization: 'Bearer ',
      });
      await expect(middleware(req, createMockReply())).rejects.toThrow('Authentication required');
    });
  });

  describe('combined public paths (production-like config)', () => {
    const middleware = createAuthMiddleware(registry, [
      '/health',
      '/',
      '/api/clients',
      'GET /api/sessions',
      'GET /api/sessions/*',
      'POST /api/auth/signup',
      'POST /api/auth/login',
      '/dashboard/',
    ]);

    it('should allow health check', async () => {
      await expect(
        middleware(createMockRequest('GET', '/health'), createMockReply())
      ).resolves.toBeUndefined();
    });

    it('should allow GET session listing', async () => {
      await expect(
        middleware(createMockRequest('GET', '/api/sessions'), createMockReply())
      ).resolves.toBeUndefined();
    });

    it('should allow GET session detail', async () => {
      await expect(
        middleware(createMockRequest('GET', '/api/sessions/abc123'), createMockReply())
      ).resolves.toBeUndefined();
    });

    it('should block POST to sessions (not in public list)', async () => {
      await expect(
        middleware(createMockRequest('POST', '/api/sessions'), createMockReply())
      ).rejects.toThrow('Authentication required');
    });

    it('should block DELETE to sessions', async () => {
      await expect(
        middleware(createMockRequest('DELETE', '/api/sessions/abc'), createMockReply())
      ).rejects.toThrow('Authentication required');
    });

    it('should allow POST to auth signup', async () => {
      await expect(
        middleware(createMockRequest('POST', '/api/auth/signup'), createMockReply())
      ).resolves.toBeUndefined();
    });

    it('should allow POST to auth login', async () => {
      await expect(
        middleware(createMockRequest('POST', '/api/auth/login'), createMockReply())
      ).resolves.toBeUndefined();
    });

    it('should allow dashboard static files', async () => {
      await expect(
        middleware(createMockRequest('GET', '/dashboard/assets/app.js'), createMockReply())
      ).resolves.toBeUndefined();
    });

    it('should block API routes not in public list', async () => {
      await expect(
        middleware(createMockRequest('POST', '/api/matters'), createMockReply())
      ).rejects.toThrow('Authentication required');
    });
  });

  // ── Opportunistic auth on public routes ────────────────────────────────
  //
  // Regression test for the bug fixed in commit (this commit's SHA): public
  // routes like `GET /api/sessions/:id/download` previously did an early
  // `return` from the auth middleware without ever populating
  // `request.userId`. Per-route ownership checks (which return 404 to mask
  // existence) then failed for any logged-in user accessing their own
  // archived session via a capability-token URL. The fix: even on public
  // routes, opportunistically try Bearer + cookie auth and attach userId
  // if available — never throw on failure.
  describe('opportunistic auth on public routes', () => {
    const oppRegistry = new ClientRegistry();
    const middleware = createAuthMiddleware(oppRegistry, [
      '/health',
      'GET /api/sessions/*',
    ]);

    it('should populate request.client when a valid Bearer token is present on a public route', async () => {
      const { apiKey } = oppRegistry.registerClient('agent', { name: 'Public-Route Bot' });
      const req = createMockRequest('GET', '/api/sessions/abc123', {
        authorization: `Bearer ${apiKey}`,
      });
      await expect(middleware(req, createMockReply())).resolves.toBeUndefined();
      expect((req as any).userId).toBeDefined();
      expect((req as any).client?.name).toBe('Public-Route Bot');
    });

    it('should ignore an invalid Bearer token on a public route (no throw, no userId)', async () => {
      const req = createMockRequest('GET', '/api/sessions/abc123', {
        authorization: 'Bearer invalid_token_xyz',
      });
      // Public route — silent failure, no throw, userId stays undefined.
      await expect(middleware(req, createMockReply())).resolves.toBeUndefined();
      expect((req as any).userId).toBeUndefined();
      expect((req as any).client).toBeUndefined();
    });

    it('should ignore a malformed cookie on a public route (no throw, no userId)', async () => {
      const req = createMockRequest('GET', '/api/sessions/abc123', {
        cookie: 'lavern_token=garbage_not_real_token',
      });
      // dbGetUserByToken throws or returns undefined for unknown tokens;
      // the public-route branch catches/silences both. No userId is set.
      await expect(middleware(req, createMockReply())).resolves.toBeUndefined();
      expect((req as any).userId).toBeUndefined();
    });

    it('should still resolve without auth on a public route when no credentials are present', async () => {
      const req = createMockRequest('GET', '/api/sessions/abc123');
      await expect(middleware(req, createMockReply())).resolves.toBeUndefined();
      expect((req as any).userId).toBeUndefined();
    });

    it('should not call auth at all on non-public routes — still throws when auth missing', async () => {
      const req = createMockRequest('GET', '/api/secret');
      await expect(middleware(req, createMockReply())).rejects.toThrow('Authentication required');
    });
  });
});
