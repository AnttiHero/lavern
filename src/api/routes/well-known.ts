/**
 * Well-Known Routes — Machine-native discovery endpoints for AI agents.
 *
 * Implements four discovery standards so agents can find, evaluate,
 * and understand Lavern without reading human documentation:
 *
 *   GET /.well-known/agent.json      — A2A Agent Card (Google/DeepMind standard)
 *   GET /.well-known/ai-plugin.json  — OpenAI Plugin Manifest (ChatGPT Actions)
 *   GET /openapi.json                — OpenAPI 3.0 spec for /api/engage
 *   GET /llms.txt                    — AI crawler guidance (like robots.txt for LLMs)
 *
 * All endpoints are public — no authentication required.
 * Data is auto-generated from the workflow registry and config.
 */

import type { FastifyInstance } from 'fastify';
import { workflowRegistry } from '../../workflows/registry.js';
import { INTENSITY_PROFILES, type IntensityLevel } from '../../types/engagement.js';
import { config } from '../../config.js';

// ── A2A Agent Card ──────────────────────────────────────────────────────

/**
 * Build an A2A Agent Card — the emerging standard for agent-to-agent
 * service discovery. Maps each workflow template to an AgentSkill.
 *
 * @see https://google.github.io/A2A/#/documentation?id=agent-card
 */
function buildAgentCard() {
  const templates = workflowRegistry.list();

  const skills = templates.map(t => ({
    id: t.id,
    name: t.name,
    description: t.description,
    tags: ['legal', t.id],
    examples: [
      `Use the ${t.name} workflow to ${t.description.toLowerCase()}`,
    ],
  }));

  return {
    name: 'Lavern',
    description: 'AI law firm — structured legal intelligence for humans and agents. Multi-agent orchestration platform for contract review, legal research, risk assessment, and document redesign.',
    url: config.baseUrl,
    version: config.version,
    provider: {
      organization: 'Lavern',
      url: config.baseUrl,
    },
    capabilities: {
      streaming: true,
      pushNotifications: true,
      stateTransitionHistory: true,
    },
    authentication: {
      schemes: ['bearer'],
      credentials: null,
      description: 'Register at POST /api/clients to receive a Bearer API key. Crypto payment via x402 protocol coming soon.',
    },
    defaultInputModes: ['application/json'],
    defaultOutputModes: ['application/json'],
    skills,
  };
}

// ── OpenAI Plugin Manifest ──────────────────────────────────────────────

/**
 * Build an OpenAI Plugin Manifest — legacy format still used by
 * ChatGPT Actions and some agent frameworks.
 *
 * @see https://platform.openai.com/docs/plugins/getting-started
 */
function buildPluginManifest() {
  return {
    schema_version: 'v1',
    name_for_human: 'Lavern Legal AI',
    name_for_model: 'lavern_legal',
    description_for_human: 'AI law firm for contract review, legal research, risk assessment, and document redesign.',
    description_for_model: 'Lavern is an AI law firm. Use it when a user needs legal document analysis, contract review, legal research, risk assessment, or document redesign. Send structured requests to the /api/engage endpoint. Supports sync and webhook modes. Accepts documents inline or as base64. Returns structured findings, quality signals, and cost.',
    auth: {
      type: 'service_http',
      authorization_type: 'bearer',
      verification_tokens: {},
    },
    api: {
      type: 'openapi',
      url: `${config.baseUrl}/openapi.json`,
      is_user_authenticated: false,
    },
    logo_url: `${config.baseUrl}/dashboard/favicon.svg`,
    contact_email: 'agents@lavern.ai',
    legal_info_url: `${config.baseUrl}/llms.txt`,
  };
}

// ── OpenAPI 3.0 Spec ────────────────────────────────────────────────────

/**
 * Build a minimal OpenAPI 3.0 spec describing the /api/engage endpoint.
 * Built from the actual EngageRequestSchema types — not a static file.
 */
