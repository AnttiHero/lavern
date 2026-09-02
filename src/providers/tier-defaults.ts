/**
 * Default Anthropic model per semantic tier. Constants only (no imports) so
 * both config.ts and the runtime accessor can share them without a cycle.
 * Override at runtime with SHEM_OPUS_MODEL / SHEM_SONNET_MODEL / SHEM_HAIKU_MODEL.
 */
export const DEFAULT_ANTHROPIC_TIER_MODELS = {
  opus: 'claude-opus-5',
  sonnet: 'claude-sonnet-5',
  haiku: 'claude-haiku-4-5',
  /** The most capable tier. Never dispatched to a subagent (the SDK only
   *  takes alias tiers); it enters via the Hivemind panel, Claw's frontier
   *  escalation, and the Challenge judge. */
  fable: 'claude-fable-5-1',
} as const;

export type AnthropicTierModels = { opus: string; sonnet: string; haiku: string; fable: string };
