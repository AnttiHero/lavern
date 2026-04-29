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
import { analyzeFirm, synthesiseFirmSoul } from '../agent-builder/firm-analyzer.js';
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

      // ── Kick off Opus (agents) and Sonnet (soul) in parallel ──────────
      // The user sees a quiet pulsing parchment until the soul lands
      // (~10 sec), then the team reveals when Opus returns (~30-60 sec).
      // The soul IS the mid-wait entertainment.
      send({ type: 'progress', step: 'generating' });
      const agentsPromise = analyzeFirm(scraped, { count, hint, onLog: log });
      const soulPromise = synthesiseFirmSoul(scraped).catch((err) => {
        // Soul is nice-to-have. If it fails, log + continue with agents.
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn('Soul synthesis failed (non-fatal)', { url, error: msg });
        return null;
      });

      // Soul lands first (Sonnet is faster than Opus)
      const soulResult = await soulPromise;
      if (clientDisconnected) { clearInterval(heartbeat); reply.raw.end(); return; }
      let soulCost = 0;
      if (soulResult) {
        soulCost = soulResult.costUsd;
        send({ type: 'soul', soul: soulResult.soul });
      }

      // ── Phase E: agents land when Opus finishes ───────────────────────
      const { analysis, costUsd: agentsCost } = await agentsPromise;
      if (clientDisconnected) { clearInterval(heartbeat); reply.raw.end(); return; }

      // Fire firm name as a separate event so the parchment can resolve
      // to a chapter title before the cards stagger in.
      send({ type: 'firm', firmName: analysis.firmName, firmTagline: analysis.firmTagline });
      await new Promise(r => setTimeout(r, 700));

      // Then archetype names only — quick chapter-title reveal — followed
      // by the full card data 400 ms later for the expand animation.
      for (const profile of analysis.agents) {
        if (clientDisconnected) break;
        send({ type: 'agent', profile });
        await new Promise(r => setTimeout(r, 350));
      }

      const totalCost = agentsCost + soulCost;
      send({
        type: 'done',
        firmName: analysis.firmName,
        firmTagline: analysis.firmTagline,
        cost: Number(totalCost.toFixed(4)),
      });

      logger.info('Firm import complete', {
        url,
        firmName: analysis.firmName,
        agents: analysis.agents.length,
        soulPresent: !!soulResult,
        costUsd: totalCost.toFixed(4),
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
