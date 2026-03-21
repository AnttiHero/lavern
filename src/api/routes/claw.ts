/**
 * Claw Mode API Routes — Remote monitoring & control.
 *
 * When the firm runs on a Mac Mini, these endpoints let you
 * check status, trigger scans, and browse deliveries from
 * your main machine or the dashboard.
 *
 * Endpoints:
 *   GET   /api/claw/health      — Structured health check (healthy/degraded/unhealthy)
 *   GET   /api/claw/status      — Profile + registry summary + budget + daemon
 *   GET   /api/claw/documents   — List all tracked documents with status
 *   GET   /api/claw/deliveries  — List completed delivery sessions
 *   PATCH /api/claw/ethical     — Toggle maximum ethical mode
 *   POST  /api/claw/scan        — Trigger an immediate rescan of watch paths
 *   POST  /api/claw/retry       — Retry failed or stale documents
 */

import * as fs from 'node:fs';
import { readFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { config } from '../../config.js';
import { loadProfile } from '../../claw/init.js';
import { DocumentRegistry } from '../../claw/registry.js';
import { getPrecedentBoard } from '../../claw/precedent-board.js';
import { getDaemonStatus } from '../../claw/daemon.js';
import { writeJsonFileAtomic } from '../../utils/fs-helpers.js';

// ── Singleton registry cache — prevents concurrent read-overwrite races ──
const registryCache = new Map<string, DocumentRegistry>();

function getRegistry(dir: string, budgetUsd: number): DocumentRegistry {
  let registry = registryCache.get(dir);
  if (!registry) {
    registry = new DocumentRegistry(dir, budgetUsd);
    registryCache.set(dir, registry);
  }
  return registry;
}

// ── Route Registration ──────────────────────────────────────────────────

export function registerClawRoutes(fastify: FastifyInstance): void {

  // ── GET /api/claw/health ────────────────────────────────────────────
  fastify.get('/api/claw/health', async (_request, reply) => {
    const dir = config.claw.dir;
    const profile = loadProfile(dir);
    const timestamp = new Date().toISOString();

    // Individual checks
    const profileCheck = profile
      ? { ok: true as const, company: profile.company }
      : { ok: false as const, company: null };

    // Watch paths
    let watchPathCount = 0;
    let accessibleCount = 0;
    if (profile) {
      watchPathCount = profile.watchPaths.length;
      for (const wp of profile.watchPaths) {
        const resolved = path.resolve(wp.replace(/^~/, os.homedir()));
        try {
          fs.accessSync(resolved, fs.constants.R_OK);
          accessibleCount++;
        } catch { /* not accessible */ }
      }
    }
    const watchPathsCheck = {
      ok: accessibleCount > 0,
      count: watchPathCount,
      accessible: accessibleCount,
    };

    // Budget
    let budgetCheck = { ok: false, remainingUsd: 0, percentUsed: 0 };
    let registryCheck = { ok: true, documents: 0, errors: 0 };
    let lastProcessingCheck = { ok: true, lastScan: null as string | null };

    if (profile) {
      const registry = getRegistry(dir, profile.budget.totalUsd);
      const state = registry.getState();
      const summary = registry.summary;

      const pctUsed = state.budget.totalUsd > 0
        ? Math.round((state.budget.spentUsd / state.budget.totalUsd) * 100)
        : 0;

      budgetCheck = {
        ok: !registry.budgetExhausted,
        remainingUsd: parseFloat(registry.budgetRemaining.toFixed(2)),
        percentUsed: pctUsed,
      };

      registryCheck = {
        ok: summary.errors === 0,
        documents: summary.total,
        errors: summary.errors,
      };

      lastProcessingCheck = {
        ok: true,
        lastScan: state.lastScan,
      };
    }

    // Daemon status
    let daemonCheck = { installed: false, running: false };
    try {
      const ds = getDaemonStatus();
      daemonCheck = { installed: ds.installed, running: ds.running };
    } catch { /* non-macOS */ }

    // Determine overall status
    const isUnhealthy =
      !profileCheck.ok ||
      !watchPathsCheck.ok ||
      !budgetCheck.ok;

    const isDegraded =
      (budgetCheck.percentUsed > 80 && budgetCheck.ok) ||
      registryCheck.errors > 0 ||
      !daemonCheck.running;

    const status = isUnhealthy ? 'unhealthy' : isDegraded ? 'degraded' : 'healthy';

    return reply.send({
      status,
      checks: {
        profile: profileCheck,
        watchPaths: watchPathsCheck,
        budget: budgetCheck,
        registry: registryCheck,
        lastProcessing: lastProcessingCheck,
        daemon: daemonCheck,
      },
      timestamp,
    });
  });

  // ── GET /api/claw/status ────────────────────────────────────────────
  fastify.get('/api/claw/status', async (_request, reply) => {
    const dir = config.claw.dir;
    const profile = loadProfile(dir);

    if (!profile) {
      return reply.status(404).send({
        error: 'No Clawern profile found',
        hint: 'Run `lavern claw init` to create a client profile.',
      });
    }

    const registry = getRegistry(dir, profile.budget.totalUsd);
    const state = registry.getState();
    const summary = registry.summary;

    // Daemon status (safe on non-macOS — returns not-installed)
    let daemon = { installed: false, running: false, label: 'com.lavern.claw', plistPath: '', logDir: '' };
    try {
      daemon = getDaemonStatus();
    } catch { /* non-macOS */ }

    return reply.send({
      profile: {
        company: profile.company,
        jurisdiction: profile.jurisdiction,
        industry: profile.industry,
        size: profile.size,
        concerns: profile.concerns,
        style: profile.preferences.style,
        intensity: profile.preferences.intensity,
        riskAppetite: profile.preferences.riskAppetite,
        createdAt: profile.createdAt,
      },
      ethicalMode: profile.ethicalMode ?? false,
      watchPaths: profile.watchPaths,
      budget: {
        totalUsd: state.budget.totalUsd,
        spentUsd: state.budget.spentUsd,
        remainingUsd: registry.budgetRemaining,
        exhausted: registry.budgetExhausted,
      },
      documents: summary,
      sessions: {
        completed: state.sessionsCompleted,
        failed: state.sessionsFailed,
      },
      lastScan: state.lastScan,
      daemon,
    });
  });

  // ── GET /api/claw/documents ─────────────────────────────────────────
  fastify.get('/api/claw/documents', async (_request, reply) => {
    const dir = config.claw.dir;
    const profile = loadProfile(dir);

    if (!profile) {
      return reply.status(404).send({ error: 'No profile found' });
    }

    const registry = getRegistry(dir, profile.budget.totalUsd);
    const state = registry.getState();

    // Transform to array sorted by lastModified desc
    const documents = Object.values(state.documents)
      .sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime())
      .map(doc => ({
        name: doc.name,
        path: doc.path,
        type: doc.type,
        status: doc.status,
        sizeBytes: doc.sizeBytes,
        firstSeen: doc.firstSeen,
        lastModified: doc.lastModified,
        lastReviewed: doc.lastReviewed ?? null,
        findings: doc.findingsSummary ?? null,
        costUsd: doc.costUsd ?? null,
        error: doc.error ?? null,
        confidential: doc.confidential ?? false,
      }));

    return reply.send({ documents, total: documents.length });
  });

  // ── GET /api/claw/deliveries ────────────────────────────────────────
  fastify.get('/api/claw/deliveries', async (_request, reply) => {
    const dir = config.claw.dir;
    const deliveryDir = path.join(dir, 'delivery');

    if (!fs.existsSync(deliveryDir)) {
      return reply.send({ deliveries: [], total: 0 });
    }

    const deliveries: object[] = [];

    try {
      const sessions = fs.readdirSync(deliveryDir, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => e.name);

      for (const sessionId of sessions) {
        const manifestPath = path.join(deliveryDir, sessionId, 'manifest.json');
        if (fs.existsSync(manifestPath)) {
          try {
            const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'));
            deliveries.push({
              sessionId,
              filename: manifest.input?.filename,
              type: manifest.input?.detectedType,
              workflow: manifest.task?.workflow,
              status: manifest.status,
              costUsd: manifest.execution?.totalCostUsd,
              durationSeconds: manifest.execution?.durationSeconds,
              findings: manifest.analysis,
              completedAt: manifest.execution?.completedAt,
            });
          } catch { /* skip malformed manifests */ }
        }
      }
    } catch { /* delivery dir unreadable */ }

    // Sort by completedAt desc
    deliveries.sort((a: any, b: any) =>
      new Date(b.completedAt ?? 0).getTime() - new Date(a.completedAt ?? 0).getTime()
    );

    return reply.send({ deliveries, total: deliveries.length });
  });

  // ── GET /api/claw/precedents ──────────────────────────────────────
  fastify.get('/api/claw/precedents', async (request, reply) => {
    const dir = config.claw.dir;
    const profile = loadProfile(dir);
    if (!profile) return reply.status(404).send({ error: 'No profile found' });

    const board = getPrecedentBoard(dir);
    const summary = board.summary;

    const query = request.query as {
      findingType?: string;
      jurisdiction?: string;
      documentType?: string;
      q?: string;
      limit?: string;
    };

    const parsedLimit = query.limit ? parseInt(query.limit, 10) : 20;
    const safeLimit = isNaN(parsedLimit) ? 20 : Math.max(1, Math.min(100, parsedLimit));

    const matches = board.search({
      findingType: query.findingType,
      jurisdiction: query.jurisdiction,
      documentType: query.documentType,
      textQuery: query.q,
      limit: safeLimit,
    });

    return reply.send({
      summary,
      precedents: matches.map(m => ({
        id: m.entry.id,
        patternName: m.entry.patternName,
        description: m.entry.description,
        documentType: m.entry.tags?.documentType ?? m.entry.documentType,
        jurisdiction: m.entry.tags?.jurisdiction ?? m.entry.jurisdiction,
        qualityScore: m.entry.qualityScore,
        effectivenessScore: m.entry.effectivenessScore,
        timesUsed: m.entry.timesUsed,
        timesQueried: m.entry.timesQueried,
        addedAt: m.entry.addedAt,
        deprecated: m.entry.deprecated,
        relevanceScore: m.relevanceScore,
        evidence: m.entry.beforeSnippet,
        lastOutcome: m.entry.outcomes[m.entry.outcomes.length - 1] ?? null,
      })),
      total: matches.length,
    });
  });

  // ── PATCH /api/claw/ethical ────────────────────────────────────────
  fastify.patch('/api/claw/ethical', {
    config: {
      rateLimit: {
        max: config.rateLimitSessionMax,
        timeWindow: config.rateLimitWindowMs,
      },
    },
  }, async (request, reply) => {
    const dir = config.claw.dir;
    const profile = loadProfile(dir);

    if (!profile) {
      return reply.status(404).send({ error: 'No profile found' });
    }

    const body = request.body as { enabled?: boolean } | null;
    if (!body || typeof body.enabled !== 'boolean') {
      return reply.status(400).send({ error: 'Body must include { enabled: boolean }' });
    }

    profile.ethicalMode = body.enabled;

    // When enabling, also set risk appetite to conservative
    if (body.enabled) {
      profile.preferences.riskAppetite = 'conservative';
    }

    const profilePath = path.join(dir, 'profile.json');
    writeJsonFileAtomic(profilePath, profile);

    return reply.send({ ethicalMode: body.enabled });
  });

  // ── POST /api/claw/scan ─────────────────────────────────────────────
  fastify.post('/api/claw/scan', {
    config: {
      rateLimit: {
        max: config.rateLimitSessionMax,
        timeWindow: config.rateLimitWindowMs,
      },
    },
  }, async (_request, reply) => {
    const dir = config.claw.dir;
    const profile = loadProfile(dir);

    if (!profile) {
      return reply.status(404).send({ error: 'No profile found' });
    }

    const registry = getRegistry(dir, profile.budget.totalUsd);
    const { newDocs, changedDocs } = registry.scan(profile.watchPaths);

    return reply.send({
      scanned: true,
      newDocuments: newDocs.length,
      changedDocuments: changedDocs.length,
      total: registry.totalDocuments,
      timestamp: new Date().toISOString(),
    });
  });

  // ── POST /api/claw/retry ──────────────────────────────────────────────
  fastify.post('/api/claw/retry', {
    config: {
      rateLimit: {
        max: config.rateLimitSessionMax,
        timeWindow: config.rateLimitWindowMs,
      },
    },
  }, async (request, reply) => {
    const dir = config.claw.dir;
    const profile = loadProfile(dir);

    if (!profile) {
      return reply.status(404).send({ error: 'No profile found' });
    }

    const registry = getRegistry(dir, profile.budget.totalUsd);
    const body = (request.body as { hash?: string; stale?: boolean } | null) ?? {};

    let retriedCount: number;
    if (body.stale) {
      retriedCount = registry.retryStale();
    } else {
      retriedCount = registry.retryFailed(body.hash);
    }

    return reply.send({
      retriedCount,
      type: body.stale ? 'stale' : 'failed',
      timestamp: new Date().toISOString(),
    });
  });
}
