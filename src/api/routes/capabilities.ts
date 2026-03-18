/**
 * Capabilities Routes — Machine-readable service manifest.
 *
 * GET /api/capabilities — Returns a structured manifest describing:
 *   - What Lavern can do (available workflows, request types)
 *   - How to use it (API schema, registration flow)
 *   - What it costs (per-workflow estimates, intensity tiers)
 *   - How to monitor (status endpoints, WebSocket events)
 *
 * Public endpoint — no authentication required.
 * Designed for agent discovery: an AI agent can read this manifest
 * and understand how to register, engage, and receive results.
 *
 * v10: Act 2 of the Legal Singularity — advertising to agents.
 */

import type { FastifyInstance } from 'fastify';
import { workflowRegistry } from '../../workflows/registry.js';
import { INTENSITY_PROFILES, type IntensityLevel } from '../../types/engagement.js';
import { config } from '../../config.js';

export function registerCapabilitiesRoutes(fastify: FastifyInstance): void {

  // ── GET /api/capabilities — Machine-readable service manifest ────────
  fastify.get('/api/capabilities', async (_request, reply) => {
    const templates = workflowRegistry.list();

    return reply.send({
      service: {
        name: 'Lavern',
        tagline: 'AI law firm — structured legal intelligence for humans and agents.',
        version: '10.0.0',
        description: 'Multi-agent legal orchestration platform. Upload documents, describe tasks, and receive structured legal analysis. Same engine serves human clients through a visual interface and AI agents through this API.',
        provider: config.provider,
        providerModel: config.provider === 'mistral' ? config.mistral.defaultModel : config.defaultModel,
      },

      // ── Available Workflows ──
      workflows: templates.map(t => {
        const gateSteps = t.steps.filter(s => {
          const def = t.stepDefinitions[s];
          return def?.requiresGateApproval || def?.requiresEvaluatorGate;
        });

        return {
          id: t.id,
          name: t.name,
          description: t.description,
          steps: t.steps.length,
          agents: t.requiredAgents.length,
          gates: gateSteps.length,
          requiredAgents: t.requiredAgents,
        };
      }),

      // ── Request Types ──
      requestTypes: [
        { type: 'contract_review', description: 'Review a contract for risks, deviations, and issues.' },
        { type: 'legal_research', description: 'Research a legal question with citations and analysis.' },
        { type: 'document_redesign', description: 'Redesign a legal document for readability and compliance.' },
        { type: 'legal_question', description: 'Answer a focused legal question with structured reasoning.' },
        { type: 'risk_assessment', description: 'Assess legal risks with quantified scoring and recommendations.' },
        { type: 'general', description: 'General legal task — auto-routed to the best workflow.' },
      ],

      // ── Intensity Tiers ──
      intensityTiers: Object.entries(INTENSITY_PROFILES).map(([level, profile]) => ({
        level: level as IntensityLevel,
        label: profile.label,
        description: profile.description,
        estimatedCostUsd: profile.budgetMultiplier * 10,
        estimatedMinutes: profile.estimatedMinutes,
        teamSize: profile.suggestedTeamSize,
        gates: profile.gateFrequency,
      })),

      // ── Jurisdictions ──
      jurisdictions: ['US', 'EU', 'UK', 'CA', 'AU'],

      // ── API Schema ──
      api: {
        register: {
          method: 'POST',
          path: '/api/clients',
          auth: 'none',
          description: 'Register as an agent client. Returns an API key (shown once).',
          body: {
            type: { type: 'string', enum: ['agent'], required: true },
            name: { type: 'string', required: false, description: 'Display name for this agent.' },
            callbackUrl: { type: 'string', required: false, description: 'Webhook URL for gate decisions and results.' },
            autoApproveThreshold: { type: 'number', required: false, description: 'Confidence threshold (0-1) for auto-approving gates.' },
          },
          returns: '{ clientId, type, name, apiKey }',
        },
        engage: {
          method: 'POST',
          path: '/api/engage',
          auth: 'Bearer <apiKey>',
          description: 'Submit a legal task. Returns structured results (sync) or accepts for webhook delivery.',
          body: {
            task: { type: 'string', required: true, description: 'Natural language description of the legal task.' },
            type: { type: 'string', required: false, description: 'Request type. Auto-detected if omitted.' },
            documents: { type: 'array', required: false, description: 'Documents to analyze: [{ name, content }].' },
            context: { type: 'object', required: false, description: '{ jurisdiction?, audience?, documentType?, focus? }' },
            constraints: { type: 'object', required: false, description: '{ maxBudgetUsd?, intensity?, workflow? }' },
            mode: { type: 'string', required: false, description: '"sync" (default) or "webhook".' },
            callbackUrl: { type: 'string', required: false, description: 'Required if mode is "webhook".' },
          },
          returns: {
            sync: '{ engagementId, status, deliverables, quality, cost, metadata }',
            webhook: '{ engagementId, status: "accepted", statusUrl, eventsUrl }',
          },
        },
        status: {
          method: 'GET',
          path: '/api/sessions/:id',
          auth: 'Bearer <apiKey>',
          description: 'Check the status of a running or completed session.',
        },
        events: {
          method: 'GET (WebSocket)',
          path: '/api/sessions/:id/events',
          auth: 'none (WebSocket)',
          description: 'Real-time event stream via WebSocket. Query param: ?from=N for replay.',
        },
      },

      // ── Pricing Model ──
      pricing: {
        model: 'usage-based',
        description: 'Pay per engagement. Cost depends on workflow complexity, team size, and intensity level.',
        currency: 'USD',
        estimates: {
          quick: { min: 0.50, max: 3.00, description: 'Simple queries, fast turnaround' },
          standard: { min: 2.00, max: 10.00, description: 'Most engagements, balanced quality' },
          thorough: { min: 5.00, max: 20.00, description: 'Complex matters, high assurance' },
          maximal: { min: 15.00, max: 40.00, description: 'Full firm engagement, maximum quality' },
        },
        budgetEnforcement: 'Hard cap. Session halts if budget is exceeded.',
      },

      // ── Integration Guide ──
      quickstart: [
        '1. Register: POST /api/clients { "type": "agent", "name": "Your Agent" }',
        '2. Save your API key (shown once at registration).',
        '3. Engage: POST /api/engage with Authorization: Bearer <key>',
        '4. Receive structured results with deliverables, quality signals, and cost.',
      ],
    });
  });
}
