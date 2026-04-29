/**
 * Agent Builder Routes — import-firm endpoint.
 *
 * POST /api/agent-builder/import-firm (SSE streaming)
 *   body: { url: string, count?: number (default 5), hint?: string }
 *
 * Events (each as `data: {...}\n\n`):
 *   { type: 'log',      message: string }
 *   { type: 'progress', step: 'fetching' | 'parsing' | 'generating' | 'done' }
 *   { type: 'agent',    profile: GeneratedAgent }       // fired once per agent
 *   { type: 'done',     firmName, firmTagline, cost }
 *   { type: 'error',    code?, message }
 *
 * Rate limiting relies on the global per-user limiter registered in server.ts.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { scrapeFirmSite, ScrapeError } from '../agent-builder/firm-scraper.js';
import { analyzeFirm } from '../agent-builder/firm-analyzer.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('AGENT-BUILDER');

const ImportFirmBodySchema = z.object({
  url:   z.string().min(1).max(2048),
  count: z.number().int().min(1).max(8).optional(),
  hint:  z.string().max(500).optional(),
});

export function registerAgentBuilderRoutes(fastify: FastifyInstance): void {

  fastify.post('/api/agent-builder/import-firm', async (request, reply) => {
    const parsed = ImportFirmBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid request body',
        details: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`),
      });
    }
    const { url, count = 5, hint } = parsed.data;

    // Hijack for SSE
    reply.hijack();
    let clientDisconnected = false;
    reply.raw.on('close', () => { clientDisconnected = true; });

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const send = (obj: unknown): void => {
      if (clientDisconnected) return;
      try {
        reply.raw.write(`data: ${JSON.stringify(obj)}\n\n`);
      } catch {
        /* socket closed mid-write */
      }
    };

    const log = (message: string): void => send({ type: 'log', message });

    // SSE keepalive: emit a comment line every 12 seconds so reverse proxies
    // and browser idle-timeouts don't kill the connection during the long
    // Opus call (which can run silent for 30-60+ s). SSE comments are
    // ignored by the spec-compliant client parser; the bytes alone keep
    // intermediaries alive.
    const heartbeat = setInterval(() => {
      if (clientDisconnected) return;
      try {
        reply.raw.write(`: heartbeat ${Date.now()}\n\n`);
      } catch {
        /* socket closed */
      }
    }, 12_000);
    reply.raw.on('close', () => clearInterval(heartbeat));

    try {
      send({ type: 'progress', step: 'fetching' });
      const scraped = await scrapeFirmSite(url, log);
      log(`Read ${scraped.pages.length} page${scraped.pages.length === 1 ? '' : 's'} · ${scraped.combinedChars.toLocaleString()} chars of clean text.`);

      if (clientDisconnected) { clearInterval(heartbeat); reply.raw.end(); return; }

      send({ type: 'progress', step: 'generating' });
      const { analysis, costUsd } = await analyzeFirm(scraped, { count, hint, onLog: log });

      if (clientDisconnected) { clearInterval(heartbeat); reply.raw.end(); return; }

      // Fire one agent event per profile for reveal sequencing
      for (const profile of analysis.agents) {
        send({ type: 'agent', profile });
        // Small stagger so client animations feel paced, not blasted
        await new Promise(r => setTimeout(r, 120));
      }

      send({
        type: 'done',
        firmName: analysis.firmName,
        firmTagline: analysis.firmTagline,
        cost: Number(costUsd.toFixed(4)),
      });

      logger.info('Firm import complete', {
        url,
        firmName: analysis.firmName,
        agents: analysis.agents.length,
        costUsd: costUsd.toFixed(4),
      });
    } catch (err) {
      if (err instanceof ScrapeError) {
        send({ type: 'error', code: err.code, message: err.message });
      } else {
        const message = err instanceof Error ? err.message : String(err);
        logger.warn('Firm import failed', { url, error: message });
        send({ type: 'error', code: 'generation_failed', message });
      }
    } finally {
      // Always clean up — clearInterval is safe to call twice if 'close' fired
      // first. reply.raw.end() is also idempotent.
      clearInterval(heartbeat);
      try { reply.raw.end(); } catch { /* already closed */ }
    }
  });
}
