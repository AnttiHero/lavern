/**
 * Unit Tests — SDK subprocess tier pins (src/providers/sdk-env.ts) and the
 * single-source-of-truth tier map. The Agent SDK resolves subagent aliases
 * itself; these pins are what keep specialists on Lavern's models and the
 * Hivemind ledger attribution truthful.
 */

import { describe, it, expect } from 'vitest';
import { sdkModelEnv, withSdkModelEnv, SDK_TIER_ENV } from '../../src/providers/sdk-env.js';
import { config } from '../../src/config.js';
import { DEFAULT_MODEL_POOL, labelForModel } from '../../src/orchestration/model-priors.js';
import { defaultPanel } from '../../src/orchestration/dissent.js';
import { PRICING } from '../../src/utils/stream-messages.js';

describe('sdkModelEnv', () => {
  it('pins all three tier aliases from config when the base env has none', () => {
    const env = sdkModelEnv({ PATH: '/bin' });
    expect(env[SDK_TIER_ENV.opus]).toBe(config.anthropicTierModels.opus);
    expect(env[SDK_TIER_ENV.sonnet]).toBe(config.anthropicTierModels.sonnet);
    expect(env[SDK_TIER_ENV.haiku]).toBe(config.anthropicTierModels.haiku);
    expect(env.PATH).toBe('/bin'); // base env preserved (options.env REPLACES the subprocess env)
  });

  it("keeps an operator's explicit ANTHROPIC_DEFAULT_* over the tier map", () => {
    const env = sdkModelEnv({ [SDK_TIER_ENV.opus]: 'claude-opus-4-8' });
    expect(env[SDK_TIER_ENV.opus]).toBe('claude-opus-4-8');
    expect(env[SDK_TIER_ENV.sonnet]).toBe(config.anthropicTierModels.sonnet);
  });

  it('withSdkModelEnv attaches env to query args without dropping other options', () => {
    const args = withSdkModelEnv({ prompt: 'x', options: { maxTurns: 3, env: { CUSTOM: '1' } } });
    expect(args.options?.maxTurns).toBe(3);
    expect(args.options?.env?.CUSTOM).toBe('1');
    expect(args.options?.env?.[SDK_TIER_ENV.sonnet]).toBe(config.anthropicTierModels.sonnet);
  });
});

describe('tier map is the single source of truth', () => {
  it('Hivemind pool anthropic ids equal the tier map (ledger attribution is truthful)', () => {
    const byTier = Object.fromEntries(DEFAULT_MODEL_POOL.filter(m => m.provider === 'anthropic').map(m => [m.tier, m.id]));
    expect(byTier.opus).toBe(config.anthropicTierModels.opus);
    expect(byTier.sonnet).toBe(config.anthropicTierModels.sonnet);
    expect(byTier.haiku).toBe(config.anthropicTierModels.haiku);
  });

  it('default anthropic panel seats the tier-map models', () => {
    const ids = defaultPanel('anthropic').map(m => m.model);
    expect(ids).toEqual([config.anthropicTierModels.opus, config.anthropicTierModels.sonnet]);
  });

  it('labels derive from ids', () => {
    expect(labelForModel('claude-opus-5')).toBe('Opus 5');
    expect(labelForModel('claude-haiku-4-5')).toBe('Haiku 4.5');
    expect(labelForModel('claude-sonnet-4-5-20250929')).toBe('Sonnet 4.5');
    expect(labelForModel('claude-fable-5-1')).toBe('Fable 5.1');
  });
});

describe('pricing', () => {
  it('Sonnet 5 is priced at the now-standard $2/$10', () => {
    expect(PRICING['claude-sonnet-5']).toMatchObject({ input: 2.0, output: 10.0, cacheRead: 0.2, cacheWrite: 2.5 });
  });
  it('Fable 5.1 is priced $10/$50 with the 0.025x cache read', () => {
    expect(PRICING['claude-fable-5-1']).toMatchObject({ input: 10.0, output: 50.0, cacheRead: 0.25, cacheWrite: 12.5 });
  });
});

describe('crossProviderChat thinking control', () => {
  it('assembler long-form calls request thinking off (budget goes to output)', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('src/assembly/document-assembler.ts', 'utf8');
    const longCalls = src.match(/maxTokens: 16_?384,[\s\S]{0,400}?thinking: 'off'/g) ?? [];
    expect(longCalls.length).toBeGreaterThanOrEqual(2);
  });
});
