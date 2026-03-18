/**
 * Mistral Client — Thin wrapper around the OpenAI SDK for Mistral AI.
 *
 * Mistral's API is OpenAI-compatible, so we use the `openai` npm package
 * with a swapped base URL. This gives us typed tool calls, streaming,
 * and all the standard chat completion features for free.
 *
 * This module provides:
 * - Client singleton (lazy-initialized from config)
 * - Chat completion with tools (the core loop primitive)
 * - Cost estimation from usage tokens
 */

import OpenAI from 'openai';
import { config } from '../config.js';

// ── Pricing (per million tokens) ────────────────────────────────────────
// Source: Mistral AI pricing as of 2025.
export const MISTRAL_PRICING: Record<string, { input: number; output: number }> = {
  'mistral-large-latest':  { input: 2.0,  output: 6.0  },
  'mistral-medium-latest': { input: 0.4,  output: 1.2  },
  'mistral-small-latest':  { input: 0.1,  output: 0.3  },
};

const DEFAULT_MISTRAL_PRICING = { input: 2.0, output: 6.0 };

// ── Client Singleton ────────────────────────────────────────────────────

let _client: OpenAI | null = null;

/**
 * Get the Mistral client (lazy-initialized).
 * Uses OpenAI SDK with Mistral's base URL.
 */
export function getMistralClient(): OpenAI {
  if (!_client) {
    const apiKey = config.mistral.apiKey;
    if (!apiKey) {
      throw new Error(
        'MISTRAL_API_KEY is required when LAVERN_PROVIDER=mistral. ' +
        'Set it in your environment or .env file.'
      );
    }

    _client = new OpenAI({
      apiKey,
      baseURL: config.mistral.baseUrl,
    });
  }
  return _client;
}

// ── Types ───────────────────────────────────────────────────────────────

export interface MistralToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface MistralChatOptions {
  model: string;
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
  tools?: MistralToolDefinition[];
  toolChoice?: 'auto' | 'none' | 'required';
  temperature?: number;
  maxTokens?: number;
}

export interface MistralChatResult {
  message: OpenAI.Chat.Completions.ChatCompletionMessage;
  usage: OpenAI.Completions.CompletionUsage | undefined;
  finishReason: string | null;
  model: string;
  cost: number;
}

// ── Chat Completion ─────────────────────────────────────────────────────

/**
 * Run a single chat completion against Mistral.
 *
 * Returns the assistant message, usage stats, and estimated cost.
 * Handles tool_calls in the response — the caller is responsible for
 * executing tools and continuing the loop.
 */
export async function mistralChat(options: MistralChatOptions): Promise<MistralChatResult> {
  const client = getMistralClient();

  const response = await client.chat.completions.create({
    model: options.model,
    messages: options.messages,
    tools: options.tools as OpenAI.Chat.Completions.ChatCompletionTool[] | undefined,
    tool_choice: options.toolChoice ?? (options.tools ? 'auto' : undefined),
    temperature: options.temperature ?? 0.1,
    max_tokens: options.maxTokens ?? 8192,
  });

  if (!response.choices || response.choices.length === 0) {
    throw new Error('Mistral returned no choices — response may have been filtered or empty.');
  }
  const choice = response.choices[0];
  const usage = response.usage;

  // Estimate cost
  const pricing = MISTRAL_PRICING[options.model] ?? DEFAULT_MISTRAL_PRICING;
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

/**
 * Estimate cost from raw token counts (for external callers).
 */
export function estimateMistralCost(
  inputTokens: number,
  outputTokens: number,
  model: string,
): number {
  const pricing = MISTRAL_PRICING[model] ?? DEFAULT_MISTRAL_PRICING;
  return (inputTokens * pricing.input / 1_000_000) +
         (outputTokens * pricing.output / 1_000_000);
}
