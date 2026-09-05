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
import { anthropicTierModels } from './tier-models.js';
import { createLogger } from '../utils/logger.js';
import { costForUsage, type UsageLike } from '../utils/stream-messages.js';

const logger = createLogger('CROSS-PROVIDER');

// ── Tier → model resolution ─────────────────────────────────────────────

/**
 * Resolve a semantic cost tier to a concrete model name for the active
 * provider. Lavern uses three semantic tiers (opus/sonnet/haiku) so the
 * same business logic ("use a haiku-class model for the briefing analyzer")
 * works across providers without per-call model strings.
 */
export type LLMProviderId = 'anthropic' | 'mistral' | 'local' | 'managed';

function modelFor(tier: 'opus' | 'sonnet' | 'haiku' | 'fable', provider: LLMProviderId = config.provider): string {
  switch (provider) {
    case 'local':
      // One model per host on local. All tiers point at the default model.
      return config.local.defaultModel;

    case 'mistral':
      return MISTRAL_MODELS[tier];

    case 'managed':
    case 'anthropic':
    default:
      // Anthropic-tier mapping from config (single source of truth, shared
      // with the SDK subprocess pins). Direct-call haiku work deliberately
      // runs on the sonnet model: cheap enough, and far stronger.
      switch (tier) {
        case 'fable':  return anthropicTierModels().fable;
        case 'opus':   return anthropicTierModels().opus;
        case 'sonnet': return anthropicTierModels().sonnet;
        case 'haiku':  return anthropicTierModels().sonnet;
      }
  }
}

// ── Pricing ─────────────────────────────────────────────────────────────

function pricingFor(model: string, provider: LLMProviderId = config.provider): { input: number; output: number } {
  if (provider === 'local') return LOCAL_PRICING[model] ?? { input: 0, output: 0 };
  if (provider === 'mistral') return { input: 2, output: 6 }; // approximate, EU
  // Anthropic
  return ANTHROPIC_PRICING[model] ?? ANTHROPIC_PRICING['claude-sonnet-5'] ?? { input: 2, output: 10 };
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
  tier: 'opus' | 'sonnet' | 'haiku' | 'fable';
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
  /**
   * 'off' disables extended thinking on models where it is adaptive by
   * default (Opus 5 / Sonnet 5 / Haiku 5). Thinking counts against
   * max_tokens, so long-form generation (document assembly, memo cleanup)
   * must switch it off or the output truncates mid-sentence — observed live
   * on a 61-finding review: attempt 1 rejected as truncated, 3 min retry.
   * Ignored on the fable tier, which cannot disable thinking (400).
   */
  thinking?: 'auto' | 'off';
  /**
   * The provider this call MUST use. Session-scoped callers (conversation,
   * revision, derivatives, assembly) pass the session's provider so a
   * Mistral / local engagement never leaks its context to the globally
   * configured provider. Defaults to config.provider for non-session work.
   * There is no fallback across providers: if the named provider cannot
   * serve the call, it throws.
   */
  provider?: LLMProviderId;
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
export async function checkProviderReady(provider: LLMProviderId = config.provider): Promise<string | null> {
  if (provider === 'local') {
    return checkLocalReady(config.local.defaultModel);
  }
  if (provider === 'anthropic' || provider === 'managed') {
    const key = ensureApiKey();
    return key ? null : 'ANTHROPIC_API_KEY is not configured';
  }
  if (provider === 'mistral') {
    return config.mistral.apiKey ? null : 'MISTRAL_API_KEY is not configured';
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
  const provider: LLMProviderId = opts.provider ?? config.provider;
  const model = modelFor(opts.tier, provider);
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
  if (provider === 'local') {
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

  // ── MISTRAL ──
  if (provider === 'mistral') {
    const res = await mistralChat({
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
    // mistralChat already computes per-model cost from its own pricing table.
    // Re-deriving it here applied a flat $2/$6 rate to every model, mispricing
    // medium/small. Trust the value the client already calculated.
    return { text, cost: res.cost, model, provider: 'mistral' };
  }

  // ── ANTHROPIC / MANAGED ──
  // NOTE: Anthropic deprecated `temperature` starting with Opus 4.7, and it
  // carries forward across the whole Claude 5 family (Sonnet 5, and future
  // Opus/Haiku/Fable 5) — the API returns `invalid_request_error: 'temperature'
  // is deprecated for this model`. These run at default sampling. Sonnet 4.5
  // (the "-4-5" line) still ACCEPTS temperature, so the regex must not match it.
  // Verified live: opus-4-8 ✗, opus-5 ✗, claude-sonnet-5 ✗, sonnet-4-5 ✓.
  ensureApiKey();
  const client = new Anthropic();
  const omitTemperature = /opus-4-[78]|(?:sonnet|opus|haiku|fable)-5/.test(model);
  // Claude 5 family runs ADAPTIVE THINKING when `thinking` is omitted, and
  // thinking tokens count against max_tokens. Tight-budget calls here are all
  // short structured verdicts (quality gate PASS/FAIL, doc-type inference,
  // watchman triage) sized in the pre-thinking era — a thinking burst inside
  // a 200-token cap truncates the verdict. Disable thinking for those calls
  // (accepted at the default effort on Opus 5/Sonnet 5), restoring their
  // exact pre-5 contract; larger calls keep adaptive thinking for quality.
  const disableThinking = /(?:sonnet|opus|haiku)-5/.test(model) && (opts.thinking === 'off' || opts.maxTokens < 2048);
  // The fable tier cannot disable thinking (400) and thinks always-on inside
  // max_tokens, so tight caps get headroom instead — a cap raise is free.
  const maxTokens = /fable-5/.test(model) ? Math.max(opts.maxTokens, 4096) : opts.maxTokens;
  const requestBody: Anthropic.MessageCreateParamsNonStreaming = {
    model,
    max_tokens: maxTokens,
    system: opts.system,
    messages: turnList,
    ...(disableThinking ? { thinking: { type: 'disabled' as const } } : {}),
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

  // Claude 5 family (Fable especially) can end a turn with stop_reason
  // 'refusal'. Callers already treat empty text as a failed call (the quality
  // gate fails closed and retries), so surface WHY rather than changing the
  // control flow under a live system.
  if (res.stop_reason === 'refusal') {
    const category = (res as { stop_details?: { category?: string | null } }).stop_details?.category;
    logger.warn('model declined the request', { model, category: category ?? 'unspecified' });
  }

  // One usage→cost function for every Anthropic path (see stream-messages):
  // the previous local formula subtracted cache reads from input and ignored
  // cache writes, reporting $0 for a billable call.
  const inputTokens = res.usage?.input_tokens ?? 0;
  const outputTokens = res.usage?.output_tokens ?? 0;
  const cost = costForUsage(model, res.usage as UsageLike | undefined);

  return { text, cost, model, provider };
}
