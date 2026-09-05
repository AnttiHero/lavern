/**
 * L03: a session's provider is preserved through its whole lifecycle. With
 * the server default on Anthropic, a Mistral session's conversation must go
 * to Mistral and never carry the work product to the global provider; a
 * local session must never fall back to a cloud provider.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify from 'fastify';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const spies = vi.hoisted(() => ({ cloud: vi.fn(), local: vi.fn(), mistral: vi.fn() }));
vi.mock('@anthropic-ai/sdk', () => ({ default: class { messages = { create: spies.cloud }; } }));
vi.mock('../../src/utils/ensure-api-key.js', () => ({ ensureApiKey: () => 'synthetic-key' }));
vi.mock('../../src/providers/local.js', () => ({ localChat: spies.local, checkLocalReady: async () => null }));
vi.mock('../../src/providers/mistral.js', async (original) => ({ ...(await original<any>()), mistralChat: spies.mistral }));
import { config } from '../../src/config.js';
import { SessionManager } from '../../src/session/session-manager.js';
import { registerSessionRoutes } from '../../src/api/routes/sessions.js';
import { initDatabase } from '../../src/db/database.js';
import { executionContextFor } from '../../src/providers/execution-context.js';
import { hydrateSessionFromArchive } from '../../src/session/hydrate-from-archive.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lavern-provider-ctx-'));
const app = Fastify({ logger: false });
const manager = new SessionManager();
const reply = (text: string) => ({ message: { role: 'assistant', content: text }, cost: 0.001, usage: { prompt_tokens: 10, completion_tokens: 5 } });
const PRIVATE = 'SYNTHETIC-EU-PRIVATE-CONTENT';

beforeAll(async () => {
  config.auditDir = path.join(root, 'audit'); config.memoryDir = path.join(root, 'memory'); config.dbPath = ':memory:';
  initDatabase(':memory:'); registerSessionRoutes(app, manager); await app.ready();
});
afterAll(async () => { manager.stopCleanup(); await app.close(); });
beforeEach(() => {
  vi.clearAllMocks(); config.provider = 'anthropic';
  spies.cloud.mockResolvedValue({ content: [{ type: 'text', text: 'cloud answer' }], usage: { input_tokens: 10, output_tokens: 5 }, stop_reason: 'end_turn' });
  spies.mistral.mockResolvedValue(reply('mistral answer'));
  spies.local.mockResolvedValue(reply('local answer'));
});

describe('session conversation honours the session provider', () => {
  it('global Anthropic + session Mistral -> Mistral only, work product never reaches Anthropic', async () => {
    const s = manager.createSession(); s.provider = 'mistral';
    s.assembledDocument = `# Confidential EU-only contract\n${PRIVATE}`;
    const res = await app.inject({ method: 'POST', url: `/api/sessions/${s.id}/conversation`, payload: { message: 'Explain my terms' } });
    expect(res.statusCode).toBe(200);
    expect(spies.mistral).toHaveBeenCalledOnce();
    expect(spies.cloud).not.toHaveBeenCalled();
    const sent = JSON.stringify(spies.mistral.mock.calls[0][0]);
    expect(sent).toContain(PRIVATE);
  });

  it('global Mistral + session Anthropic -> Anthropic only', async () => {
    config.provider = 'mistral';
    const s = manager.createSession(); s.provider = 'anthropic';
    s.assembledDocument = '# US contract';
    const res = await app.inject({ method: 'POST', url: `/api/sessions/${s.id}/conversation`, payload: { message: 'Explain' } });
    expect(res.statusCode, res.body).toBe(200);
    expect(spies.cloud).toHaveBeenCalledOnce();
    expect(spies.mistral).not.toHaveBeenCalled();
  });

  it('a local (zero-egress) session never falls back to a cloud provider when local fails', async () => {
    spies.local.mockRejectedValue(new Error('Ollama not reachable'));
    const s = manager.createSession(); (s as unknown as { provider: string }).provider = 'local';
    s.assembledDocument = '# Privileged';
    const res = await app.inject({ method: 'POST', url: `/api/sessions/${s.id}/conversation`, payload: { message: 'Explain' } });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(spies.cloud).not.toHaveBeenCalled();
    expect(spies.mistral).not.toHaveBeenCalled();
  });

  it('concurrent sessions on different providers do not interfere', async () => {
    const a = manager.createSession(); a.provider = 'mistral'; a.assembledDocument = '# A';
    const b = manager.createSession(); b.provider = 'anthropic'; b.assembledDocument = '# B';
    const [ra, rb] = await Promise.all([
      app.inject({ method: 'POST', url: `/api/sessions/${a.id}/conversation`, payload: { message: 'q' } }),
      app.inject({ method: 'POST', url: `/api/sessions/${b.id}/conversation`, payload: { message: 'q' } }),
    ]);
    expect(ra.statusCode, ra.body).toBe(200); expect(rb.statusCode, rb.body).toBe(200);
    expect(spies.mistral).toHaveBeenCalledTimes(1);
    expect(spies.cloud).toHaveBeenCalledTimes(1);
  });
});

describe('execution context', () => {
  it('derives egress from the provider and is immutable', () => {
    const ctx = executionContextFor({ id: 'x', provider: 'local' });
    expect(ctx).toEqual({ sessionId: 'x', provider: 'local', egress: 'none' });
    expect(Object.isFrozen(ctx)).toBe(true);
    expect(executionContextFor({ id: 'y', provider: 'mistral' }).egress).toBe('eu');
    expect(executionContextFor({ id: 'z' }).provider).toBe(config.provider);
  });

  it('an archive-hydrated session keeps the provider it ran on', () => {
    const hydrated = hydrateSessionFromArchive({
      session_id: 'shem-archived-1', user_id: null, workflow_template_id: 'review', cost_usd: 1, budget_usd: 5,
      final_output: '', assembled_document: '', team_roles: '[]', summary_json: JSON.stringify({ provider: 'mistral' }),
      created_at: new Date().toISOString(), completed_at: new Date().toISOString(),
    } as never);
    expect(hydrated.provider).toBe('mistral');
    expect(executionContextFor(hydrated).provider).toBe('mistral');
  });
});
