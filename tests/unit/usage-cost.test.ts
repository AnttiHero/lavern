/**
 * L09: one usage→cost function, table-driven. Every Anthropic path must
 * return the same charge for the same normalised usage.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
const spies = vi.hoisted(() => ({ cloud: vi.fn() }));
vi.mock('@anthropic-ai/sdk', () => ({ default: class { messages = { create: spies.cloud }; } }));
vi.mock('../../src/utils/ensure-api-key.js', () => ({ ensureApiKey: () => 'k' }));
import { costForUsage, PRICING } from '../../src/utils/stream-messages.js';
import { crossProviderChat } from '../../src/providers/cross-provider-chat.js';
import { config } from '../../src/config.js';

const M = 1_000_000;
const opus = PRICING['claude-opus-5'];
const cases: Array<{ name: string; model: string; usage: Record<string, unknown>; expected: number }> = [
  { name: 'uncached only', model: 'claude-opus-5', usage: { input_tokens: 1000, output_tokens: 500 }, expected: (1000 * opus.input + 500 * opus.output) / M },
  { name: 'cache read only', model: 'claude-opus-5', usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 2000 }, expected: 2000 * opus.cacheRead / M },
  { name: 'cache write only (legacy aggregate = 5m rate)', model: 'claude-opus-5', usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 1000 }, expected: 1000 * opus.cacheWrite / M },
  { name: 'mixed buckets', model: 'claude-opus-5', usage: { input_tokens: 1000, output_tokens: 0, cache_read_input_tokens: 2000, cache_creation_input_tokens: 1000 }, expected: (1000 * opus.input + 2000 * opus.cacheRead + 1000 * opus.cacheWrite) / M },
  { name: '1h cache write costs 2x input', model: 'claude-opus-5', usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 1000, cache_creation: { ephemeral_5m_input_tokens: 400, ephemeral_1h_input_tokens: 600 } }, expected: (400 * opus.cacheWrite + 600 * opus.input * 2) / M },
  { name: 'dated model id falls back to its family', model: 'claude-sonnet-4-5-20250929', usage: { input_tokens: 1000, output_tokens: 0 }, expected: 1000 * PRICING['claude-sonnet-4-5'].input / M },
];

describe('costForUsage', () => {
  for (const c of cases) it(c.name, () => expect(costForUsage(c.model, c.usage as never)).toBeCloseTo(c.expected, 9));
  it('unknown usage is zero, unknown model uses the fallback policy (never negative)', () => {
    expect(costForUsage('claude-opus-5', undefined)).toBe(0);
    expect(costForUsage('some-future-model', { input_tokens: 1000, output_tokens: 1000 })).toBeGreaterThan(0);
  });
});

describe('crossProviderChat reports the same charge as costForUsage', () => {
  beforeEach(() => { vi.clearAllMocks(); config.provider = 'anthropic'; });
  it('cache reads and writes are billed, not subtracted (the review reported $0 here)', async () => {
    const usage = { input_tokens: 1000, output_tokens: 0, cache_read_input_tokens: 2000, cache_creation_input_tokens: 1000 };
    spies.cloud.mockResolvedValue({ content: [{ type: 'text', text: 'Synthetic' }], usage, stop_reason: 'end_turn' });
    const r = await crossProviderChat({ system: 'S', user: 'U', tier: 'opus', maxTokens: 100 });
    expect(r.cost).toBeCloseTo(costForUsage('claude-opus-5', usage), 9);
    expect(r.cost).toBeGreaterThan(0);
  });
});
