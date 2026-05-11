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

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import * as crypto from 'node:crypto';
import { scrapeFirmSite, ScrapeError } from '../agent-builder/firm-scraper.js';
import { analyzeFirm, synthesiseFirmSoul } from '../agent-builder/firm-analyzer.js';
import { renderAgentOgPng } from '../agent-builder/og-image.js';
import { renderTeamOgPng, type TeamMemberForOg } from '../agent-builder/team-og-image.js';
import { createLogger } from '../../utils/logger.js';
import { config } from '../../config.js';
import {
  upsertSharedAgent, getSharedAgent, bumpSharedAgentViews, deleteSharedAgent,
  upsertSharedTeam, getSharedTeam, bumpSharedTeamViews, deleteSharedTeam,
  getUserById,
} from '../../db/database.js';

interface AuthenticatedRequest extends FastifyRequest {
  user?: { id: string; email: string };
}

const SharedAgentProfileSchema = z.object({
  displayName: z.string().min(1).max(120),
  tagline: z.string().min(1).max(280),
  category: z.enum(['lawyer', 'specialist', 'infrastructure', 'orchestrator']),
  seniority: z.enum(['partner', 'senior-associate', 'associate', 'junior', 'specialist', 'counsel']),
  costTier: z.enum(['opus', 'sonnet', 'haiku']),
  billingRateUsd: z.number().int().min(0).max(10000),
  skills: z.record(z.string(), z.number().int().min(1).max(10)),
  personality: z.object({
    archetype: z.string().min(1).max(120),
    traits: z.record(z.string(), z.number()),
    workStyle: z.string().min(1).max(560),
  }),
  practiceAreas: z.array(z.string()).max(10),
  strengths: z.array(z.string()).max(10),
  limitations: z.array(z.string()).max(10),
  optional: z.boolean().optional(),
  defaultSelected: z.boolean().optional(),
  avatarSeed: z.string().max(120).optional(),
  provenance: z.object({
    kind: z.enum(['self', 'firm', 'scratch', 'goblin']),
    firmName: z.string().max(120).optional(),
    createdAt: z.string().max(50).optional(),
  }).optional(),
}).passthrough();

const ShareCreateBodySchema = z.object({
  profile: SharedAgentProfileSchema,
});

