/**
 * Unit Tests — Stream Messages (src/utils/stream-messages.ts)
 *
 * Tests the PRICING table and cost estimation logic.
 * The streamMessages function itself is integration-tested.
 */

import { describe, it, expect } from 'vitest';
import { PRICING } from '../../src/utils/stream-messages.js';

describe('PRICING table', () => {
  it('has entries for all current Claude models', () => {
    expect(PRICING['claude-opus-4-7']).toBeDefined();
    expect(PRICING['claude-sonnet-4-5']).toBeDefined();
    expect(PRICING['claude-haiku-4-5']).toBeDefined();
  });

  it('has legacy entries for in-flight sessions + archived cost records', () => {
    expect(PRICING['claude-opus-4-6']).toBeDefined();
    expect(PRICING['claude-sonnet-4-5-20250929']).toBeDefined();
    expect(PRICING['claude-haiku-3-5-20250929']).toBeDefined();
  });

  it('has entries for Mistral models', () => {
    expect(PRICING['mistral-large-latest']).toBeDefined();
    expect(PRICING['mistral-medium-latest']).toBeDefined();
    expect(PRICING['mistral-small-latest']).toBeDefined();
  });

  it('has correct fields for each model', () => {
    for (const [model, prices] of Object.entries(PRICING)) {
      expect(prices.input).toBeGreaterThan(0);
      expect(prices.output).toBeGreaterThan(0);
      expect(typeof prices.cacheRead).toBe('number');
      expect(typeof prices.cacheWrite).toBe('number');
    }
  });

  it('Opus is more expensive than Sonnet', () => {
    const opus = PRICING['claude-opus-4-7'];
    const sonnet = PRICING['claude-sonnet-4-5'];
    expect(opus.input).toBeGreaterThan(sonnet.input);
    expect(opus.output).toBeGreaterThan(sonnet.output);
  });

  it('Sonnet is more expensive than Haiku', () => {
    const sonnet = PRICING['claude-sonnet-4-5'];
    const haiku = PRICING['claude-haiku-4-5'];
    expect(sonnet.input).toBeGreaterThan(haiku.input);
    expect(sonnet.output).toBeGreaterThan(haiku.output);
  });

  it('Mistral models have zero cache pricing', () => {
    for (const model of ['mistral-large-latest', 'mistral-medium-latest', 'mistral-small-latest']) {
      expect(PRICING[model].cacheRead).toBe(0);
      expect(PRICING[model].cacheWrite).toBe(0);
    }
  });

  it('all prices are per million tokens', () => {
    // Sanity check: Opus output is $25/M tokens (the whole 4.x/5 Opus line)
    expect(PRICING['claude-opus-5'].output).toBe(25.0);
    expect(PRICING['claude-opus-4-7'].output).toBe(25.0);
    // Sonnet input should be $3/M tokens
    expect(PRICING['claude-sonnet-4-5'].input).toBe(3.0);
  });
});

// ── Running-cost accumulation contract ──────────────────────────────────
// The pinned SDK bundle has no Claude 5 pricing and falls back to $3/$15, so
// its total_cost_usd under-bills Opus 5 work by ~40% and must never overwrite
// the usage-based estimate; and a second/retried query must ADD to the running
// total, not restart it at zero (observed live: $12.83 -> $7.60).
import { vi } from 'vitest';
vi.mock('../../src/hooks/audit-logger.js', () => ({ compileAuditTrail: () => ({ agentActivity: [], subagentActivities: [] }) }));
const { streamMessages } = await import('../../src/utils/stream-messages.js');

function fakeSession(startingCost: number) {
  const s = {
    id: 'shem-test', accumulatedCost: startingCost, budgetUsd: 40, finalOutput: '',
    findings: [], verificationResults: [], verificationPassResults: [], debateResolutions: [], challenges: [],
    hivemind: [], dissents: [], quorumChecks: [], team: [], agentTurns: [], auditEntries: [],
    workflow: { currentStep: 'delivered', completedSteps: [] },
    events: { emitEvent: () => {} },
    updateCost(cost: number) { s.accumulatedCost = cost; },
  };
  return s;
}
async function* stream(messages: unknown[]) { for (const m of messages) yield m; }
const assistant = (model: string, input_tokens: number, output_tokens: number) =>
  ({ type: 'assistant', message: { model, usage: { input_tokens, output_tokens }, content: [] } });

describe('streamMessages running cost', () => {
  const opusTurn = (1_000_000 * PRICING['claude-opus-5'].input + 1_000_000 * PRICING['claude-opus-5'].output) / 1_000_000; // 1M in + 1M out

  it('adds usage-based turn costs on top of the session baseline (no reset on a second query)', async () => {
    const s = fakeSession(5);
    await streamMessages(stream([assistant('claude-opus-5', 1_000_000, 1_000_000)]), { session: s as never, documentLabel: 'd', logLevel: 'info' });
    expect(s.accumulatedCost).toBeCloseTo(5 + opusTurn, 6);
  });

  it('keeps the usage-based estimate when the SDK result carries an under-priced total', async () => {
    const s = fakeSession(5);
    await streamMessages(stream([
      assistant('claude-opus-5', 1_000_000, 1_000_000),
      { type: 'result', subtype: 'success', total_cost_usd: 1.0, num_turns: 1 },
    ]), { session: s as never, documentLabel: 'd', logLevel: 'info', suppressSessionEnd: true });
    expect(s.accumulatedCost).toBeCloseTo(5 + opusTurn, 6); // not 1.0, not 5 + 1.0
  });

  it('falls back to the SDK total, ADDED to the baseline, only when no usage was seen', async () => {
    const s = fakeSession(5);
    await streamMessages(stream([{ type: 'result', subtype: 'success', total_cost_usd: 0.25, num_turns: 1 }]),
      { session: s as never, documentLabel: 'd', logLevel: 'info', suppressSessionEnd: true });
    expect(s.accumulatedCost).toBeCloseTo(5.25, 6);
  });
});
