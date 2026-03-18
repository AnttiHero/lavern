/**
 * Claw Mode API Routes — Remote monitoring & control.
 *
 * When the firm runs on a Mac Mini, these endpoints let you
 * check status, trigger scans, and browse deliveries from
 * your main machine or the dashboard.
 *
 * Endpoints:
 *   GET   /api/claw/status      — Profile + registry summary + budget + daemon
 *   GET   /api/claw/documents   — List all tracked documents with status
 *   GET   /api/claw/deliveries  — List completed delivery sessions
 *   PATCH /api/claw/ethical     — Toggle maximum ethical mode
 *   POST  /api/claw/scan        — Trigger an immediate rescan of watch paths
 */

import * as fs from 'node:fs';
import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { config } from '../../config.js';
import { loadProfile } from '../../claw/init.js';
import { DocumentRegistry } from '../../claw/registry.js';
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
}
