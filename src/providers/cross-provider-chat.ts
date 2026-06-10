/**
 * Cross-Provider Chat — single entry point that routes to the active LLM
 * provider based on `config.provider`.
 *
 * This is the helper that lets utility code (quality gate, briefing
 * enrichment, "Ask the Team" replies, derivatives, firm-analyzer, etc.)
 * stop hard-coding `new Anthropic()`. Same call shape for all three
 * providers; the helper handles routing, model selection, and pricing.
 *
 * Usage:
 *   const { text, cost } = await crossProviderChat({
 *     system: 'You are a quality gate…',
 *     user: 'Evaluate this document: …',
 *     tier: 'sonnet',          // semantic intent, mapped per provider
 *     maxTokens: 4096,
 *   });
 *
 * Provider routing:
 *   - 'anthropic' → Anthropic SDK with the cost-tier-mapped model
 *   - 'local'     → Ollama via OpenAI-compat (local.ts), all tiers map to
 *                   the local default model (one model per host)
 *   - 'mistral'   → Mistral API with tier-mapped model
 *   - 'minimax'   → MiniMax OpenAI-compatible API
 *   - 'kimi'      → Kimi/Moonshot OpenAI-compatible API
 *   - 'deepseek'  → DeepSeek OpenAI-compatible API
 *   - 'managed'   → falls through to anthropic for now (managed agents
 *                   beta uses the same key)
 */

import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import { ensureApiKey } from '../utils/ensure-api-key.js';
import { localChat, checkLocalReady } from './local.js';
import { PRICING as ANTHROPIC_PRICING } from '../utils/stream-messages.js';
import { LOCAL_PRICING } from './local.js';
import { MISTRAL_MODELS, isOpenAICompatibleProvider, type LLMProvider } from './types.js';
import { withRetry } from '../utils/with-retry.js';
import { getOpenAICompatibleSettings, openAICompatibleChat } from './openai-compatible.js';

// ── Tier → model resolution ─────────────────────────────────────────────

/**
 * Resolve a semantic cost tier to a concrete model name for the active
 * provider. Lavern uses three semantic tiers (opus/sonnet/haiku) so the
 * same business logic ("use a haiku-class model for the briefing analyzer")
 * works across providers without per-call model strings.
 */
function modelFor(tier: 'opus' | 'sonnet' | 'haiku'): string {
  switch (config.provider) {
    case 'local':
      // One model per host on local. All tiers point at the default model.
      return config.local.defaultModel;

    case 'mistral':
      return MISTRAL_MODELS[tier];

    case 'minimax':
    case 'kimi':
    case 'deepseek': {
      const settings = getOpenAICompatibleSettings(config.provider);
      switch (tier) {
        case 'haiku': return settings.routerModel;
        case 'sonnet': return settings.defaultModel;
        case 'opus': return settings.defaultModel;
      }
    }

    case 'managed':
    case 'anthropic':
    default:
      // Anthropic-tier mapping. Sonnet 4.5 covers sonnet+haiku in this build.
      switch (tier) {
        case 'opus':   return 'claude-opus-4-8';
        case 'sonnet': return 'claude-sonnet-4-5';
        case 'haiku':  return 'claude-sonnet-4-5'; // upgraded in v0.14.3
      }
  }
}

// ── Pricing ─────────────────────────────────────────────────────────────

function pricingFor(model: string): { input: number; output: number } {
  if (config.provider === 'local') return LOCAL_PRICING[model] ?? { input: 0, output: 0 };
  if (isOpenAICompatibleProvider(config.provider)) {
    const settings = getOpenAICompatibleSettings(config.provider);
    return settings.pricing[model] ?? settings.defaultPricing;
  }
  // Anthropic
  return ANTHROPIC_PRICING[model] ?? ANTHROPIC_PRICING['claude-sonnet-4-5'] ?? { input: 3, output: 15 };
}

// ── Public API ──────────────────────────────────────────────────────────

export interface CrossProviderChatOptions {
  /** System prompt. */
  system: string;
  /** Single user message. Mutually exclusive with `messages`. */
  user?: string;
  /**
   * Full conversation history (multi-turn). Mutually exclusive with `user`.
   * When provided, the user roles + assistant roles in the array are passed
   * to the model verbatim — useful for chat-style routes (briefing
   * interview, partner consult) that need to preserve turn structure.
   */
  messages?: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** Semantic cost tier. Resolves to a per-provider model. */
  tier: 'opus' | 'sonnet' | 'haiku';
  /** Max output tokens. */
  maxTokens: number;
  /** Optional temperature override. Default 0.2. */
  temperature?: number;
  /** Optional timeout override (ms). Default 120s for cloud, 240s for local. */
  timeoutMs?: number;
  /**
   * Optional override for the Anthropic retry count. Default 3 (via
   * withRetry), plus the SDK's own 2 internal retries. Pass 0 for
   * long-running calls where retrying a slow request multiplies the wait
   * instead of helping (e.g. /revise on a long document).
   * Ignored for local/mistral providers (no retry wrapper there).
   */
  maxRetries?: number;
}

export interface CrossProviderChatResult {
  /** Plain text output (concatenated text blocks). */
  text: string;
  /** USD cost (0 for local). */
  cost: number;
  /** Resolved model name. */
  model: string;
  /** Provider that handled the call. */
  provider: LLMProvider;
}

