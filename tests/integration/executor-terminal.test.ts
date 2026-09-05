/**
 * L10: production executors + production stream handler; only the external
 * query and the assembler are mocked. A max-turn stop at intake must NEVER
 * assemble or ship as a delivered, tier-1 review.
 */
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const spies = vi.hoisted(() => ({ query: vi.fn(), assembly: vi.fn(), localChat: vi.fn(), localAssembly: vi.fn() }));
vi.mock('../../src/utils/retry-query.js', () => ({ retryQuery: spies.query }));
vi.mock('../../src/assembly/document-assembler.js', async (original) => ({ ...(await original<any>()), assembleDocument: spies.assembly }));
vi.mock('../../src/providers/local.js', () => ({ localChat: spies.localChat, checkLocalReady: async () => null }));
vi.mock('../../src/providers/local-assembler.js', () => ({ assembleLocalDocument: spies.localAssembly }));
import { config } from '../../src/config.js';
import { SessionState } from '../../src/session/session-state.js';
import { runGenericWorkflow } from '../../src/workflows/executor.js';
import { reviewTemplate } from '../../src/workflows/templates/review.js';
import { initDatabase } from '../../src/db/database.js';
import { streamMessages } from '../../src/utils/stream-messages.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lavern-terminal-'));
config.auditDir = path.join(root, 'audit'); config.memoryDir = path.join(root, 'memory'); config.claw.dir = path.join(root, 'claw');
initDatabase(':memory:');
const request = { type: 'general', requestText: 'Review this synthetic NDA.' } as any;
const classification = { requestType: 'contract_review', complexity: 'medium', riskLevel: 'medium', selectedWorkflow: 'review', selectedSpecialists: [], requiresDebate: false, requiresEthicsFirst: false, requiresConsistencyCheck: false, reasoning: 'synthetic' } as any;

describe('completion contract', () => {
  it('streamMessages reports how the query ended', async () => {
    const s = new SessionState(undefined, { auditDir: path.join(root, 'sdk-audit') });
    async function* maxTurns() { yield { type: 'result', subtype: 'error_max_turns', errors: ['Maximum turns reached'], total_cost_usd: 0.1, num_turns: 1 }; }
    expect((await streamMessages(maxTurns(), { session: s, documentLabel: 'x', logLevel: 'error', suppressSessionEnd: true })).outcome).toBe('interrupted');
    async function* ok() { yield { type: 'result', subtype: 'success', total_cost_usd: 0.1, num_turns: 3 }; }
    expect((await streamMessages(ok(), { session: s, documentLabel: 'x', logLevel: 'error', suppressSessionEnd: true })).outcome).toBe('completed');
    async function* cut() { /* stream ended with no result */ }
    expect((await streamMessages(cut(), { session: s, documentLabel: 'x', logLevel: 'error', suppressSessionEnd: true })).outcome).toBe('failed');
  });

  it('Anthropic executor: SDK max-turn failure at intake is an interruption — no assembly, no tier 1, no delivery', async () => {
    config.provider = 'anthropic';
    spies.query.mockImplementation(async function* () { yield { type: 'result', subtype: 'error_max_turns', errors: ['maximum turns'], num_turns: 1, total_cost_usd: 0.1 }; });
    spies.assembly.mockResolvedValue('# Synthetic deliverable');
    const s = new SessionState(); const events: any[] = []; s.events.on('event', ev => events.push(ev));
    await runGenericWorkflow(request, reviewTemplate, classification, s, { maxBudgetUsd: 5 });
    expect(spies.assembly).not.toHaveBeenCalled();
    expect(s.outcome).toBe('interrupted');
    expect(s.outputTier).toBe(4);
    expect(s.outputTierReason).toContain('No deliverable was assembled');
    expect(s.gateDecisions).toHaveLength(0);
    expect(s.genericWorkflow?.currentStep ?? 'intake').not.toBe('delivered');
    const end = events.find(ev => ev.type === 'session_end');
    expect(end?.outcome).toBe('interrupted');
  });

  it('local executor: a one-turn limit never marks an unfinished review delivered', async () => {
    config.provider = 'local';
    spies.localChat.mockResolvedValue({ message: { role: 'assistant', content: 'Reading the NDA', tool_calls: [{ id: 'tool1', type: 'function', function: { name: 'get_current_step', arguments: '{}' } }] }, cost: 0, usage: { prompt_tokens: 1, completion_tokens: 1 }, finishReason: 'tool_calls' });
    spies.localAssembly.mockResolvedValue('# Synthetic local deliverable');
    const s = new SessionState(); s.provider = 'local';
    await runGenericWorkflow(request, reviewTemplate, classification, s, { maxBudgetUsd: 5, maxTurns: 1, provider: 'local' });
    expect(spies.localAssembly).not.toHaveBeenCalled();
    expect(s.outcome).toBe('interrupted');
    expect(s.genericWorkflow!.currentStep).not.toBe('delivered');
    expect(s.workflow.currentStep).not.toBe('delivered');
    expect(s.gateDecisions).toHaveLength(0);
    config.provider = 'anthropic';
  });
});