const ShareTeamBodySchema = z.object({
  /** 1-6 agent profiles to render as the team's lineup. */
  agents: z.array(SharedAgentProfileSchema).min(1).max(6),
  /** Optional team title. Falls back to "My Team". */
  title: z.string().max(120).optional(),
});

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

  // ── POST /api/agents/share — create or rotate a public share token ──
  // Auth required. Body: { profile: AgentProfile }. Returns { token, url }.
  fastify.post('/api/agents/share', async (request, reply) => {
    const authReq = request as AuthenticatedRequest;
    const userId = authReq.user?.id ?? null;
    if (!userId) {
      return reply.status(401).send({ error: 'Authentication required.' });
    }

    const parsed = ShareCreateBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid profile',
        details: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`),
      });
    }
    // Audit fix LOW: cap serialized payload (Zod schema uses .passthrough()).
    const profileJson = JSON.stringify(parsed.data.profile);
    if (profileJson.length > 32_000) {
      return reply.status(413).send({ error: 'Profile payload too large (>32KB).' });
    }

    // Generate a 24-byte token (32 chars base64url) — unguessable in practice
    const token = crypto.randomBytes(24).toString('base64url');
    const owner = getUserById(userId);
    const ownerName = owner?.display_name || (owner?.email?.split('@')[0]) || '';

    upsertSharedAgent(token, userId, ownerName, profileJson);

    const baseUrl = config.baseUrl;
    return reply.send({
      token,
      url: `${baseUrl}/a/${token}`,
      shareImageUrl: `${baseUrl}/api/agents/share/${token}/og.png`,
    });
  });

  // ── DELETE /api/agents/share/:token — revoke ───────────────────────
  fastify.delete('/api/agents/share/:token', async (request, reply) => {
    const authReq = request as AuthenticatedRequest;
    const userId = authReq.user?.id ?? null;
    if (!userId) return reply.status(401).send({ error: 'Authentication required.' });

    const { token } = request.params as { token: string };
    const ok = deleteSharedAgent(token, userId);
    if (!ok) return reply.status(404).send({ error: 'Share not found or not owned by you.' });
    return reply.send({ revoked: true });
  });

  // ── GET /api/agents/share/:token — public read ─────────────────────
  fastify.get('/api/agents/share/:token', async (request, reply) => {
    const { token } = request.params as { token: string };
    const row = getSharedAgent(token);
    if (!row) return reply.status(404).send({ error: 'Not found.' });
    // Audit fix M12: defer the SQLite write so the response isn't blocked
    // by serialized writes during a viral burst (LinkedIn unfurl + many
    // simultaneous visitors). Errors are intentionally swallowed.
    setImmediate(() => { try { bumpSharedAgentViews(token); } catch { /* ignore */ } });

    let profile: unknown;
    try { profile = JSON.parse(row.profileJson); }
    catch { return reply.status(500).send({ error: 'Stored profile is corrupt.' }); }

    return reply.send({
      token,
      profile,
      ownerName: row.ownerName,
      viewCount: row.viewCount + 1,
      createdAt: row.createdAt,
    });
  });

  // ── GET /api/agents/share/:token/og.png — public OG image ──────────
  fastify.get('/api/agents/share/:token/og.png', async (request, reply) => {
    const { token } = request.params as { token: string };
    const row = getSharedAgent(token);
    if (!row) return reply.status(404).send({ error: 'Not found.' });

    let profile: Record<string, unknown>;
    try { profile = JSON.parse(row.profileJson); }
    catch { return reply.status(500).send({ error: 'Stored profile is corrupt.' }); }

    // Resolve the avatar URL — goblin gets the local /goblin.png; everyone
    // else gets DiceBear by avatarSeed.
    const isGoblin = profile.avatarSeed === 'goblin';
    const baseUrl = config.baseUrl;
    const avatarUrl = isGoblin
      ? `${baseUrl}/goblin.png`
      : `https://api.dicebear.com/9.x/notionists/png?seed=${encodeURIComponent(String(profile.avatarSeed || profile.displayName))}&backgroundColor=transparent&size=400`;

    try {
      const personality = (profile.personality ?? {}) as Record<string, unknown>;
      const png = await renderAgentOgPng({
        displayName: String(profile.displayName ?? ''),
        archetype: String(personality.archetype ?? ''),
        tagline: String(profile.tagline ?? ''),
        seenOnSite: String((profile as { seenOnSite?: string }).seenOnSite ?? ''),
        skills: (profile.skills as Record<string, number>) ?? {},
        practiceAreas: Array.isArray(profile.practiceAreas) ? profile.practiceAreas as string[] : [],
        strengths: Array.isArray(profile.strengths) ? profile.strengths as string[] : [],
        limitations: Array.isArray(profile.limitations) ? profile.limitations as string[] : [],
        category: String(profile.category ?? ''),
        seniority: String(profile.seniority ?? ''),
        costTier: String(profile.costTier ?? ''),
        billingRateUsd: typeof profile.billingRateUsd === 'number' ? profile.billingRateUsd : undefined,
        personalityTraits: (personality.traits as Record<string, number>) ?? {},
        workStyle: String(personality.workStyle ?? ''),
        avatarUrl,
        provenance: profile.provenance as { kind: 'self' | 'firm' | 'scratch' | 'goblin'; firmName?: string } | undefined,
      }, row.ownerName);

      return reply
        .header('Content-Type', 'image/png')
        .header('Cache-Control', 'public, max-age=3600')
        .send(png);
    } catch (err) {
      logger.error('OG image render failed', { token, error: err instanceof Error ? err.message : String(err) });
      return reply.status(500).send({ error: 'Image render failed.' });
    }
  });

  // ── TEAM SHARE ────────────────────────────────────────────────────
  // The team analogue of /api/agents/share. Owner shares a lineup of
  // 1-6 agents; the OG image renders front cards in a grid. Public
  // viewers see the team at /t/:token (no auth).

  // POST /api/teams/share — create or rotate a team share token.
  fastify.post('/api/teams/share', async (request, reply) => {
    const authReq = request as AuthenticatedRequest;
    const userId = authReq.user?.id ?? null;
    if (!userId) return reply.status(401).send({ error: 'Authentication required.' });

    const parsed = ShareTeamBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid team',
        details: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`),
      });
    }
    // Audit fix LOW (Zod .passthrough): cap serialized payload so a client
    // can't pump arbitrary extra keys to inflate row size.
    const teamJsonSerialized = JSON.stringify(parsed.data.agents);
    if (teamJsonSerialized.length > 64_000) {
      return reply.status(413).send({ error: 'Team payload too large (>64KB).' });
    }

    const token = crypto.randomBytes(24).toString('base64url');
    const owner = getUserById(userId);
    const ownerName = owner?.display_name || (owner?.email?.split('@')[0]) || '';

    upsertSharedTeam(
      token,
      userId,
      ownerName,
      parsed.data.title ?? '',
      teamJsonSerialized,
    );

    const baseUrl = config.baseUrl;
    return reply.send({
      token,
      url: `${baseUrl}/#/t/${token}`,
      shareImageUrl: `${baseUrl}/api/teams/share/${token}/og.png`,
    });
  });

  // DELETE /api/teams/share/:token — revoke
  fastify.delete('/api/teams/share/:token', async (request, reply) => {
    const authReq = request as AuthenticatedRequest;
    const userId = authReq.user?.id ?? null;
    if (!userId) return reply.status(401).send({ error: 'Authentication required.' });

    const { token } = request.params as { token: string };
    const ok = deleteSharedTeam(token, userId);
    if (!ok) return reply.status(404).send({ error: 'Share not found or not owned by you.' });
    return reply.send({ revoked: true });
  });

  // GET /api/teams/share/:token — public read
  fastify.get('/api/teams/share/:token', async (request, reply) => {
    const { token } = request.params as { token: string };
    const row = getSharedTeam(token);
    if (!row) return reply.status(404).send({ error: 'Not found.' });
    // Audit fix M12: defer the write so viral bursts don't serialize
    // the response on per-row SQLite writes.
    setImmediate(() => { try { bumpSharedTeamViews(token); } catch { /* ignore */ } });

    let agents: unknown;
    try { agents = JSON.parse(row.teamJson); }
    catch { return reply.status(500).send({ error: 'Stored team is corrupt.' }); }

    return reply.send({
      token,
      agents,
      title: row.title,
      ownerName: row.ownerName,
      viewCount: row.viewCount + 1,
      createdAt: row.createdAt,
    });
  });

  // GET /api/teams/share/:token/og.png — public team OG image
  fastify.get('/api/teams/share/:token/og.png', async (request, reply) => {
    const { token } = request.params as { token: string };
    const row = getSharedTeam(token);
    if (!row) return reply.status(404).send({ error: 'Not found.' });

    let agents: Record<string, unknown>[];
    try {
      const parsed = JSON.parse(row.teamJson);
      if (!Array.isArray(parsed)) throw new Error('not an array');
      agents = parsed as Record<string, unknown>[];
    } catch {
      return reply.status(500).send({ error: 'Stored team is corrupt.' });
    }

    const baseUrl = config.baseUrl;
    const members: TeamMemberForOg[] = agents.slice(0, 6).map(profile => {
      const isGoblin = profile.avatarSeed === 'goblin';
      const avatarUrl = isGoblin
        ? `${baseUrl}/goblin.png`
        : `https://api.dicebear.com/9.x/notionists/png?seed=${encodeURIComponent(String(profile.avatarSeed || profile.displayName))}&backgroundColor=transparent&size=400`;
      return {
        displayName: String(profile.displayName ?? ''),
        tagline: String(profile.tagline ?? ''),
        category: String(profile.category ?? ''),
        seniority: String(profile.seniority ?? ''),
        costTier: String(profile.costTier ?? ''),
        billingRateUsd: typeof profile.billingRateUsd === 'number' ? profile.billingRateUsd : undefined,
        practiceAreas: Array.isArray(profile.practiceAreas) ? profile.practiceAreas as string[] : [],
        skills: (profile.skills as Record<string, number>) ?? {},
        avatarUrl,
      };
    });

    try {
      const png = await renderTeamOgPng(members, row.ownerName, row.title);
      return reply
        .header('Content-Type', 'image/png')
        .header('Cache-Control', 'public, max-age=3600')
        .send(png);
    } catch (err) {
      logger.error('Team OG image render failed', { token, error: err instanceof Error ? err.message : String(err) });
      return reply.status(500).send({ error: 'Image render failed.' });
    }
  });
}