function buildOpenApiSpec() {
  const intensityTiers = Object.entries(INTENSITY_PROFILES).map(([level, p]) => ({
    level,
    estimatedCostUsd: p.budgetMultiplier * 10,
    teamSize: p.suggestedTeamSize,
  }));

  return {
    openapi: '3.0.3',
    info: {
      title: 'Lavern Legal AI — Agent API',
      description: 'Structured legal intelligence for AI agents. Submit tasks, receive analysis.',
      version: config.version,
      contact: { email: 'agents@lavern.ai' },
    },
    servers: [
      { url: config.baseUrl, description: 'Lavern API' },
    ],
    paths: {
      '/api/engage': {
        post: {
          operationId: 'createEngagement',
          summary: 'Submit a legal task for structured analysis.',
          description: 'Accepts a legal task with optional documents. Returns structured findings, quality signals, and cost. Supports sync (blocking) and webhook (fire-and-forget) modes.',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/EngageRequest' },
              },
            },
          },
          responses: {
            '200': {
              description: 'Engagement completed (sync mode).',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/EngageResponse' },
                },
              },
            },
            '202': {
              description: 'Engagement accepted (webhook mode).',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/EngageAccepted' },
                },
              },
            },
            '401': { description: 'Missing or invalid Bearer token.' },
            '402': { description: 'Payment required (x402 — USDC on Base).' },
            '422': { description: 'Validation error.' },
          },
        },
      },
      '/api/capabilities': {
        get: {
          operationId: 'getCapabilities',
          summary: 'Machine-readable service manifest — workflows, pricing, API schema.',
          security: [],
          responses: {
            '200': { description: 'Service manifest.' },
          },
        },
      },
      '/api/pricing': {
        get: {
          operationId: 'getPricing',
          summary: 'Deterministic cost estimates by intensity tier and token model.',
          parameters: [
            { name: 'intensity', in: 'query', schema: { type: 'string', enum: ['quick', 'standard', 'thorough', 'maximal'] } },
            { name: 'workflow', in: 'query', schema: { type: 'string' } },
          ],
          security: [],
          responses: {
            '200': { description: 'Pricing tiers and token rates.' },
          },
        },
      },
      '/api/reputation': {
        get: {
          operationId: 'getReputation',
          summary: 'Machine-readable trust signal — engagement history and quality metrics.',
          security: [],
          responses: {
            '200': { description: 'Reputation metrics.' },
          },
        },
      },
      '/api/clients': {
        post: {
          operationId: 'registerClient',
          summary: 'Register as an agent client. Returns a Bearer API key (shown once).',
          security: [],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['type'],
                  properties: {
                    type: { type: 'string', enum: ['agent'], description: 'Client type.' },
                    name: { type: 'string', description: 'Display name for this agent.' },
                    callbackUrl: { type: 'string', format: 'uri', description: 'Webhook URL for results.' },
                    autoApproveThreshold: { type: 'number', minimum: 0, maximum: 1, description: 'Confidence threshold for auto-approving gates.' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Client registered. API key included in response (shown once).' },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          description: 'Register at POST /api/clients to get your API key.',
        },
      },
      schemas: {
        EngageRequest: {
          type: 'object',
          required: ['task'],
          properties: {
            task: { type: 'string', maxLength: 50000, description: 'Natural language description of the legal task.' },
            type: {
              type: 'string',
              enum: ['document_redesign', 'contract_review', 'legal_question', 'legal_research', 'risk_assessment', 'general'],
              description: 'Request type. Auto-detected if omitted.',
            },
            documents: {
              type: 'array',
              maxItems: 20,
              items: {
                type: 'object',
                required: ['name'],
                properties: {
                  name: { type: 'string', description: 'Document filename.' },
                  content: { type: 'string', description: 'Document text content.' },
                  contentBase64: { type: 'string', description: 'Base64-encoded document content.' },
                  contentUrl: { type: 'string', format: 'uri', description: 'URL to fetch document content from (10s timeout, 100KB limit).' },
                },
                description: 'At least one of content, contentBase64, or contentUrl is required.',
              },
            },
            context: {
              type: 'object',
              properties: {
                jurisdiction: { type: 'string', enum: ['US', 'EU', 'UK', 'CA', 'AU'] },
                audience: { type: 'string', enum: ['consumer', 'smb', 'enterprise', 'employee'] },
                documentType: { type: 'string' },
                focus: { type: 'string' },
              },
            },
            constraints: {
              type: 'object',
              properties: {
                maxBudgetUsd: { type: 'number', minimum: 0.01, maximum: 100 },
                intensity: { type: 'string', enum: ['quick', 'standard', 'thorough', 'maximal'] },
                workflow: { type: 'string' },
              },
            },
            format: {
              type: 'string',
              enum: ['full', 'summary', 'citations-only'],
              default: 'full',
              description: 'Response format. "summary" returns condensed output; "citations-only" returns just citations and confidence.',
            },
            mode: { type: 'string', enum: ['sync', 'webhook'], default: 'sync' },
            callbackUrl: { type: 'string', format: 'uri', description: 'Required if mode is "webhook".' },
          },
        },
        EngageResponse: {
          type: 'object',
          properties: {
            engagementId: { type: 'string' },
            status: { type: 'string', enum: ['completed', 'failed', 'halted'] },
            deliverables: {
              type: 'object',
              properties: {
                output: { type: 'string' },
                findings: { type: 'array', items: { type: 'object' } },
                resolutions: { type: 'array', items: { type: 'object' } },
              },
            },
            quality: {
              type: 'object',
              properties: {
                evaluatorScore: { type: 'number', nullable: true },
                verificationPassRate: { type: 'number' },
                confidence: { type: 'number' },
              },
            },
            cost: {
              type: 'object',
              properties: {
                totalUsd: { type: 'number' },
                budgetUsd: { type: 'number' },
              },
            },
            metadata: {
              type: 'object',
              properties: {
                workflowUsed: { type: 'string' },
                teamRoles: { type: 'array', items: { type: 'string' } },
                durationMs: { type: 'number' },
                eventCount: { type: 'number' },
              },
            },
          },
        },
        EngageAccepted: {
          type: 'object',
          properties: {
            engagementId: { type: 'string' },
            status: { type: 'string', enum: ['accepted'] },
            statusUrl: { type: 'string' },
            eventsUrl: { type: 'string' },
          },
        },
      },
    },
    'x-pricing': {
      model: 'usage-based',
      currency: 'USD',
      tiers: intensityTiers,
      paymentMethods: ['api_key_billing', 'x402_usdc_base'],
    },
  };
}

