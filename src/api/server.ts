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
import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import fastifyCors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import fastifyMultipart from '@fastify/multipart';
import fastifyRateLimit from '@fastify/rate-limit';
import { SessionManager } from '../session/session-manager.js';
import { registerSessionRoutes } from './routes/sessions.js';
import { registerReplayRoutes } from './routes/replay.js';
import { registerMatterRoutes } from './routes/matters.js';
import { registerAgentRoutes } from './routes/agents.js';
import { registerWorkflowRoutes } from './routes/workflows.js';
import { registerBriefingRoutes } from './routes/briefing.js';
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
import { ClientRegistry, createAuthMiddleware, registerAuthRoutes } from './middleware/auth.js';
import { registerUserAuthRoutes } from './routes/auth-routes.js';
import { initDatabase, cleanExpiredTokens } from '../db/database.js';
import { config } from '../config.js';

export async function startApiServer(port: number): Promise<void> {
  const fastify = Fastify({
    trustProxy: config.trustProxy,
    logger: {
      level: config.logLevel === 'debug' ? 'debug' : 'info',
      transport: {
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      },
    },
  });

  // ── Plugins ──────────────────────────────────────────────────────────

  await fastify.register(fastifyWebsocket);

  await fastify.register(fastifyCors, {
    origin: config.corsOrigins === '*' ? true : config.corsOrigins.split(','),
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  await fastify.register(fastifyMultipart, {
    limits: { fileSize: config.maxUploadBytes },
  });

  // Rate limiting — global default + stricter limit on session creation
  await fastify.register(fastifyRateLimit, {
    max: config.rateLimitMax,
    timeWindow: config.rateLimitWindowMs,
  });

  // ── Database ────────────────────────────────────────────────────────

  initDatabase();

  // Clean expired auth tokens at startup and every hour
  const expired = cleanExpiredTokens();
  if (expired > 0) console.log(`[AUTH] Cleaned ${expired} expired auth token${expired === 1 ? '' : 's'}`);
  const tokenCleanupInterval = setInterval(() => {
    const cleaned = cleanExpiredTokens();
    if (cleaned > 0) console.log(`[AUTH] Cleaned ${cleaned} expired auth token${cleaned === 1 ? '' : 's'}`);
  }, 60 * 60 * 1000); // 1 hour
  tokenCleanupInterval.unref(); // Don't keep the process alive for cleanup

  // ── Shared State ─────────────────────────────────────────────────────

  const sessionManager = new SessionManager();
  const clientRegistry = new ClientRegistry();

  // ── Authentication ──────────────────────────────────────────────────

  // ── Public paths ──────────────────────────────────────────────────
  // Paths listed here bypass auth (no Bearer token or cookie required).
  // Most POST mutations require a marble_token cookie (set by
  // /api/auth/login). Exceptions: session creation is public so the
  // QuickStart express lane works without login.
  const publicPaths: string[] = [
    '/health',
    '/',
    '/api/clients',           // Client registration is public (creates the API key)
    // Dashboard read-only views (mutations require cookie auth)
    'GET /api/sessions',      // Session listing
    'GET /api/sessions/*',    // Session detail + WebSocket events
    'GET /api/audit-logs',    // Audit log listing
    'GET /api/audit-logs/*',  // Audit log detail
    'GET /api/replay/*',      // WebSocket replay
    'GET /api/matters',       // Matter listing
    'GET /api/matters/*',     // Matter detail
    'GET /api/agents/*',      // Agent profiles, presets, recommendations
    'GET /api/workflows',     // Workflow templates
    // Agent API — public discovery endpoints (read-only)
    'GET /api/capabilities',  // Machine-readable service manifest
    'GET /.well-known/*',     // A2A agent card + OpenAI plugin manifest
    'GET /openapi.json',      // OpenAPI 3.0 spec
    'GET /llms.txt',          // AI crawler guidance
    'GET /api/pricing',       // Deterministic cost estimates
    'GET /api/reputation',    // Machine-readable trust signal
    // Session creation — QuickStart express lane (no login required)
    'POST /api/sessions',
    // Briefing — intake flow before login
    'POST /api/briefing/interview',
    'POST /api/briefing/analyze',
    // User auth routes (public by definition)
    'POST /api/auth/signup',
    'POST /api/auth/login',
    'POST /api/auth/logout',
    'GET /api/auth/me',
    // Document parsing — needed by Challenge and Briefing before login
    'POST /api/documents/parse',
    // The Marble Challenge — zero-friction, no auth required
    'POST /api/challenge',
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

  // ── Routes ───────────────────────────────────────────────────────────

  // Health check
  fastify.get('/health', async () => ({
    status: 'ok',
    service: 'the-shem',
    version: config.version,
    sessions: sessionManager.size,
    timestamp: new Date().toISOString(),
  }));

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
  // v8: Pre-engagement & team staffing routes
  registerMatterRoutes(fastify);
  registerAgentRoutes(fastify);
  // v9: Engagement configurator
  registerWorkflowRoutes(fastify);
  // v10: LLM-powered briefing analysis
  registerBriefingRoutes(fastify);
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
  // v19: The Marble Challenge — blind document comparison
  registerChallengeRoutes(fastify);

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

  // ── Start ────────────────────────────────────────────────────────────

  try {
    await fastify.listen({ port, host: config.host });

    const dashboardAvailable = fs.existsSync(frontendDir);
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║                     THE SHEM API SERVER                      ║
║              "We know what's written in the Golem's mouth"   ║
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
