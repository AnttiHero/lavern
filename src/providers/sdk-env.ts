/**
 * Claude Agent SDK subprocess environment — pins the subagent tier aliases.
 *
 * Subagent definitions can only name a tier alias ('opus' | 'sonnet' |
 * 'haiku' | 'inherit'); the SDK subprocess resolves those aliases itself, and
 * the pinned SDK release resolves them to ITS era's models (opus →
 * claude-opus-4-6, sonnet → claude-sonnet-4-5). The bundle honours
 * ANTHROPIC_DEFAULT_{OPUS,SONNET,HAIKU}_MODEL, so we inject Lavern's tier map
 * into every query() — the only way the specialists run on the same
 * generation as the orchestrator, and the only way the Hivemind ledger's
 * per-model attribution is true.
 *
 * `options.env` REPLACES the subprocess environment (the SDK defaults it to
 * process.env only when absent), so the base env is spread in. An operator's
 * own explicit ANTHROPIC_DEFAULT_* wins over the tier map.
 */

import type { query } from '@anthropic-ai/claude-agent-sdk';
import { anthropicTierModels } from './tier-models.js';

export const SDK_TIER_ENV = {
  opus: 'ANTHROPIC_DEFAULT_OPUS_MODEL',
  sonnet: 'ANTHROPIC_DEFAULT_SONNET_MODEL',
  haiku: 'ANTHROPIC_DEFAULT_HAIKU_MODEL',
} as const;

type Env = Record<string, string | undefined>;

/** Base env + tier pins. Explicit ANTHROPIC_DEFAULT_* already in `base` wins. */
export function sdkModelEnv(base: Env = process.env): Env {
  const tiers = anthropicTierModels();
  return {
    ...base,
    [SDK_TIER_ENV.opus]: base[SDK_TIER_ENV.opus] ?? tiers.opus,
    [SDK_TIER_ENV.sonnet]: base[SDK_TIER_ENV.sonnet] ?? tiers.sonnet,
    [SDK_TIER_ENV.haiku]: base[SDK_TIER_ENV.haiku] ?? tiers.haiku,
  };
}

type QueryArgs = Parameters<typeof query>[0];

/** Attach the tier-pinned env to query() args. Caller-provided env keys are kept. */
export function withSdkModelEnv(args: QueryArgs): QueryArgs {
  const env = sdkModelEnv({ ...process.env, ...(args.options?.env ?? {}) });
  return { ...args, options: { ...(args.options ?? {}), env } };
}
