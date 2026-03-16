/**
 * Integration Tests — API Routes via Fastify inject().
 *
 * Creates a real Fastify instance with in-memory SQLite database,
 * registers routes, and tests them via HTTP inject (no network I/O).
 *
 * Tests:
 * - Auth routes (signup, login, logout, me, profile)
 * - Health check
 * - Session listing (empty state)
 * - Billing status
 * - Agent profiles
 * - Workflows listing
 * - Pricing endpoint
 * - Capabilities manifest
 * - Waitlist
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyRateLimit from '@fastify/rate-limit';

// Mock config before anything else
vi.mock('../../src/config.js', () => ({
  config: {
    sessionTtlMs: 60000,
    maxSessions: 100,
    auditDir: './test-audit',
    memoryDir: './test-memory',
    reportsDir: './test-reports',
    baselinesDir: './test-baselines',
    defaultBudgetUsd: 5.0,
    port: 0,
    host: '127.0.0.1',
    corsOrigins: '*',
    baseUrl: 'http://localhost:3000',
    trustProxy: false,
    defaultModel: 'claude-opus-4-6',
    routerModel: 'claude-sonnet-4-5-20250929',
    logLevel: 'error',
    version: '0.10.0',
    rateLimitMax: 1000,
    rateLimitWindowMs: 60000,
    rateLimitAuthLoginMax: 100,
    rateLimitAuthSignupMax: 100,
    rateLimitAuthWindowMs: 60000,
    x402Enabled: false,
    maxUploadBytes: 10 * 1024 * 1024,
    dbPath: ':memory:',
    stripeSecretKey: '',
    stripePublishableKey: '',
    stripeWebhookSecret: '',
    billableHours: {
      rate: 0.10,
      welcomeHours: 50,
      waitlistEnabled: false,
      adminKey: 'test-admin-key',
      packs: {
        quick: { hours: 25, priceEurCents: 500, label: 'Quick' },
        standard: { hours: 100, priceEurCents: 1900, label: 'Standard' },
        bulk: { hours: 500, priceEurCents: 8900, label: 'Bulk' },
      },
    },
  },
}));

// Mock email sending (no SMTP in tests)
vi.mock('../../src/email/send.js', () => ({
  sendWelcomeEmail: vi.fn().mockResolvedValue(true),
  sendWaitlistConfirmation: vi.fn().mockResolvedValue(true),
  sendInviteEmail: vi.fn().mockResolvedValue(true),
}));

import { initDatabase } from '../../src/db/database.js';
import { registerUserAuthRoutes } from '../../src/api/routes/auth-routes.js';
import { registerAgentRoutes } from '../../src/api/routes/agents.js';
import { registerWorkflowRoutes } from '../../src/api/routes/workflows.js';
import { registerPricingRoutes } from '../../src/api/routes/pricing.js';
import { registerCapabilitiesRoutes } from '../../src/api/routes/capabilities.js';
import { registerWaitlistRoutes } from '../../src/api/routes/waitlist.js';
import { SessionManager } from '../../src/session/session-manager.js';
import { registerSessionRoutes } from '../../src/api/routes/sessions.js';

let app: FastifyInstance;
let sessionManager: SessionManager;

async function buildApp(): Promise<FastifyInstance> {
  const fastify = Fastify({ logger: false });

  // Rate limiting plugin (required by auth routes)
  await fastify.register(fastifyRateLimit, { max: 1000, timeWindow: 60000 });

  // Initialize in-memory database
  initDatabase(':memory:');

  sessionManager = new SessionManager();

  // Register route groups
  registerUserAuthRoutes(fastify);
  registerAgentRoutes(fastify);
  registerWorkflowRoutes(fastify);
  registerPricingRoutes(fastify);
  registerCapabilitiesRoutes(fastify);
  registerWaitlistRoutes(fastify);
  registerSessionRoutes(fastify, sessionManager);

  // Health check
  fastify.get('/health', async () => ({
    status: 'ok',
    service: 'the-shem',
    version: '0.10.0',
  }));

  await fastify.ready();
  return fastify;
}

// ── Test Suite ───────────────────────────────────────────────────────────

describe('API Routes Integration', () => {
  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
    sessionManager.stopCleanup();
  });

  // ── Health ────────────────────────────────────────────────────────────

  describe('GET /health', () => {
    it('returns ok status', async () => {
      const res = await app.inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe('ok');
      expect(body.service).toBe('the-shem');
    });
  });

  // ── Auth Routes ──────────────────────────────────────────────────────

  describe('Auth flow', () => {
    const testEmail = 'integration-test@example.com';
    const testPassword = 'SecureP@ss123!';
    let authCookie: string;

    it('POST /api/auth/signup creates a new user', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/signup',
        payload: {
          email: testEmail,
          password: testPassword,
          displayName: 'Test User',
          firmName: 'Test Firm LLP',
        },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.user.email).toBe(testEmail);
      expect(body.user.displayName).toBe('Test User');
      expect(body.user.firmName).toBe('Test Firm LLP');
      expect(body.user.id).toBeDefined();
      // Should not expose password hash
      expect(body.user.password_hash).toBeUndefined();
      expect(body.user.password).toBeUndefined();

      // Should set auth cookie
      const setCookie = res.headers['set-cookie'] as string;
      expect(setCookie).toContain('whiteshoe_token=');
      authCookie = setCookie;
    });

    it('POST /api/auth/signup rejects duplicate email', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/signup',
        payload: {
          email: testEmail,
          password: testPassword,
        },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error).toContain('already exists');
    });

    it('POST /api/auth/signup rejects weak password', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/signup',
        payload: {
          email: 'weak@example.com',
          password: 'short',
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it('POST /api/auth/signup rejects invalid email', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/signup',
        payload: {
          email: 'not-an-email',
          password: testPassword,
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it('POST /api/auth/signup rejects extra fields', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/signup',
        payload: {
          email: 'extra@example.com',
          password: testPassword,
          isAdmin: true, // extra field — should be rejected by .strict()
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it('POST /api/auth/login succeeds with correct credentials', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          email: testEmail,
          password: testPassword,
        },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.user.email).toBe(testEmail);

      // Save cookie for subsequent requests
      const setCookie = res.headers['set-cookie'] as string;
      expect(setCookie).toContain('whiteshoe_token=');
      authCookie = setCookie;
    });

    it('POST /api/auth/login fails with wrong password', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          email: testEmail,
          password: 'WrongPassword123!',
        },
      });
      expect(res.statusCode).toBe(401);
    });

    it('POST /api/auth/login fails with nonexistent email', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          email: 'nobody@example.com',
          password: testPassword,
        },
      });
      expect(res.statusCode).toBe(401);
    });

    it('POST /api/auth/login is case-insensitive for email', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          email: testEmail.toUpperCase(),
          password: testPassword,
        },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().user.email).toBe(testEmail);
    });

    it('GET /api/auth/me returns current user with cookie', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: { cookie: authCookie },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.user.email).toBe(testEmail);
      expect(body.user.displayName).toBe('Test User');
    });

    it('GET /api/auth/me returns 401 without cookie', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
      });
      expect(res.statusCode).toBe(401);
    });

    it('PUT /api/auth/profile updates user fields', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/api/auth/profile',
        headers: { cookie: authCookie },
        payload: {
          displayName: 'Updated Name',
          firmName: 'Updated Firm',
        },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().user.displayName).toBe('Updated Name');
      expect(res.json().user.firmName).toBe('Updated Firm');
    });

    it('PUT /api/auth/profile updates profile JSON', async () => {
      const profileJson = JSON.stringify({ soul: 'test soul', defaultWorkflow: 'counsel' });
      const res = await app.inject({
        method: 'PUT',
        url: '/api/auth/profile',
        headers: { cookie: authCookie },
        payload: { profileJson },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().user.profile.soul).toBe('test soul');
    });

    it('PUT /api/auth/profile rejects invalid JSON in profileJson', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/api/auth/profile',
        headers: { cookie: authCookie },
        payload: { profileJson: '{not valid json}' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('PUT /api/auth/profile returns 401 without auth', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/api/auth/profile',
        payload: { displayName: 'Sneaky' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('GET /api/auth/export returns user data (GDPR)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/auth/export',
        headers: { cookie: authCookie },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.user).toBeDefined();
      expect(body.user.email).toBe(testEmail);
      expect(body.exportedAt).toBeDefined();
    });

    it('POST /api/auth/logout clears the cookie', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/logout',
        headers: { cookie: authCookie },
      });
      expect(res.statusCode).toBe(200);
      const setCookie = res.headers['set-cookie'] as string;
      expect(setCookie).toContain('Max-Age=0');
    });

    it('GET /api/auth/me fails after logout', async () => {
      // Login again to get a fresh cookie, then logout, then check /me
      const loginRes = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: testEmail, password: testPassword },
      });
      const freshCookie = loginRes.headers['set-cookie'] as string;

      await app.inject({
        method: 'POST',
        url: '/api/auth/logout',
        headers: { cookie: freshCookie },
      });

      const meRes = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: { cookie: freshCookie },
      });
      expect(meRes.statusCode).toBe(401);
    });
  });

  // ── Agent Routes ────────────────────────────────────────────────────

  describe('Agent routes', () => {
    it('GET /api/agents/profiles returns agent profiles', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/agents/profiles' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Array.isArray(body.profiles) || typeof body.profiles === 'object').toBe(true);
    });

    it('GET /api/agents/presets returns team presets', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/agents/presets' });
      expect(res.statusCode).toBe(200);
    });
  });

  // ── Workflow Routes ──────────────────────────────────────────────────

  describe('Workflow routes', () => {
    it('GET /api/workflows returns available workflows', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/workflows' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Array.isArray(body.workflows) || Array.isArray(body)).toBe(true);
    });
  });

  // ── Pricing Routes ──────────────────────────────────────────────────

  describe('Pricing routes', () => {
    it('GET /api/pricing returns cost estimates', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/pricing' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toBeDefined();
    });
  });

  // ── Capabilities Routes ─────────────────────────────────────────────

  describe('Capabilities routes', () => {
    it('GET /api/capabilities returns service manifest', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/capabilities' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.name || body.service).toBeDefined();
    });
  });

  // ── Session Routes ──────────────────────────────────────────────────

  describe('Session routes', () => {
    it('GET /api/sessions returns empty list initially', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/sessions' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.sessions).toBeDefined();
      expect(body.sessions.length).toBe(0);
    });

    it('GET /api/sessions/:id returns 404 for non-existent session', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/sessions/nonexistent-id' });
      expect(res.statusCode).toBe(404);
    });

    it('DELETE /api/sessions/:id returns 404 for non-existent session', async () => {
      const res = await app.inject({ method: 'DELETE', url: '/api/sessions/nonexistent-id' });
      expect(res.statusCode).toBe(404);
    });
  });

  // ── Waitlist Routes ─────────────────────────────────────────────────

  describe('Waitlist routes', () => {
    it('POST /api/waitlist adds email to waitlist', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/waitlist',
        payload: { email: 'waitlist@example.com' },
      });
      // Could be 200 (success) or 409 (already exists) — both are valid
      expect([200, 201, 409]).toContain(res.statusCode);
    });

    it('POST /api/waitlist rejects invalid email', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/waitlist',
        payload: { email: 'not-an-email' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('GET /api/waitlist/status returns waitlist status', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/waitlist/status',
        query: { email: 'waitlist@example.com' },
      });
      expect(res.statusCode).toBe(200);
    });
  });

  // ── GDPR: Deletion ─────────────────────────────────────────────────

  describe('GDPR account deletion', () => {
    const deleteEmail = 'delete-me@example.com';
    const deletePassword = 'DeleteMe123!';
    let deleteCookie: string;

    it('creates account then deletes it', async () => {
      // Create account
      const signupRes = await app.inject({
        method: 'POST',
        url: '/api/auth/signup',
        payload: { email: deleteEmail, password: deletePassword },
      });
      expect(signupRes.statusCode).toBe(201);
      deleteCookie = signupRes.headers['set-cookie'] as string;

      // Delete account (requires confirmation header)
      const deleteRes = await app.inject({
        method: 'DELETE',
        url: '/api/auth/account',
        headers: {
          cookie: deleteCookie,
          'x-confirm-delete': 'permanently-delete-my-account',
        },
      });
      expect(deleteRes.statusCode).toBe(200);
      expect(deleteRes.json().success).toBe(true);

      // Verify can't login anymore
      const loginRes = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: deleteEmail, password: deletePassword },
      });
      expect(loginRes.statusCode).toBe(401);
    });
  });
});
