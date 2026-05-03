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
 *   - 'mistral'   → Mistral API (mistralChat) with tier-mapped model
 *   - 'managed'   → falls through to anthropic for now (managed agents
 *                   beta uses the same key)
 */

import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import { ensureApiKey } from '../utils/ensure-api-key.js';
import { localChat, checkLocalReady } from './local.js';
import { mistralChat } from './mistral.js';
import { PRICING as ANTHROPIC_PRICING } from '../utils/stream-messages.js';
import { LOCAL_PRICING } from './local.js';
import { MISTRAL_MODELS } from './types.js';
import { withRetry } from '../utils/with-retry.js';

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

    case 'managed':
    case 'anthropic':
    default:
      // Anthropic-tier mapping. Sonnet 4.5 covers sonnet+haiku in this build.
      switch (tier) {
        case 'opus':   return 'claude-opus-4-7';
        case 'sonnet': return 'claude-sonnet-4-5';
        case 'haiku':  return 'claude-sonnet-4-5'; // upgraded in v0.14.3
      }
  }
}

// ── Pricing ─────────────────────────────────────────────────────────────

function pricingFor(model: string): { input: number; output: number } {
  if (config.provider === 'local') return LOCAL_PRICING[model] ?? { input: 0, output: 0 };
  if (config.provider === 'mistral') return { input: 2, output: 6 }; // approximate, EU
  // Anthropic
  return ANTHROPIC_PRICING[model] ?? ANTHROPIC_PRICING['claude-sonnet-4-5'] ?? { input: 3, output: 15 };
}

// ── Public API ──────────────────────────────────────────────────────────

export interface CrossProviderChatOptions {
  /** System prompt. */
  system: string;
  /** User message. */
  user: string;
  /** Semantic cost tier. Resolves to a per-provider model. */
  tier: 'opus' | 'sonnet' | 'haiku';
  /** Max output tokens. */
  maxTokens: number;
  /** Optional temperature override. Default 0.2. */
  temperature?: number;
  /** Optional timeout override (ms). Default 120s for cloud, 240s for local. */
  timeoutMs?: number;
}

export interface CrossProviderChatResult {
  /** Plain text output (concatenated text blocks). */
  text: string;
  /** USD cost (0 for local). */
  cost: number;
  /** Resolved model name. */
  model: string;
  /** Provider that handled the call. */
  provider: 'anthropic' | 'mistral' | 'local' | 'managed';
}

/**
 * Pre-flight sanity check for the active provider. Returns null if ready,
 * or an error message string if the caller should fall back / skip.
 *
 * Useful for routes that want to gracefully skip an LLM-augmented step
 * (e.g. quality gate) when the provider is unavailable, rather than
 * failing the whole request.
 */
export async function checkProviderReady(): Promise<string | null> {
  if (config.provider === 'local') {
    return checkLocalReady(config.local.defaultModel);
  }
  if (config.provider === 'anthropic' || config.provider === 'managed') {
    const key = ensureApiKey();
    return key ? null : 'ANTHROPIC_API_KEY is not configured';
  }
  if (config.provider === 'mistral') {
    return config.mistral.apiKey ? null : 'MISTRAL_API_KEY is not configured';
  }
  return `Unknown provider: ${config.provider}`;
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

  // ── LOCAL ──
  if (config.provider === 'local') {
    const res = await localChat({
      model,
      messages: [
        { role: 'system', content: opts.system },
        { role: 'user', content: opts.user },
      ],
      temperature,
      maxTokens: opts.maxTokens,
      timeoutMs: opts.timeoutMs ?? 240_000,
    });
    const text = (res.message.content ?? '').toString();
    return { text, cost: res.cost, model, provider: 'local' };
  }

  // ── MISTRAL ──
  if (config.provider === 'mistral') {
    const res = await mistralChat({
      model,
      messages: [
        { role: 'system', content: opts.system },
        { role: 'user', content: opts.user },
      ],
      temperature,
      maxTokens: opts.maxTokens,
    });
    const text = (res.message.content ?? '').toString();
    const pricing = pricingFor(model);
    const cost =
      ((res.usage?.prompt_tokens ?? 0) * pricing.input / 1_000_000) +
      ((res.usage?.completion_tokens ?? 0) * pricing.output / 1_000_000);
    return { text, cost, model, provider: 'mistral' };
  }

  // ── ANTHROPIC / MANAGED ──
  // NOTE: Anthropic deprecated `temperature` for Opus 4.7 (April 2026 — the
  // API now returns `invalid_request_error: 'temperature' is deprecated for
  // this model`). Opus 4.7 always runs at the model's default sampling.
  // Sonnet 4.5 still accepts temperature, so we conditionally include it.
  ensureApiKey();
  const client = new Anthropic();
  const isOpus47 = /opus-4-7/.test(model);
  const requestBody: Anthropic.MessageCreateParamsNonStreaming = {
    model,
    max_tokens: opts.maxTokens,
    system: opts.system,
    messages: [{ role: 'user', content: opts.user }],
  };
  if (!isOpus47) {
    requestBody.temperature = temperature;
  }
  // Audit fix H7: wrap the Anthropic call in withRetry so transient
  // 429/500/502/503/504/529 don't surface as a hard 500 to user-facing
  // routes (revise, conversation, quality gate, document assembler).
  const res = await withRetry(
    () => client.messages.create(requestBody, { timeout: opts.timeoutMs ?? 120_000 }),
    { label: `anthropic:${model}` },
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
