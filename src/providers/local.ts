/**
 * Local Provider — Thin wrapper around Ollama for on-device inference.
 *
 * Ollama exposes an OpenAI-compatible API at /v1, so we use the same
 * `openai` npm package with a swapped base URL — same code shape as
 * Mistral, different endpoint, zero API key.
 *
 * Use case: privilege-protected / confidential matters where no document
 * content can leave the host machine. The whole Lavern pipeline
 * (orchestrator + specialists + assembly + evaluator gate) runs against
 * the local Ollama daemon. Cost: $0 (electricity).
 */

import OpenAI from 'openai';
import { config } from '../config.js';

// ── Pricing ─────────────────────────────────────────────────────────────
// On-device inference is free at the API layer. We expose a zero
// pricing table so the spend tracker still reports per-call "cost"
// uniformly across providers (useful for showing "would have cost
// $X via Anthropic" comparisons).
export const LOCAL_PRICING: Record<string, { input: number; output: number }> = {
  'gemma4:26b':       { input: 0, output: 0 },
  'gemma4:31b':       { input: 0, output: 0 },
  'gemma4:e4b':       { input: 0, output: 0 },
  'gemma4:e2b':       { input: 0, output: 0 },
};
const DEFAULT_LOCAL_PRICING = { input: 0, output: 0 };

// ── Client Singleton ────────────────────────────────────────────────────

let _client: OpenAI | null = null;

/**
 * Get the local Ollama client (lazy-initialized).
 * Uses OpenAI SDK with Ollama's base URL + a dummy API key (Ollama
 * accepts any non-empty key for OpenAI-compat mode).
 */
export function getLocalClient(): OpenAI {
  if (!_client) {
    _client = new OpenAI({
      apiKey: 'ollama',                                   // any non-empty string
      baseURL: `${config.local.baseUrl.replace(/\/$/, '')}/v1`,
    });
  }
  return _client;
}

// ── Health check (call before dispatch) ────────────────────────────────

/**
 * Probe the Ollama daemon to confirm it's reachable + the model is
 * loaded. Returns null on success, or an error message string.
 */
export async function checkLocalReady(modelName?: string): Promise<string | null> {
  const url = `${config.local.baseUrl.replace(/\/$/, '')}/api/tags`;
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(t);
    if (!res.ok) {
      return `Ollama daemon responded ${res.status} at ${url}. Is it running? Open the Ollama menu-bar app.`;
    }
    if (!modelName) return null;
    const data = await res.json() as { models?: Array<{ name?: string }> };
    const models = (data.models ?? []).map(m => m.name ?? '');
    const present = models.some(m => m === modelName || m.startsWith(`${modelName}:`));
    if (!present) {
      return `Ollama daemon is running but model "${modelName}" is not pulled. Run: ollama pull ${modelName}`;
    }
    return null;
  } catch (err) {
    return `Ollama daemon unreachable at ${url} — ${err instanceof Error ? err.message : String(err)}. Open the Ollama menu-bar app.`;
  }
}

// ── Types ───────────────────────────────────────────────────────────────

export interface LocalToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface LocalChatOptions {
  model: string;
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
  tools?: LocalToolDefinition[];
  toolChoice?: 'auto' | 'none' | 'required';
  temperature?: number;
  maxTokens?: number;
  /** Optional override for request timeout in ms. Local models can be slow. */
  timeoutMs?: number;
}

export interface LocalChatResult {
  message: OpenAI.Chat.Completions.ChatCompletionMessage;
  usage: OpenAI.Completions.CompletionUsage | undefined;
  finishReason: string | null;
  model: string;
  cost: number;
}

// ── Chat Completion ─────────────────────────────────────────────────────

/**
 * Run a single chat completion against Ollama (OpenAI-compatible).
 * Returns assistant message + usage. Caller handles tool execution.
 */
export async function localChat(options: LocalChatOptions): Promise<LocalChatResult> {
  const client = getLocalClient();

  const response = await client.chat.completions.create({
    model: options.model,
    messages: options.messages,
    tools: options.tools as OpenAI.Chat.Completions.ChatCompletionTool[] | undefined,
    tool_choice: options.toolChoice ?? (options.tools ? 'auto' : undefined),
    temperature: options.temperature ?? 0.1,
    max_tokens: options.maxTokens ?? 4096,
  }, {
    timeout: options.timeoutMs ?? 240_000,        // 4-min ceiling — local 26B can be slow
  });

  if (!response.choices || response.choices.length === 0) {
    throw new Error('Local Ollama returned no choices — response may have been filtered or empty.');
  }
  const choice = response.choices[0];
  const usage = response.usage;

  // Cost is $0 on-device, but compute tokens for telemetry parity.
  const pricing = LOCAL_PRICING[options.model] ?? DEFAULT_LOCAL_PRICING;
  const inputTokens = usage?.prompt_tokens ?? 0;
  const outputTokens = usage?.completion_tokens ?? 0;
  const cost = (inputTokens * pricing.input / 1_000_000) +
               (outputTokens * pricing.output / 1_000_000);

  return {
    message: choice.message,
    usage,
    finishReason: choice.finish_reason,
    model: response.model,
    cost,
  };
}
