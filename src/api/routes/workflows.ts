/**
 * Workflow Routes — Available workflow templates.
 *
 * v9: Provides workflow metadata for the Engagement Configurator.
 *   GET /api/workflows — List all registered workflow templates with summaries
 */

import type { FastifyInstance } from 'fastify';
import { workflowRegistry } from '../../workflows/registry.js';

export function registerWorkflowRoutes(fastify: FastifyInstance): void {

  // ── GET /api/workflows — List all workflow templates ─────────────────
  fastify.get('/api/workflows', async (_request, reply) => {
    const templates = workflowRegistry.list();

    return reply.send({
      workflows: templates.map(t => {
        // Count gates in step definitions
        const gateSteps = t.steps.filter(s => {
          const def = t.stepDefinitions[s];
          return def?.requiresGateApproval || def?.requiresEvaluatorGate;
        });

        return {
          id: t.id,
          name: t.name,
          description: t.description,
          stepCount: t.steps.length,
          steps: t.steps,
          requiredAgents: t.requiredAgents,
          gateCount: gateSteps.length,
          hasGates: gateSteps.length > 0,
          gateSteps: gateSteps,
        };
      }),
      total: templates.length,
    });
  });
}
