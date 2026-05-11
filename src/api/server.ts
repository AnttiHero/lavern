/**
 * The Shem API Server — HTTP + WebSocket server for both
 * agentic clients and the visualization frontend.
 *
 * Built with Fastify for speed and TypeScript-native plugin system.
 * WebSocket provides real-time event streaming (ShemEvents).
 *
 * Endpoints:
 *   POST   /api/sessions              — Create a new analysis session
 *   GET    /api/sessions              — List active sessions
 *   GET    /api/sessions/:id          — Get session status
 *   GET    /api/sessions/:id/events   — WebSocket event stream
 *   POST   /api/sessions/:id/gate     — Submit gate decision
 *   DELETE /api/sessions/:id          — Cancel session
 *   GET    /api/audit-logs            — List audit log files
 *   GET    /api/audit-logs/:sessionId — Get parsed audit entries
 *   GET    /api/replay/:sessionId     — WebSocket replay from JSONL
 *   GET    /health                    — Health check
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { timingSafeEqual } from 'node:crypto';
import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import fastifyCors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import fastifyMultipart from '@fastify/multipart';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyHelmet from '@fastify/helmet';
import { SessionManager } from '../session/session-manager.js';
import { getDailySpendStats } from '../utils/spend-tracker.js';
import { registerSessionRoutes } from './routes/sessions.js';
import { getWsConnectionCount } from './ws-handler.js';
import { registerReplayRoutes } from './routes/replay.js';
import { registerMatterRoutes } from './routes/matters.js';
import { registerAgentRoutes } from './routes/agents.js';
import { registerWorkflowRoutes } from './routes/workflows.js';
import { registerBriefingRoutes } from './routes/briefing.js';
import { registerAgentBuilderRoutes } from './routes/agent-builder.js';
import { registerPartnerRoutes } from './routes/partner.js';
import { registerVoiceRoutes } from './routes/voice.js';
import { registerEngageRoutes } from './routes/engage.js';
import { registerCapabilitiesRoutes } from './routes/capabilities.js';
import { registerWellKnownRoutes } from './routes/well-known.js';
import { registerPricingRoutes } from './routes/pricing.js';
import { registerReputationRoutes } from './routes/reputation.js';
import { registerDocumentRoutes } from './routes/documents.js';
import { registerKnowledgeBaseRoutes } from './routes/knowledge-base.js';
import { registerVerifyRoutes } from './routes/verify.js';
import { registerClawRoutes } from './routes/claw.js';
import { registerChallengeRoutes } from './routes/challenge.js';
import { registerBillingRoutes } from './routes/billing.js';
import { registerWaitlistRoutes } from './routes/waitlist.js';
import { registerAdminRoutes } from './routes/admin.js';
import { maybeRegisterRemoteBridge } from '../mcp/remote-bridge/index.js';
import { registerReferralRoutes } from './routes/referral.js';
import { registerTemplateRoutes } from './routes/templates.js';
import { ClientRegistry, createAuthMiddleware, registerAuthRoutes } from './middleware/auth.js';
import { createPerUserRateLimitHook } from './middleware/rate-limit.js';
import { registerUserAuthRoutes } from './routes/auth-routes.js';
import { registerGoogleAuthRoutes } from './routes/google-auth.js';
import { initDatabase, cleanExpiredTokens, cleanExpiredUserTokens, rotateAuditLog, logAuditEvent, cleanOldArchives, sweepStaleHolds } from '../db/database.js';
import { config } from '../config.js';
import { captureError, isSentryEnabled } from '../utils/sentry.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('SERVER');

export async function startApiServer(port: number): Promise<void> {
  const isProd = config.isProduction;
  const fastify = Fastify({
    trustProxy: config.trustProxy,
    logger: {
      level: config.logLevel === 'debug' ? 'debug' : 'info',
      ...(isProd ? {} : {
        transport: {
          target: 'pino-pretty',
          options: {
            translateTime: 'HH:MM:ss Z',
            ignore: 'pid,hostname',
          },
        },
      }),
    },
  });

  // ── Plugins ──────────────────────────────────────────────────────────

  // ── Security headers ─────────────────────────────────────────────────
  // Helmet sets a baseline of defensive HTTP headers — frame protection,
  // content sniffing block, referrer policy, HSTS in production.
  // CSP is intentionally NOT enforced here yet: the dashboard inlines styles
  // in many components and a strict CSP would blank-screen them. CSP is
  // tracked as a follow-up in SECURITY.md.
  await fastify.register(fastifyHelmet, {
    contentSecurityPolicy: false, // see comment above; enable after CSP audit
    crossOriginEmbedderPolicy: false, // we serve user-fetched DiceBear avatars
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // dashboard is on a different port in dev
    hsts: config.isProduction ? { maxAge: 15552000, includeSubDomains: true } : false,
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  });

  await fastify.register(fastifyWebsocket);

  // CORS — locked to specific origins by default.
  // Set SHEM_CORS_ORIGINS='*' to allow all (NOT recommended for production).
  if (config.corsOrigins === '*') {
    console.warn('[SECURITY] CORS is set to wildcard (*) — all origins can access the API. Set SHEM_CORS_ORIGINS to restrict.');
  }
  await fastify.register(fastifyCors, {
    origin: config.corsOrigins === '*' ? true : config.corsOrigins.split(',').map(o => o.trim()),
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  await fastify.register(fastifyMultipart, {
    limits: { fileSize: config.maxUploadBytes },
  });

  // Rate limiting — global default + stricter limit on session creation.
  //
  // `allowList` honors a shared-secret bypass for load testing. When
  // LAVERN_LOAD_TEST_BYPASS_KEY is set AND the request carries a matching
  // `X-Load-Test-Bypass` header, the limit is skipped — this is required to
  // drive 1500 simulated users from a single IP without signup (3/min/IP) or
  // the global (100/min/IP) throttle blocking the run. The per-route auth
  // limits configured in auth-routes.ts also inherit this allow list, so one
  // toggle unblocks signup/login at scale.
  //
  // Compared in constant time to avoid exposing the secret via timing. Empty
  // key disables the bypass entirely — production never presents the header
  // to a server missing the env.
  // Production safety: refuse to honour the bypass when NODE_ENV=production
  // unless the operator has ALSO set LAVERN_ALLOW_LOAD_TEST_BYPASS=1. Without
  // this, an OSS user shipping with a stray bypass key in their .env could
  // accept arbitrary auth/rate-limit-bypass requests on the open internet.
  // (`isProd` is already declared at the top of startApiServer for HSTS.)
  const allowBypassInProd = config.allowLoadTestBypassInProd;
  const loadTestKey =
    isProd && !allowBypassInProd
      ? '' // disable in production unless explicitly opted in
      : config.loadTestBypassKey;
  if (config.loadTestBypassKey && isProd && !allowBypassInProd) {
    console.warn(
      '[SECURITY] LAVERN_LOAD_TEST_BYPASS_KEY is set in production but ' +
      'LAVERN_ALLOW_LOAD_TEST_BYPASS is not "1". The bypass is DISABLED. ' +
      'To allow it, also set LAVERN_ALLOW_LOAD_TEST_BYPASS=1 (and understand ' +
      'that this disables auth + rate limiting for any caller with the key).',
    );
  }
  if (loadTestKey && isProd && allowBypassInProd) {
    console.warn(
      '[SECURITY] Load-test bypass is ACTIVE in production. Auth and rate ' +
      'limits can be skipped by any caller presenting X-Load-Test-Bypass with ' +
      'the configured key. Disable with LAVERN_ALLOW_LOAD_TEST_BYPASS unset.',
    );
  }
  const loadTestKeyBuf = loadTestKey ? Buffer.from(loadTestKey, 'utf8') : null;
  await fastify.register(fastifyRateLimit, {
    max: config.rateLimitMax,
    timeWindow: config.rateLimitWindowMs,
    allowList: (req) => {
      if (!loadTestKeyBuf) return false;
      const presented = req.headers['x-load-test-bypass'];
      if (typeof presented !== 'string' || presented.length === 0) return false;
      const presentedBuf = Buffer.from(presented, 'utf8');
      if (presentedBuf.length !== loadTestKeyBuf.length) return false;
      try {
        return timingSafeEqual(presentedBuf, loadTestKeyBuf);
      } catch {
        return false;
      }
    },
  });

  // ── Raw body capture for Stripe webhook ──────────────────────────────
  // Stripe webhook signature verification requires the raw request body.
  // We capture it via preParsing hook (only for the webhook route) and
  // store it on the request object via Fastify request decorator.

  // Declare the rawBody property on FastifyRequest for Stripe webhook signature verification.
  // We use decorateRequest so the property exists on the prototype, then assign via `as any`
  // because Fastify's generic types don't expose custom decorators without module augmentation.
  fastify.decorateRequest('rawBody', undefined);

  fastify.addHook('preParsing', async (request, _reply, payload) => {
    if (request.url === '/api/billing/webhook') {
      const chunks: Buffer[] = [];
      for await (const chunk of payload as AsyncIterable<Buffer>) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
      }
      const rawBody = Buffer.concat(chunks);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- decorated via fastify.decorateRequest above
      (request as any).rawBody = rawBody.toString('utf8');
      return Readable.from(rawBody);
    }
    return payload;
  });

  // ── Database ────────────────────────────────────────────────────────

  initDatabase();

  // Clean expired auth tokens at startup and every hour
  const expired = cleanExpiredTokens();
  if (expired > 0) console.log(`[AUTH] Cleaned ${expired} expired auth token${expired === 1 ? '' : 's'}`);
  const expiredUserTokens = cleanExpiredUserTokens();
  if (expiredUserTokens > 0) console.log(`[AUTH] Cleaned ${expiredUserTokens} expired user token${expiredUserTokens === 1 ? '' : 's'}`);

  // Rotate audit log at startup (retain 90 days)
  const rotated = rotateAuditLog(90);
  if (rotated > 0) console.log(`[AUDIT] Rotated ${rotated} audit log entr${rotated === 1 ? 'y' : 'ies'} older than 90 days`);

  // Clean old session archives (retain configurable days, default 180)
  const archivedCleaned = cleanOldArchives(config.archiveRetentionDays);
  if (archivedCleaned > 0) console.log(`[ARCHIVE] Cleaned ${archivedCleaned} archived session${archivedCleaned === 1 ? '' : 's'} older than ${config.archiveRetentionDays} days`);

  // Audit fix H10: sweep holds left behind by sessions that crashed before
  // archive (or by hard restarts). Without this, the hold permanently locks
  // billable hours from the user's available balance.
  const sessionTtlMs = config.sessionTtlMs ?? 4 * 60 * 60 * 1000;
  const staleHoldsReleased = sweepStaleHolds(sessionTtlMs);
  if (staleHoldsReleased > 0) console.log(`[BILLING] Released ${staleHoldsReleased} stale hold${staleHoldsReleased === 1 ? '' : 's'} older than ${(sessionTtlMs / 3600000).toFixed(1)}h`);

  const tokenCleanupInterval = setInterval(() => {
    const cleaned = cleanExpiredTokens();
    if (cleaned > 0) console.log(`[AUTH] Cleaned ${cleaned} expired auth token${cleaned === 1 ? '' : 's'}`);
    const cleanedUser = cleanExpiredUserTokens();
    if (cleanedUser > 0) console.log(`[AUTH] Cleaned ${cleanedUser} expired user token${cleanedUser === 1 ? '' : 's'}`);
    // Also rotate audit log hourly
    const auditRotated = rotateAuditLog(90);
    if (auditRotated > 0) console.log(`[AUDIT] Rotated ${auditRotated} audit log entries`);
    // Clean old session archives hourly
    const archiveCleaned = cleanOldArchives(config.archiveRetentionDays);
    if (archiveCleaned > 0) console.log(`[ARCHIVE] Cleaned ${archiveCleaned} old archived sessions`);
    // Hourly stale-hold sweep — covers in-flight crashes between boots.
    const heldReleased = sweepStaleHolds(sessionTtlMs);
    if (heldReleased > 0) console.log(`[BILLING] Released ${heldReleased} stale holds`);
  }, 60 * 60 * 1000); // 1 hour
  tokenCleanupInterval.unref(); // Don't keep the process alive for cleanup

  // ── Shared State ─────────────────────────────────────────────────────

  const sessionManager = new SessionManager();
  const clientRegistry = new ClientRegistry();
  clientRegistry.loadFromDb(); // Restore API clients from SQLite

  // ── Authentication ──────────────────────────────────────────────────

  // ── Public paths ──────────────────────────────────────────────────
  // Paths listed here bypass auth (no Bearer token or cookie required).
  // Most POST mutations require a lavern_token cookie (set by
  // /api/auth/login). Exceptions: session creation is public so the
  // QuickStart express lane works without login.
  const publicPaths: string[] = [
    '/health',
    '/health/capacity',
    '/',
    // Session access — individual session detail/WS is public (session ID is a capability token).
    // Archive endpoints (GET /api/sessions/archive[/...]) explicitly enforce
    // auth in-route (see sessions.ts) — fix C1 closed the leak there.
    // Future hardening (M16): replace this wildcard with explicit per-route
    // entries once the auth matcher supports param syntax.
    'GET /api/sessions/*',
    // NOTE: /api/clients, /api/audit-logs, /api/replay are NOT public.
    // They contain sensitive data and require authentication.
    'GET /api/agents/*',      // Agent profiles, presets, recommendations
    'GET /api/workflows',     // Workflow templates
    // Agent API — public discovery endpoints (read-only)
    'GET /api/capabilities',  // Machine-readable service manifest
    'GET /.well-known/*',     // A2A agent card + OpenAI plugin manifest
    'GET /openapi.json',      // OpenAPI 3.0 spec
    'GET /llms.txt',          // AI crawler guidance
    'GET /api/pricing',       // Deterministic cost estimates
    'GET /api/reputation',    // Machine-readable trust signal
    // Session creation requires auth — all users must log in before starting sessions.
    // Briefing — intake flow before login
    'POST /api/briefing/interview',
    'POST /api/briefing/analyze',
    // Partner consultation — conversational intake
    'POST /api/partner/consult',
    // Voice — STT/TTS proxy (API keys stay server-side)
    'GET /api/voice/stt',
    'POST /api/voice/tts',
    // User auth routes (public by definition)
    'POST /api/auth/signup',
    'POST /api/auth/login',
    'POST /api/auth/logout',
    'GET /api/auth/me',
    // v23: Password reset + email verification (public by definition)
    'POST /api/auth/forgot-password',
    'POST /api/auth/reset-password',
    'POST /api/auth/verify-email',
    // Google OAuth flow
    'GET /api/auth/google',
    'GET /api/auth/google/callback',
    // Public agent-share — anyone can view a shared agent + its OG image.
    // The token is the capability (32-char base64url, unguessable). Owner-only
    // mutations (POST/DELETE share) require auth and are NOT in this list.
    'GET /api/agents/share/*',
    // Public team-share — same capability-token pattern as agent share.
    'GET /api/teams/share/*',
    // Session-scoped POST mutations — scoped by session ID, work without login
    // so the QuickStart → Working → Delivery flow doesn't require auth.
    // Session ID acts as the auth token (only the user who created it has it).
    // SECURITY NOTE: This makes ALL session POST mutations public (gate decisions,
    // derivatives, conversations, reassembly). This is by design — session IDs
    // are unguessable UUIDs that serve as capability tokens. Each route also
    // enforces checkSessionOwnership() as a secondary guard.
    'POST /api/sessions/*',
    // Session cancellation — allows QuickStart users to cancel without login.
    // Same session-ID-as-capability-token model as POST mutations above.
    'DELETE /api/sessions/*',
    // Document parsing — needed by Challenge and Briefing before login
    'POST /api/documents/parse',
    // The Lavern Challenge — zero-friction, no auth required
    'POST /api/challenge',
    // Stripe — webhook must be public, config returns publishable key only
    'POST /api/billing/webhook',
    'GET /api/billing/stripe-config',
    // v22: Waitlist — public join + status, admin endpoints verify X-Admin-Key internally
    'POST /api/waitlist',
    'GET /api/waitlist/status',
    'POST /api/waitlist/invite',
    'GET /api/waitlist/list',
    // Admin endpoints verify X-Admin-Key internally; bypass user auth.
    'GET /api/admin/spend-status',
    'GET /api/admin/user-spend',
    // Remote MCP bridge authenticates via its own shared-secret Bearer header
    // + X-Lavern-Session-Id; it must bypass the global cookie/Bearer middleware.
    'POST /api/mcp/bridge',
    // Frontend static files (prefix match — trailing /)
    '/dashboard/',
  ];

  // x402: When payment-based auth is enabled, unauthenticated callers
  // can reach /api/engage to receive 402 Payment Required responses.
  // Auth is then handled inside the route (Bearer OR x402 payment).
  if (config.x402Enabled) {
    publicPaths.push('POST /api/engage');
  }

  const authMiddleware = createAuthMiddleware(clientRegistry, publicPaths);
  fastify.addHook('onRequest', authMiddleware);

  // ── Email Verification Enforcement ────────────────────────────────────
  // Runs AFTER auth (needs userId). Blocks unverified browser users from
  // paid mutations. Anonymous QuickStart, GET requests, API clients, and
  // exempt paths (auth, billing) pass through.
  const { createRequireVerifiedHook } = await import('./middleware/require-verified.js');
  const requireVerified = createRequireVerifiedHook([
    '/api/auth/',       // All auth routes (login, signup, verify, reset, etc.)
    '/api/billing/',    // Must buy hours even if unverified (waitlist = identity check)
    '/api/waitlist',    // Public waitlist operations
    '/api/documents/',  // Document parsing (needed by Challenge + Briefing)
    '/api/challenge',   // Zero-friction challenge
    '/api/partner/',    // Conversational intake
    '/api/briefing/',   // Intake flow
    '/api/voice/',      // STT/TTS proxy
  ]);
  fastify.addHook('onRequest', requireVerified);

  // ── Per-User Rate Limiting ────────────────────────────────────────────
  // Runs AFTER auth so we have userId. 30 req/min per user, 5 concurrent sessions.
  const perUserRateLimit = createPerUserRateLimitHook(sessionManager);
  fastify.addHook('onRequest', perUserRateLimit);

  // ── CSRF Protection ──────────────────────────────────────────────────
  // For cookie-authenticated state-changing requests, verify Origin header
  // matches allowed CORS origins. Bearer token requests are exempt (immune
  // to CSRF since the attacker can't inject the Authorization header).
  const allowedOrigins = new Set(
    config.corsOrigins === '*'
      ? [] // Can't validate if all origins allowed
      : config.corsOrigins.split(',').map(o => o.trim())
  );

  fastify.addHook('onRequest', async (request, reply) => {
    const isWebSocketUpgrade =
      request.method === 'GET' &&
      request.headers.upgrade?.toLowerCase() === 'websocket';

    // Audit follow-up: WebSocket handshakes are GETs but they ARE state-changing
    // (they open a long-lived event stream). SameSite=Lax already prevents
    // cross-origin cookies on WS handshakes in modern browsers, but explicit
    // origin validation closes the door for older clients + edge cases.
    if (!isWebSocketUpgrade) {
      // Only check state-changing methods for non-WS requests.
      if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') return;
    }

    // Bearer token auth is immune to CSRF — skip
    if (request.headers.authorization?.startsWith('Bearer ')) return;

    // If CORS is wildcard, we can't validate (logged warning above)
    if (config.corsOrigins === '*') return;

    // Cookie-authenticated request: verify Origin
    const origin = request.headers.origin;
    if (origin && !allowedOrigins.has(origin)) {
      return reply.status(403).send({ error: 'Origin not allowed' });
    }

    // If no Origin header, check Referer (some browsers omit Origin on same-origin)
    if (!origin) {
      const referer = request.headers.referer;
      if (referer) {
        try {
          const refOrigin = new URL(referer).origin;
          if (!allowedOrigins.has(refOrigin)) {
            return reply.status(403).send({ error: 'Origin not allowed' });
          }
        } catch {
          // Malformed referer — reject for safety (legitimate clients send well-formed referers)
          return reply.status(403).send({ error: 'Malformed referer' });
        }
      } else if (isWebSocketUpgrade) {
        // WS handshake with no Origin AND no Referer is suspicious — legitimate
        // browsers always send Origin on WebSocket upgrades. Reject.
        return reply.status(403).send({ error: 'Origin required for WebSocket' });
      }
      // No Origin or Referer on a non-WS request: could be curl, Postman, or
      // API client. SameSite=Lax cookie already prevents cross-site form submissions.
    }
  });

  // ── Routes ───────────────────────────────────────────────────────────

  // Health check — shallow (fast, for load balancers) + deep (checks dependencies)
  fastify.get('/health', async (request) => {
    const deep = (request.query as { deep?: string }).deep === 'true';

    const base = {
      status: 'ok' as string,
      service: 'the-shem',
      version: config.version,
      sessions: sessionManager.size,
      wsConnections: getWsConnectionCount(),
      timestamp: new Date().toISOString(),
    };

    if (!deep) return base;

    // Deep health check — verify dependencies
    const checks: Record<string, { ok: boolean; detail?: string }> = {};

    // SQLite writable + size
    try {
      const db = (await import('../db/database.js')).getDb();
      db.prepare('SELECT 1').get();
      let dbSizeDetail = 'writable';
      try {
        const dbStat = fs.statSync(config.dbPath);
        const sizeMb = (dbStat.size / (1024 * 1024)).toFixed(1);
        dbSizeDetail = `writable, ${sizeMb} MB`;
      } catch { /* size check optional */ }
      checks.database = { ok: true, detail: dbSizeDetail };
    } catch (err) {
      checks.database = { ok: false, detail: err instanceof Error ? err.message : 'unavailable' };
    }

    // LLM API key present
    checks.llm = {
      ok: !!config.anthropic.apiKey,
      detail: config.anthropic.apiKey ? 'configured' : 'ANTHROPIC_API_KEY not set',
    };

    // Email service
    checks.email = {
      ok: !!config.email.resendApiKey,
      detail: config.email.resendApiKey ? 'configured' : 'RESEND_API_KEY not set',
    };

    // Stripe billing
    checks.stripe = {
      ok: !!config.stripe.secretKey,
      detail: config.stripe.secretKey ? 'configured' : 'STRIPE_SECRET_KEY not set',
    };

    // Disk space (data directory)
    try {
      const dataDir = path.dirname(config.dbPath);
      if (fs.existsSync(dataDir)) {
        const stats = fs.statfsSync(dataDir);
        const freeGb = (stats.bavail * stats.bsize) / (1024 ** 3);
        checks.disk = {
          ok: freeGb > 1,
          detail: `${freeGb.toFixed(1)} GB free`,
        };
      } else {
        checks.disk = { ok: false, detail: 'data directory does not exist' };
      }
    } catch {
      checks.disk = { ok: true, detail: 'statfs not available (skipped)' };
    }

    const allOk = Object.values(checks).every(c => c.ok);

    return {
      ...base,
      status: allOk ? 'ok' : 'degraded',
      checks,
    };
  });

  // v27: Capacity endpoint — for monitoring and frontend queue display
  fastify.get('/health/capacity', async () => {
    const capacity = sessionManager.getCapacity();
    const spend = getDailySpendStats();
    return {
      current: capacity.current,
      max: capacity.max,
      available: capacity.available,
      estimatedWaitMs: capacity.estimatedWaitMs,
      utilization: capacity.max > 0 ? Math.round((capacity.current / capacity.max) * 100) : 0,
      dailySpend: {
        date: spend.date,
        totalUsd: Math.round(spend.totalUsd * 100) / 100,
        capUsd: spend.capUsd,
        pct: Math.round(spend.pct),
        capReached: spend.capReached,
      },
    };
  });

  // API info
  fastify.get('/', async () => ({
    name: 'The Shem API',
    version: config.version,
    description: 'Multi-agent legal design system — API & WebSocket server',
    endpoints: {
      sessions: {
        create: 'POST /api/sessions',
        list: 'GET /api/sessions',
        get: 'GET /api/sessions/:id',
        events: 'GET /api/sessions/:id/events (WebSocket)',
        gate: 'POST /api/sessions/:id/gate',
        cancel: 'DELETE /api/sessions/:id',
      },
      audit: {
        list: 'GET /api/audit-logs',
        get: 'GET /api/audit-logs/:sessionId',
        replay: 'GET /api/replay/:sessionId (WebSocket)',
      },
      matters: {
        create: 'POST /api/matters',
        list: 'GET /api/matters',
        get: 'GET /api/matters/:id',
        accept: 'POST /api/matters/:id/accept',
        team: 'POST /api/matters/:id/team',
      },
      agents: {
        profiles: 'GET /api/agents/profiles',
        profile: 'GET /api/agents/profiles/:role',
        presets: 'GET /api/agents/presets',
        recommend: 'GET /api/agents/recommend',
      },
      workflows: {
        list: 'GET /api/workflows',
      },
      clients: {
        register: 'POST /api/clients',
        get: 'GET /api/clients/:id',
        list: 'GET /api/clients',
      },
      agentApi: {
        capabilities: 'GET /api/capabilities',
        engage: 'POST /api/engage',
        pricing: 'GET /api/pricing',
        reputation: 'GET /api/reputation',
      },
      discovery: {
        agentCard: 'GET /.well-known/agent.json',
        pluginManifest: 'GET /.well-known/ai-plugin.json',
        openapi: 'GET /openapi.json',
        llmsTxt: 'GET /llms.txt',
      },
      auth: {
        signup: 'POST /api/auth/signup',
        login: 'POST /api/auth/login',
        logout: 'POST /api/auth/logout',
        me: 'GET /api/auth/me',
        profile: 'PUT /api/auth/profile',
      },
      documents: {
        parse: 'POST /api/documents/parse (multipart)',
      },
      claw: {
        status: 'GET /api/claw/status',
        documents: 'GET /api/claw/documents',
        deliveries: 'GET /api/claw/deliveries',
        scan: 'POST /api/claw/scan',
      },
      knowledgeBase: {
        createCollection: 'POST /api/knowledge-base/collections',
        listCollections: 'GET /api/knowledge-base/collections',
        upload: 'POST /api/knowledge-base/collections/:id/upload (multipart)',
        search: 'GET /api/knowledge-base/search?q=...',
        deleteCollection: 'DELETE /api/knowledge-base/collections/:id',
        deleteDocument: 'DELETE /api/knowledge-base/documents/:id',
      },
      challenge: {
        compare: 'POST /api/challenge',
      },
      health: 'GET /health',
    },
  }));

  // Register route groups
  registerSessionRoutes(fastify, sessionManager);
  registerReplayRoutes(fastify);
  registerAuthRoutes(fastify, clientRegistry);
  // v14: User auth (signup, login, logout, profile)
  registerUserAuthRoutes(fastify);
  // v0.12: Google OAuth
  registerGoogleAuthRoutes(fastify);
  // v8: Pre-engagement & team staffing routes
  registerMatterRoutes(fastify);
  registerAgentRoutes(fastify);
  // v9: Engagement configurator
  registerWorkflowRoutes(fastify);
  // v10: LLM-powered briefing analysis
  registerBriefingRoutes(fastify);
  registerAgentBuilderRoutes(fastify);
  // v11: Partner consultation (conversational intake)
  registerPartnerRoutes(fastify);
  registerVoiceRoutes(fastify);
  // v10: Agent API — engage endpoint + capabilities manifest
  registerEngageRoutes(fastify, sessionManager);
  registerCapabilitiesRoutes(fastify);
  // v16: Agent-first discovery + intelligence layer
  registerWellKnownRoutes(fastify);
  registerPricingRoutes(fastify);
  registerReputationRoutes(fastify);
  // v12: Document parsing
  registerDocumentRoutes(fastify);
  // v15: Knowledge Base — reference document collections
  registerKnowledgeBaseRoutes(fastify);
  // v16: Standalone document verification
  registerVerifyRoutes(fastify, sessionManager);
  // Claw Mode — remote monitoring & control
  registerClawRoutes(fastify);
  // v19: The Lavern Challenge — blind document comparison
  registerChallengeRoutes(fastify);
  // v21: Billing — Stripe subscriptions and usage tracking
  registerBillingRoutes(fastify);
  // v22: Waitlist — join, status, admin invite & listing
  registerWaitlistRoutes(fastify);
  // Admin observability endpoints (X-Admin-Key gated)
  registerAdminRoutes(fastify);
  // Remote MCP bridge — Managed Agents integration (Stage 1: scaffolded, off
  // unless both LAVERN_MANAGED_AGENTS_BRIDGE=1 and the shared secret are set).
  maybeRegisterRemoteBridge(fastify, sessionManager);
  registerReferralRoutes(fastify);
  registerTemplateRoutes(fastify);

  // ── Frontend Static Files ──────────────────────────────────────────

  // Serve viz/dist/ if it exists (production build of the dashboard)
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const frontendDir = path.resolve(__dirname, '../../viz/dist');
  if (fs.existsSync(frontendDir)) {
    await fastify.register(fastifyStatic, {
      root: frontendDir,
      prefix: '/dashboard/',
      decorateReply: false,
    });

    // Redirect /dashboard to /dashboard/
    fastify.get('/dashboard', async (_request, reply) => {
      return reply.redirect('/dashboard/');
    });
  }

  // ── Error Monitoring (Sentry-compatible) ────────────────────────────
  // Centralized in src/utils/sentry.ts so other modules can import captureError
  // directly (e.g. assembly, dispatch, session archive) rather than threading
  // it through closure scope.
  if (isSentryEnabled()) {
    console.log('[SENTRY] Error monitoring enabled');
  }

  // Fastify error handler — captures 5xx errors to Sentry
  fastify.setErrorHandler((error: Error & { statusCode?: number }, request, reply) => {
    const statusCode = error.statusCode ?? 500;
    if (statusCode >= 500) {
      captureError(error, { url: request.url, method: request.method });
    }
    reply.status(statusCode).send({
      statusCode,
      error: error.name,
      message: statusCode < 500 ? error.message : 'Internal server error',
    });
  });

  // ── Process-level crash protection ────────────────────────────────
  // Prevent the server from crashing on unhandled errors in background
  // tasks (dispatch, assembly, WebSocket handlers, etc.)

  let uncaughtCount = 0;
  const UNCAUGHT_RESET_MS = 60_000; // 1 minute window
  const MAX_UNCAUGHT = 5; // exit after 5 uncaught exceptions within the window

  process.on('uncaughtException', (err) => {
    console.error('[FATAL] Uncaught exception:', err);
    captureError(err, { type: 'uncaughtException' });

    // Exit on truly unrecoverable errors
    if (err.message?.includes('EADDRINUSE') || err.message?.includes('ENOMEM')) {
      console.error('[FATAL] Unrecoverable error — shutting down');
      process.exit(1);
    }

    // Track frequency — exit if too many uncaught exceptions in rapid succession
    uncaughtCount++;
    setTimeout(() => { uncaughtCount = Math.max(0, uncaughtCount - 1); }, UNCAUGHT_RESET_MS);
    if (uncaughtCount >= MAX_UNCAUGHT) {
      console.error(`[FATAL] ${MAX_UNCAUGHT} uncaught exceptions within ${UNCAUGHT_RESET_MS / 1000}s — shutting down`);
      process.exit(1);
    }
  });

  process.on('unhandledRejection', (reason, _promise) => {
    console.error('[WARN] Unhandled promise rejection:', reason);
    if (reason instanceof Error) captureError(reason, { type: 'unhandledRejection' });
    // Don't crash — log and continue. Most unhandled rejections come from
    // fire-and-forget dispatch() or assembly calls that already have their
    // own error handling. This is a safety net.
  });

  // ── Graceful shutdown ────────────────────────────────────────────────

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n[SERVER] ${signal} received — shutting down gracefully...`);

    // Stop accepting new connections
    try {
      await fastify.close();
      console.log('[SERVER] Server closed');
    } catch (err) {
      console.error('[SERVER] Error during shutdown:', err);
    }

    // Clean up timers
    clearInterval(tokenCleanupInterval);
    sessionManager.stopCleanup();

    // Destroy all active sessions (archives them)
    for (const session of sessionManager.getAllSessions()) {
      try {
        sessionManager.destroySession(session.id, `Server shutdown (${signal})`);
      } catch { /* best-effort cleanup */ }
    }

    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // ── Start ────────────────────────────────────────────────────────────

  try {
    await fastify.listen({ port, host: config.host });

    const dashboardAvailable = fs.existsSync(frontendDir);
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║                       LAVERN API SERVER                      ║
║                The agentic legal architecture                ║
╚══════════════════════════════════════════════════════════════╝

  HTTP:      http://localhost:${port}
  WebSocket: ws://localhost:${port}/api/sessions/:id/events
  Health:    http://localhost:${port}/health
${dashboardAvailable ? `  Dashboard: http://localhost:${port}/dashboard/` : '  Dashboard: Not built (run "cd viz && npm run build")'}

  Create a session:
    curl -X POST http://localhost:${port}/api/sessions \\
      -H 'Content-Type: application/json' \\
      -d '{"documentPath": "./doc.txt", "context": {"moment": "signup"}}'

  Stream events:
    wscat -c ws://localhost:${port}/api/sessions/<id>/events

  Submit gate decision:
    curl -X POST http://localhost:${port}/api/sessions/<id>/gate \\
      -d '{"decision": "approve", "notes": "Looks good"}'
`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}
