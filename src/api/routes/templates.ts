/**
 * Template Routes — List and retrieve document templates.
 *
 * GET /api/templates      — List all template metadata
 * GET /api/templates/:id  — Get full template content by ID
 */

import type { FastifyInstance } from 'fastify';
import { listTemplates, getTemplateContent } from '../../templates/index.js';

export function registerTemplateRoutes(fastify: FastifyInstance): void {

  // ── GET /api/templates ─────────────────────────────────────────────

  fastify.get('/api/templates', async (_request, reply) => {
    const templates = listTemplates();
    return reply.send({ templates });
  });

  // ── GET /api/templates/:id ─────────────────────────────────────────

  fastify.get('/api/templates/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = getTemplateContent(id);

    if (!result) {
      return reply.status(404).send({ error: 'Template not found.' });
    }

    return reply.send({ template: result.meta, content: result.content });
  });
}
