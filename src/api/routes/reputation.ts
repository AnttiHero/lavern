/**
 * Reputation Routes — Machine-readable trust signal for agent comparison.
 *
 * GET /api/reputation — Returns aggregated engagement metrics:
 *   - Total engagements, success rate
 *   - Average verification pass rate, delivery time, cost
 *   - Workflow breakdown
 *
 * Agents use this to compare Lavern against alternatives.
 * Cold-start safe: returns totalEngagements: 0 with null metrics.
 *
 * Public endpoint — no authentication required.
 */

import type { FastifyInstance } from 'fastify';
import { getReputationMetrics } from '../../db/database.js';
import { config } from '../../config.js';

export function registerReputationRoutes(fastify: FastifyInstance): void {

  fastify.get('/api/reputation', async (_request, reply) => {
    const metrics = getReputationMetrics();

    return reply
      .header('Cache-Control', 'public, max-age=60')
      .send({
        service: 'Lavern',
        version: config.version,
        generatedAt: new Date().toISOString(),
        metrics: {
          totalEngagements: metrics.totalEngagements,
          successRate: metrics.successRate,
          avgVerificationPassRate: metrics.avgVerificationPassRate,
          avgDeliveryTimeMs: metrics.avgDeliveryTimeMs,
          avgCostUsd: metrics.avgCostUsd,
        },
        workflowBreakdown: metrics.workflowBreakdown,
        trust: {
          multiAgentVerification: true,
          humanGateEnforcement: true,
          auditTrailAvailable: true,
          citationRequired: true,
          description: 'Every engagement runs through multi-agent debate, automated verification, and optional human gates. All findings require citations.',
        },
      });
  });
}
