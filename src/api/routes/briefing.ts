/**
 * Briefing Routes — LLM-powered intake analysis.
 *
 * POST /api/briefing/analyze — Analyze client intake and generate engagement brief
 */

import type { FastifyInstance } from 'fastify';
import { BriefingAnalyzeRequestSchema } from '../briefing/briefing-schema.js';
import { analyzeBriefing } from '../briefing/briefing-analyzer.js';

export function registerBriefingRoutes(fastify: FastifyInstance): void {

  // ── POST /api/briefing/analyze ──────────────────────────────────────
  //
  // Accepts client intake data (documents, Q&A, instructions) and returns:
  // - Sufficiency assessment (how ready is this for the agents?)
  // - Follow-up questions (what's missing?)
  // - Structured engagement brief (the master prompt)

  fastify.post('/api/briefing/analyze', async (request, reply) => {
    // Parse and validate request body
    const parsed = BriefingAnalyzeRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid request body',
        details: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`),
      });
    }

    try {
      const result = await analyzeBriefing(parsed.data);
      return reply.send(result);
    } catch (err) {
      console.error('[BRIEFING] Analysis failed:', err);
      return reply.status(500).send({
        error: 'Briefing analysis failed',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });
}
