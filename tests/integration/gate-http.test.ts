/**
 * L02 over HTTP: POST /api/sessions/:id/gate must name the gate it answers.
 * Adapted from the 5 Sep 2026 review probe, with the defective expectations
 * inverted into the contract.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { config } from '../../src/config.js';
import { SessionManager } from '../../src/session/session-manager.js';
import { AsyncGateResolver } from '../../src/gates/gate-resolver.js';
import { registerSessionRoutes } from '../../src/api/routes/sessions.js';
import { initDatabase } from '../../src/db/database.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lavern-gate-http-'));
const app = Fastify({ logger: false });
const manager = new SessionManager();
const gate = (details: string) => ({ gateType: 'final_delivery' as const, summary: 'Deliver?', details, proposedAction: 'deliver' });

beforeAll(async () => {
  config.auditDir = path.join(root, 'audit'); config.memoryDir = path.join(root, 'memory'); config.dbPath = ':memory:';
  initDatabase(':memory:'); registerSessionRoutes(app, manager); await app.ready();
});
afterAll(async () => { manager.stopCleanup(); await app.close(); });

describe('POST /api/sessions/:id/gate', () => {
  it('a delayed approval of version A cannot approve replacement version B', async () => {
    const resolver = new AsyncGateResolver(0);
    const s = manager.createSession({ gateResolver: resolver });
    const old = resolver.resolve(gate('Version A: cap EUR 1000'));
    const aId = resolver.getPendingGate()!.gateId!;
    const current = resolver.resolve(gate('Version B: unlimited liability'));
    const bId = resolver.getPendingGate()!.gateId!;
    expect((await old).decision).toBe('reject');

    // The dashboard reads the pending gate WITH its identity
    const status = await app.inject({ method: 'GET', url: `/api/sessions/${s.id}` });
    expect(status.json().pendingGate).toMatchObject({ gateId: bId, gateType: 'final_delivery' });

    // Delayed answer for A -> refused (409, tells the client which gate is current)
    const stale = await app.inject({ method: 'POST', url: `/api/sessions/${s.id}/gate`, payload: { decision: 'approve', gateType: 'final_delivery', gateId: aId, notes: 'Approving version A' } });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().currentGateId).toBe(bId);
    expect(resolver.hasPendingGate()).toBe(true);

    // No gateId at all -> 400
    const missing = await app.inject({ method: 'POST', url: `/api/sessions/${s.id}/gate`, payload: { decision: 'approve' } });
    expect(missing.statusCode).toBe(400);

    // Wrong type -> 409 (existing control)
    const wrongType = await app.inject({ method: 'POST', url: `/api/sessions/${s.id}/gate`, payload: { decision: 'approve', gateType: 'team_selection', gateId: bId } });
    expect(wrongType.statusCode).toBe(409);

    // The explicit decision on B -> 200, B resolves
    const ok = await app.inject({ method: 'POST', url: `/api/sessions/${s.id}/gate`, payload: { decision: 'reject', gateType: 'final_delivery', gateId: bId, notes: 'Unlimited liability is unacceptable' } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ success: true, gateId: bId, decision: 'reject' });
    expect((await current).decision).toBe('reject');

    // A retry / double-click of the same decision is idempotent, not an error
    const dup = await app.inject({ method: 'POST', url: `/api/sessions/${s.id}/gate`, payload: { decision: 'reject', gateId: bId } });
    expect(dup.statusCode).toBe(200);
    expect(dup.json()).toMatchObject({ idempotent: true, decision: 'reject', gateId: bId });
    // ...but a DIFFERENT decision for the already-decided gate is refused
    const flip = await app.inject({ method: 'POST', url: `/api/sessions/${s.id}/gate`, payload: { decision: 'approve', gateId: bId } });
    expect(flip.statusCode).toBe(409);
  });
});