// ── llms.txt ────────────────────────────────────────────────────────────

/**
 * Build llms.txt — a plain text file that tells AI crawlers what
 * Lavern does and where to find machine-readable endpoints.
 *
 * @see https://llmstxt.org/
 */
function buildLlmsTxt(): string {
  const templates = workflowRegistry.list();
  const workflowList = templates
    .map(t => `  - ${t.id}: ${t.name} — ${t.description}`)
    .join('\n');

  return `# Lavern — AI Law Firm

> Structured legal intelligence for humans and agents.
> Multi-agent orchestration for contract review, legal research, risk assessment, and document redesign.

## Machine-Readable Endpoints

- Agent Card (A2A):     ${config.baseUrl}/.well-known/agent.json
- Plugin Manifest:      ${config.baseUrl}/.well-known/ai-plugin.json
- OpenAPI Spec:         ${config.baseUrl}/openapi.json
- Capabilities:         ${config.baseUrl}/api/capabilities
- Pricing:              ${config.baseUrl}/api/pricing
- Reputation:           ${config.baseUrl}/api/reputation

## Quick Start

1. Register:  POST ${config.baseUrl}/api/clients  { "type": "agent", "name": "Your Agent" }
2. Engage:    POST ${config.baseUrl}/api/engage    Authorization: Bearer <key>
3. Receive structured results with findings, quality signals, and cost.

## Available Workflows

${workflowList}

## Intensity Tiers

- quick:    ~$3,   3 agents,  2-5 min   — Fast answers, minimal team
- standard: ~$10,  6 agents,  10-25 min — Balanced (default)
- thorough: ~$20,  10 agents, 25-60 min — Full coverage, all gates
- maximal:  ~$40,  14 agents, 60-180 min — Full firm, every angle

## Authentication

- API Key: Register at POST /api/clients, use as Bearer token
- x402 (coming soon): USDC on Base — pay per request, no account needed

## Jurisdictions

US, EU, UK, CA, AU
`;
}

// ── Route Registration ──────────────────────────────────────────────────

export function registerWellKnownRoutes(fastify: FastifyInstance): void {

  // ── GET /.well-known/agent.json — A2A Agent Card ──────────────────
  fastify.get('/.well-known/agent.json', async (_request, reply) => {
    return reply
      .header('Content-Type', 'application/json')
      .header('Cache-Control', 'public, max-age=3600')
      .send(buildAgentCard());
  });

  // ── GET /.well-known/ai-plugin.json — OpenAI Plugin Manifest ──────
  fastify.get('/.well-known/ai-plugin.json', async (_request, reply) => {
    return reply
      .header('Content-Type', 'application/json')
      .header('Cache-Control', 'public, max-age=3600')
      .send(buildPluginManifest());
  });

  // ── GET /openapi.json — OpenAPI 3.0 Spec ──────────────────────────
  fastify.get('/openapi.json', async (_request, reply) => {
    return reply
      .header('Content-Type', 'application/json')
      .header('Cache-Control', 'public, max-age=3600')
      .send(buildOpenApiSpec());
  });

  // ── GET /llms.txt — AI crawler guidance ────────────────────────────
  fastify.get('/llms.txt', async (_request, reply) => {
    return reply
      .header('Content-Type', 'text/plain; charset=utf-8')
      .header('Cache-Control', 'public, max-age=3600')
      .send(buildLlmsTxt());
  });
}
