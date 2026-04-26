/**
 * Provider Types — LLM provider abstraction for EU-sovereign deployments.
 *
 * Lavern supports four LLM providers:
 * - `anthropic` — Claude via the Anthropic SDK + Agent SDK (default)
 * - `mistral` — Mistral AI via OpenAI-compatible API (EU-sovereign)
 * - `local` — On-device model via Ollama (zero-egress / privilege-protected)
 * - `managed` — Anthropic Managed Agents beta (durable server-hosted sessions).
 *   Scaffolded only; execution path is not wired yet. See
 *   `docs/managed-agents-migration.md` and `src/providers/managed-agents/`.
 *
 * Set `LAVERN_PROVIDER=<name>` to switch the default provider globally,
 * or pass `provider` per-session via the API.
 */

export type LLMProvider = 'anthropic' | 'mistral' | 'local' | 'managed';

export interface LocalConfig {
  /** Ollama HTTP API base URL. Default: http://localhost:11434 */
  baseUrl: string;
  /** Default Ollama model tag. e.g. "gemma4:26b", "qwen2.5:32b". */
  defaultModel: string;
  /** Optional smaller model for routing/quick decisions. */
  routerModel: string;
  /** Optional model for assembly. Same as defaultModel by default. */
  assemblyModel: string;
}

/**
 * Cost-tier → local model name mapping.
 *
 * For on-device deployments, all tiers typically point to the same
 * model (you only have one loaded at a time on a typical Mac). The
 * tier system is preserved so the same agent profiles work across
 * providers without modification.
 */
export const LOCAL_MODELS = {
  opus: 'gemma4:26b',
  sonnet: 'gemma4:26b',
  haiku: 'gemma4:e4b',
} as const;

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

/** Reverse map: resolve a Lavern tier model name to its provider-equivalent. */
export function resolveModel(modelName: string, provider: LLMProvider): string {
  if (provider === 'anthropic') return modelName;

  if (provider === 'local') {
    if (modelName.includes('opus')) return LOCAL_MODELS.opus;
    if (modelName.includes('sonnet')) return LOCAL_MODELS.sonnet;
    if (modelName.includes('haiku')) return LOCAL_MODELS.haiku;
    return LOCAL_MODELS.opus;
  }

  // Mistral mapping
  if (modelName.includes('opus')) return MISTRAL_MODELS.opus;
  if (modelName.includes('sonnet')) return MISTRAL_MODELS.sonnet;
  if (modelName.includes('haiku')) return MISTRAL_MODELS.haiku;
  return MISTRAL_MODELS.opus;
}
