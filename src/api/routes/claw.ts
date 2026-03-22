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
 *   PATCH /api/claw/pause       — Pause document processing
 *   PATCH /api/claw/resume      — Resume processing + trigger rescan
 *   GET   /api/claw/events      — WebSocket event stream (real-time push)
 */

import * as fs from 'node:fs';
import { readFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { WebSocket } from '@fastify/websocket';
import { config } from '../../config.js';
import { loadProfile } from '../../claw/init.js';
import { DocumentRegistry } from '../../claw/registry.js';
import { getPrecedentBoard } from '../../claw/precedent-board.js';
import { clawEventBus } from '../../claw/events.js';
import { eventTimestamp } from '../../events/event-bus.js';
import type { ShemEvent } from '../../events/event-bus.js';
import { getDaemonStatus } from '../../claw/daemon-factory.js';
import { forecastWork } from '../../claw/planner.js';
import { audit, readAuditLog } from '../../claw/audit.js';
import { writeJsonFileAtomic } from '../../utils/fs-helpers.js';

// ── Claw WebSocket helpers ──────────────────────────────────────────────

function safeSendClaw(socket: WebSocket, data: unknown): void {
  try {
    if (socket.readyState === 1) {
      socket.send(JSON.stringify(data));
    }
  } catch { /* ignore send errors */ }
}

function attachClawStream(socket: WebSocket, fromIndex = 0): void {
  // Set up cleanup first to prevent listener leaks on early disconnect
  let cleaned = false;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let lastIndex = clawEventBus.getEventCount();

  const onEvent = (event: ShemEvent) => {
    lastIndex++;
    safeSendClaw(socket, { type: 'live', event, index: lastIndex });
  };

  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    if (heartbeat) clearInterval(heartbeat);
    clawEventBus.off('event', onEvent);
  };

  socket.on('close', cleanup);
  socket.on('error', cleanup);

  // Check socket is still open after attaching cleanup
  if (socket.readyState !== 1) { cleanup(); return; }

  safeSendClaw(socket, {
    type: 'connected',
    source: 'claw',
    eventCount: clawEventBus.getEventCount(),
    replayFrom: fromIndex,
    timestamp: new Date().toISOString(),
  });

  // Replay missed events
  if (fromIndex < clawEventBus.getEventCount()) {
    const missed = clawEventBus.getEventsSince(fromIndex);
    for (const event of missed) {
      safeSendClaw(socket, { type: 'replay', event });
    }
    safeSendClaw(socket, { type: 'replay_complete', count: missed.length });
  }

  // Subscribe to live events
  clawEventBus.on('event', onEvent);

  // Heartbeat (30s ping)
  heartbeat = setInterval(() => {
    if (socket.readyState !== 1) { cleanup(); return; }
    try { socket.ping(); } catch { cleanup(); }
  }, 30_000);

  // Client messages
  socket.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'ping') {
        safeSendClaw(socket, { type: 'pong', timestamp: new Date().toISOString() });
      }
    } catch { /* ignore */ }
  });
}

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
      const ds = await getDaemonStatus();
      daemonCheck = { installed: ds.installed, running: ds.running };
    } catch { /* unsupported platform */ }

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
      daemon = await getDaemonStatus();
    } catch { /* unsupported platform */ }

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
      paused: profile.paused ?? false,
      pausedAt: profile.pausedAt ?? null,
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
      forecast: forecastWork(
        registry,
        profile.preferences.intensity,
        profile.budget.perDocumentMaxUsd,
        profile.ethicalMode ?? false,
        profile.sensitivityPatterns ?? [],
      ),
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
        hash: doc.hash,
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
              diff: manifest.diff ?? null,
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
    audit('scan_triggered', 'api', { newDocs: newDocs.length, changedDocs: changedDocs.length });

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

  // ── PATCH /api/claw/pause ──────────────────────────────────────────
  fastify.patch('/api/claw/pause', {
    config: {
      rateLimit: {
        max: config.rateLimitSessionMax,
        timeWindow: config.rateLimitWindowMs,
      },
    },
  }, async (_request, reply) => {
    const dir = config.claw.dir;
    const profile = loadProfile(dir);
    if (!profile) return reply.status(404).send({ error: 'No profile found' });

    if (profile.paused) {
      return reply.send({ paused: true, pausedAt: profile.pausedAt, alreadyPaused: true });
    }

    const pausedAt = new Date().toISOString();
    profile.paused = true;
    profile.pausedAt = pausedAt;

    const profilePath = path.join(dir, 'profile.json');
    writeJsonFileAtomic(profilePath, profile);

    clawEventBus.emitEvent({ type: 'claw_paused', pausedAt, timestamp: eventTimestamp() });
    audit('pause', 'api');

    return reply.send({ paused: true, pausedAt });
  });

  // ── PATCH /api/claw/resume ─────────────────────────────────────────
  fastify.patch('/api/claw/resume', {
    config: {
      rateLimit: {
        max: config.rateLimitSessionMax,
        timeWindow: config.rateLimitWindowMs,
      },
    },
  }, async (_request, reply) => {
    const dir = config.claw.dir;
    const profile = loadProfile(dir);
    if (!profile) return reply.status(404).send({ error: 'No profile found' });

    if (!profile.paused) {
      return reply.send({ paused: false, alreadyResumed: true });
    }

    profile.paused = false;
    profile.pausedAt = undefined;

    const profilePath = path.join(dir, 'profile.json');
    writeJsonFileAtomic(profilePath, profile);

    // Trigger rescan to catch changes accumulated during pause
    let pendingDocuments = 0;
    try {
      const registry = getRegistry(dir, profile.budget.totalUsd);
      const { newDocs, changedDocs } = registry.scan(profile.watchPaths);
      pendingDocuments = newDocs.length + changedDocs.length;
    } catch { /* scan failure non-fatal on resume */ }

    clawEventBus.emitEvent({ type: 'claw_resumed', resumedAt: new Date().toISOString(), pendingRescan: pendingDocuments > 0, timestamp: eventTimestamp() });
    audit('resume', 'api', { pendingDocuments });

    return reply.send({
      paused: false,
      resumedAt: new Date().toISOString(),
      pendingDocuments,
    });
  });

  // ── GET /api/claw/events (WebSocket) ───────────────────────────────
  fastify.get('/api/claw/events', { websocket: true }, (socket, request) => {
    const query = request.query as { from?: string };
    const parsed = query.from ? parseInt(query.from, 10) : 0;
    const fromIndex = Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;

    attachClawStream(socket, fromIndex);
  });

  // ── GET /api/claw/clients ──────────────────────────────────────────
  fastify.get('/api/claw/clients', async (_request, reply) => {
    const { getClientRegistry } = await import('../../claw/client-registry.js');
    const registry = getClientRegistry();
    const clients = registry.listClients(false);
    return reply.send({
      clients: clients.map(c => ({
        id: c.id,
        name: c.name,
        active: c.active,
        createdAt: c.createdAt,
      })),
      summary: registry.summary,
    });
  });

  // ── POST /api/claw/clients ─────────────────────────────────────────
  fastify.post('/api/claw/clients', {
    config: {
      rateLimit: {
        max: config.rateLimitSessionMax,
        timeWindow: config.rateLimitWindowMs,
      },
    },
  }, async (request, reply) => {
    const body = request.body as { name?: string; jurisdiction?: string; industry?: string } | null;
    if (!body?.name) {
      return reply.status(400).send({ error: 'Body must include { name: string }' });
    }

    const { getClientRegistry } = await import('../../claw/client-registry.js');
    const registry = getClientRegistry();

    try {
      const profile = {
        company: body.name,
        jurisdiction: body.jurisdiction ?? 'Delaware, USA',
        industry: body.industry ?? 'Technology',
        size: 'Unknown',
        concerns: [],
        preferences: { style: 'plain-language' as const, intensity: 'standard' as const, riskAppetite: 'balanced' as const },
        watchPaths: [],
        budget: { totalUsd: 50, perDocumentMaxUsd: 10 },
        createdAt: new Date().toISOString(),
      };

      const client = registry.addClient(body.name, profile);
      return reply.status(201).send({ client: { id: client.id, name: client.name, dir: client.dir } });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(409).send({ error: msg });
    }
  });

  // ── GET /api/claw/portfolio ──────────────────────────────────────────
  fastify.get('/api/claw/portfolio', async (_request, reply) => {
    const dir = config.claw.dir;
    const profile = loadProfile(dir);
    if (!profile) return reply.status(404).send({ error: 'No profile found' });

    const registry = getRegistry(dir, profile.budget.totalUsd);
    const state = registry.getState();
    const docs = Object.values(state.documents);

    // Aggregate findings across all documents
    let totalCritical = 0, totalMajor = 0, totalMinor = 0;
    const typeCounts = new Map<string, number>();
    const criticalDocs: Array<{ name: string; critical: number }> = [];

    for (const doc of docs) {
      if (doc.findingsSummary) {
        totalCritical += doc.findingsSummary.critical;
        totalMajor += doc.findingsSummary.major;
        totalMinor += doc.findingsSummary.minor;

        if (doc.findingsSummary.critical > 0) {
          criticalDocs.push({ name: doc.name, critical: doc.findingsSummary.critical });
        }
      }
      typeCounts.set(doc.type, (typeCounts.get(doc.type) ?? 0) + 1);
    }

    // Top document types
    const topTypes = [...typeCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([type, count]) => ({ type, count }));

    // Top critical documents
    criticalDocs.sort((a, b) => b.critical - a.critical);

    // Precedent patterns
    let topPatterns: string[] = [];
    try {
      topPatterns = getPrecedentBoard(dir).summary.topPatterns;
    } catch { /* non-fatal */ }

    return reply.send({
      portfolio: {
        totalDocuments: docs.length,
        findings: { critical: totalCritical, major: totalMajor, minor: totalMinor, total: totalCritical + totalMajor + totalMinor },
        topDocumentTypes: topTypes,
        criticalDocuments: criticalDocs.slice(0, 5),
        topPatterns,
        budgetUtilization: state.budget.totalUsd > 0 ? Math.round((state.budget.spentUsd / state.budget.totalUsd) * 100) : 0,
      },
    });
  });

  // ── GET /api/claw/audit ────────────────────────────────────────────
  fastify.get('/api/claw/audit', async (request, reply) => {
    const query = request.query as { limit?: string };
    const limit = Math.min(500, Math.max(1, parseInt(query.limit ?? '100', 10) || 100));
    const entries = readAuditLog(limit);
    return reply.send({ entries, total: entries.length });
  });

  // ── GET /api/claw/metrics ──────────────────────────────────────────
  fastify.get('/api/claw/metrics', async (_request, reply) => {
    const dir = config.claw.dir;
    const profile = loadProfile(dir);
    if (!profile) return reply.status(404).send('# No profile\n');

    const registry = getRegistry(dir, profile.budget.totalUsd);
    const state = registry.getState();
    const summary = registry.summary;

    let precActive = 0;
    try { precActive = getPrecedentBoard(dir).summary.active; } catch { /* non-fatal */ }

    const lines = [
      '# HELP claw_documents_total Total tracked documents',
      '# TYPE claw_documents_total gauge',
      `claw_documents_total ${summary.total}`,
      '',
      '# HELP claw_documents_reviewed Documents successfully reviewed',
      '# TYPE claw_documents_reviewed gauge',
      `claw_documents_reviewed ${summary.reviewed}`,
      '',
      '# HELP claw_documents_flagged Documents with critical findings',
      '# TYPE claw_documents_flagged gauge',
      `claw_documents_flagged ${summary.flagged}`,
      '',
      '# HELP claw_documents_errors Documents that failed processing',
      '# TYPE claw_documents_errors gauge',
      `claw_documents_errors ${summary.errors}`,
      '',
      '# HELP claw_documents_pending Documents awaiting processing',
      '# TYPE claw_documents_pending gauge',
      `claw_documents_pending ${summary.pending}`,
      '',
      '# HELP claw_budget_spent_usd Budget spent in USD',
      '# TYPE claw_budget_spent_usd gauge',
      `claw_budget_spent_usd ${state.budget.spentUsd}`,
      '',
      '# HELP claw_budget_total_usd Total budget in USD',
      '# TYPE claw_budget_total_usd gauge',
      `claw_budget_total_usd ${state.budget.totalUsd}`,
      '',
      '# HELP claw_sessions_completed Total successful sessions',
      '# TYPE claw_sessions_completed counter',
      `claw_sessions_completed ${state.sessionsCompleted}`,
      '',
      '# HELP claw_sessions_failed Total failed sessions',
      '# TYPE claw_sessions_failed counter',
      `claw_sessions_failed ${state.sessionsFailed}`,
      '',
      '# HELP claw_precedents_active Active precedent patterns',
      '# TYPE claw_precedents_active gauge',
      `claw_precedents_active ${precActive}`,
      '',
    ];

    reply.header('content-type', 'text/plain; version=0.0.4; charset=utf-8');
    return reply.send(lines.join('\n'));
  });
}