/**
 * Pre-flight sanity check for the active provider. Returns null if ready,
 * or an error message string if the caller should fall back / skip.
 *
 * Useful for routes that want to gracefully skip an LLM-augmented step
 * (e.g. quality gate) when the provider is unavailable, rather than
 * failing the whole request.
 */
export async function checkProviderReady(provider = config.provider): Promise<string | null> {
  if (provider === 'local') {
    return checkLocalReady(config.local.defaultModel);
  }
  if (provider === 'anthropic' || provider === 'managed') {
    const key = ensureApiKey();
    return key ? null : 'ANTHROPIC_API_KEY is not configured';
  }
  if (isOpenAICompatibleProvider(provider)) {
    const settings = getOpenAICompatibleSettings(provider);
    return settings.apiKey ? null : `${settings.apiKeyEnv} is not configured`;
  }
  return `Unknown provider: ${provider}`;
}

/**
 * Run a single chat completion against the active provider. Returns the
 * assistant's text output + cost.
 *
 * Throws on hard failure (network error, auth error, model not loaded
 * for local). For routes that want to skip on failure, call
 * `checkProviderReady()` first and short-circuit.
 */
export async function crossProviderChat(
  opts: CrossProviderChatOptions,
): Promise<CrossProviderChatResult> {
  const model = modelFor(opts.tier);
  const temperature = opts.temperature ?? 0.2;

  // Either `user` or `messages` must be provided — but not both.
  if (!opts.user && (!opts.messages || opts.messages.length === 0)) {
    throw new Error('crossProviderChat: must provide either `user` or a non-empty `messages` array');
  }
  if (opts.user && opts.messages) {
    throw new Error('crossProviderChat: pass `user` for single-turn or `messages` for multi-turn — not both');
  }
  const turnList: Array<{ role: 'user' | 'assistant'; content: string }> =
    opts.messages ?? [{ role: 'user', content: opts.user ?? '' }];

  // ── LOCAL ──
  if (config.provider === 'local') {
    const res = await localChat({
      model,
      messages: [
        { role: 'system', content: opts.system },
        ...turnList,
      ],
      temperature,
      maxTokens: opts.maxTokens,
      timeoutMs: opts.timeoutMs ?? 240_000,
    });
    const text = (res.message.content ?? '').toString();
    return { text, cost: res.cost, model, provider: 'local' };
  }

  // ── OPENAI-COMPATIBLE CLOUD PROVIDERS ──
  if (isOpenAICompatibleProvider(config.provider)) {
    const res = await openAICompatibleChat({
      provider: config.provider,
      model,
      messages: [
        { role: 'system', content: opts.system },
        ...turnList,
      ],
      temperature,
      maxTokens: opts.maxTokens,
      timeoutMs: opts.timeoutMs,
    });
    const text = (res.message.content ?? '').toString();
    return { text, cost: res.cost, model, provider: config.provider };
  }

  // ── ANTHROPIC / MANAGED ──
  // NOTE: Anthropic deprecated `temperature` for Opus 4.7 (April 2026) and the
  // deprecation carries forward to Opus 4.8 — the API returns
  // `invalid_request_error: 'temperature' is deprecated for this model`.
  // These models always run at the model's default sampling. Sonnet 4.5 still
  // accepts temperature, so we conditionally include it. Verified live against
  // the API on 2026-05-29 (opus-4-8 rejects temperature; sonnet-4-5 accepts).
  ensureApiKey();
  const client = new Anthropic();
  const omitTemperature = /opus-4-[78]/.test(model);
  const requestBody: Anthropic.MessageCreateParamsNonStreaming = {
    model,
    max_tokens: opts.maxTokens,
    system: opts.system,
    messages: turnList,
  };
  if (!omitTemperature) {
    requestBody.temperature = temperature;
  }
  // Audit fix H7: wrap the Anthropic call in withRetry so transient
  // 429/500/502/503/504/529 don't surface as a hard 500 to user-facing
  // routes (revise, conversation, quality gate, document assembler).
  // Callers can pass `maxRetries: 0` to opt out — appropriate when the
  // call is intrinsically slow and retrying won't recover (e.g. /revise
  // on a long document, where a single timeout is genuine, not transient).
  // Single retry layer. The SDK's own retry is disabled (maxRetries: 0) so the
  // withRetry wrapper owns the entire policy. Previously BOTH layers retried,
  // compounding to up to ~12 attempts on a stalled call. Callers pass
  // maxRetries: 0 to opt out entirely (e.g. intrinsically-slow /revise calls,
  // where a single timeout is genuine, not transient).
  const res = await withRetry(
    () => client.messages.create(requestBody, {
      timeout: opts.timeoutMs ?? 120_000,
      maxRetries: 0,
    }),
    { label: `anthropic:${model}`, maxRetries: opts.maxRetries ?? 3 },
  );

  let text = '';
  for (const block of res.content) {
    if (block.type === 'text') text += block.text;
  }
  text = text.trim();

  const pricing = pricingFor(model);
  const inputTokens = res.usage?.input_tokens ?? 0;
  const outputTokens = res.usage?.output_tokens ?? 0;
  const cacheRead = (res.usage as { cache_read_input_tokens?: number } | undefined)?.cache_read_input_tokens ?? 0;
  const regularInput = Math.max(0, inputTokens - cacheRead);
  const cost =
    (regularInput * pricing.input / 1_000_000) +
    (outputTokens * pricing.output / 1_000_000);

  return { text, cost, model, provider: config.provider };
}
