/**
 * Provider Types — LLM provider abstraction for EU-sovereign deployments.
 *
 * Lavern supports three LLM providers:
 * - `anthropic` — Claude via the Anthropic SDK + Agent SDK (default)
 * - `mistral` — Mistral AI via OpenAI-compatible API (EU-sovereign)
 * - `managed` — Anthropic Managed Agents beta (durable server-hosted sessions).
 *   Scaffolded only; execution path is not wired yet. See
 *   `docs/managed-agents-migration.md` and `src/providers/managed-agents/`.
 *
 * Set `LAVERN_PROVIDER=<name>` to switch the default provider globally,
 * or pass `provider` per-session via the API.
 */

export type LLMProvider = 'anthropic' | 'mistral' | 'managed';

export interface MistralConfig {
  apiKey: string;
  baseUrl: string;
  defaultModel: string;
  routerModel: string;
  assemblyModel: string;
}

/**
 * Model mapping: Lavern cost tier → Mistral model.
 *
 * Mistral is weaker than Claude but the value proposition is
 * data sovereignty (EU-hosted, GDPR-native), not raw capability.
 */
export const MISTRAL_MODELS = {
  opus: 'mistral-large-latest',
  sonnet: 'mistral-medium-latest',
  haiku: 'mistral-small-latest',
} as const;

/** Reverse map: resolve a Lavern tier model name to its Mistral equivalent. */
export function resolveModel(modelName: string, provider: LLMProvider): string {
  if (provider === 'anthropic') return modelName;

  // Map Claude model names → Mistral equivalents
  if (modelName.includes('opus')) return MISTRAL_MODELS.opus;
  if (modelName.includes('sonnet')) return MISTRAL_MODELS.sonnet;
  if (modelName.includes('haiku')) return MISTRAL_MODELS.haiku;

  // Default to large for unknown models
  return MISTRAL_MODELS.opus;
}
