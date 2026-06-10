/**
 * OpenAI-Compatible Provider Client.
 *
 * Shared chat-completions wrapper for providers that expose an OpenAI-shaped
 * API: Mistral, MiniMax, Kimi/Moonshot, and DeepSeek.
 */

import OpenAI from 'openai';
import { config } from '../config.js';
import { createLogger } from '../utils/logger.js';
import type { LLMProvider, OpenAICompatibleConfig, OpenAICompatibleProvider } from './types.js';
import { isOpenAICompatibleProvider } from './types.js';
import type { MistralToolDefinition } from './mistral.js';

const logger = createLogger('OPENAI-COMPAT');

const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 529]);
const MAX_RETRIES = 3;
const MAX_DELAY_MS = 8000;
const DEFAULT_TIMEOUT_MS = 120_000;

type Pricing = { input: number; output: number };

export interface OpenAICompatibleSettings extends OpenAICompatibleConfig {
  provider: OpenAICompatibleProvider;
  label: string;
  apiKeyEnv: string;
  pricing: Record<string, Pricing>;
  defaultPricing: Pricing;
  requestDefaults?: Record<string, unknown>;
  omitTemperature?: boolean;
}

export interface OpenAICompatibleChatOptions {
  provider: OpenAICompatibleProvider;
  model: string;
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
  tools?: MistralToolDefinition[];
  toolChoice?: 'auto' | 'none' | 'required';
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface OpenAICompatibleChatResult {
  message: OpenAI.Chat.Completions.ChatCompletionMessage;
  usage: OpenAI.Completions.CompletionUsage | undefined;
  finishReason: string | null;
  model: string;
  provider: OpenAICompatibleProvider;
  cost: number;
}

const ZERO_PRICING = { input: 0, output: 0 };

function envPricing(prefix: string): Pricing {
  return {
    input: Number.parseFloat(process.env[`${prefix}_INPUT_COST_PER_MILLION`] ?? '0') || 0,
    output: Number.parseFloat(process.env[`${prefix}_OUTPUT_COST_PER_MILLION`] ?? '0') || 0,
  };
}

export function getOpenAICompatibleSettings(provider: LLMProvider): OpenAICompatibleSettings {
  if (!isOpenAICompatibleProvider(provider)) {
    throw new Error(`Provider ${provider} is not OpenAI-compatible in Lavern.`);
  }

  if (provider === 'mistral') {
    return {
      provider,
      label: 'Mistral',
      apiKeyEnv: 'MISTRAL_API_KEY',
      ...config.mistral,
      pricing: {
        'mistral-large-latest': { input: 2.0, output: 6.0 },
        'mistral-medium-latest': { input: 0.4, output: 1.2 },
        'mistral-small-latest': { input: 0.1, output: 0.3 },
      },
      defaultPricing: { input: 2.0, output: 6.0 },
    };
  }

  if (provider === 'minimax') {
    return {
      provider,
      label: 'MiniMax',
      apiKeyEnv: 'MINIMAX_API_KEY',
      ...config.minimax,
      pricing: {},
      defaultPricing: envPricing('MINIMAX'),
      requestDefaults: { reasoning_split: true },
    };
  }

  if (provider === 'kimi') {
    return {
      provider,
      label: 'Kimi',
      apiKeyEnv: 'KIMI_API_KEY',
      ...config.kimi,
      pricing: {},
      defaultPricing: envPricing('KIMI'),
      requestDefaults: { thinking: { type: 'disabled' } },
      omitTemperature: true,
    };
  }

  return {
    provider,
    label: 'DeepSeek',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    ...config.deepseek,
    pricing: {},
    defaultPricing: envPricing('DEEPSEEK'),
    requestDefaults: {
      thinking: { type: 'enabled' },
      reasoning_effort: process.env.DEEPSEEK_REASONING_EFFORT ?? 'high',
    },
  };
}

const clients = new Map<string, OpenAI>();

export function getOpenAICompatibleClient(provider: OpenAICompatibleProvider): OpenAI {
  const settings = getOpenAICompatibleSettings(provider);
  if (!settings.apiKey) {
    throw new Error(`${settings.apiKeyEnv} is required when LAVERN_PROVIDER=${provider}. Set it in .env.`);
  }

  const cacheKey = `${provider}:${settings.baseUrl}`;
  const cached = clients.get(cacheKey);
  if (cached) return cached;

  const client = new OpenAI({
    apiKey: settings.apiKey,
    baseURL: settings.baseUrl,
  });
  clients.set(cacheKey, client);
  return client;
}

function getErrorStatus(error: unknown): number | undefined {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status: unknown }).status;
    if (typeof status === 'number') return status;
  }
  return undefined;
}

function isRetryable(error: unknown): boolean {
  const status = getErrorStatus(error);
  if (status && RETRYABLE_STATUS_CODES.has(status)) return true;
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes('rate limit') ||
    msg.includes('overloaded') ||
    msg.includes('timeout') ||
    msg.includes('econnreset') ||
    msg.includes('econnrefused') ||
    msg.includes('fetch failed') ||
    msg.includes('network') ||
    msg.includes('socket hang up')
  );
}

export async function openAICompatibleChat(options: OpenAICompatibleChatOptions): Promise<OpenAICompatibleChatResult> {
  const settings = getOpenAICompatibleSettings(options.provider);
  const client = getOpenAICompatibleClient(options.provider);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const request: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming & Record<string, unknown> = {
    model: options.model,
    messages: options.messages,
    tools: options.tools as OpenAI.Chat.Completions.ChatCompletionTool[] | undefined,
    tool_choice: options.toolChoice ?? (options.tools ? 'auto' : undefined),
    max_tokens: options.maxTokens ?? 8192,
    ...(settings.requestDefaults ?? {}),
  };

  if (!settings.omitTemperature) {
    request.temperature = options.temperature ?? 0.1;
  }

  let lastError: unknown;
  let response: OpenAI.Chat.Completions.ChatCompletion | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      response = await client.chat.completions.create(request, { signal: controller.signal });
      break;
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(`${settings.label} request timed out after ${Math.round(timeoutMs / 1000)}s.`);
      }
      lastError = error;
      if (!isRetryable(error) || attempt >= MAX_RETRIES) {
        throw error;
      }
      const delay = Math.min(1000 * Math.pow(2, attempt), MAX_DELAY_MS);
      const status = getErrorStatus(error);
      const reason = status ? `API ${status}` : (error instanceof Error ? error.message : 'unknown');
      logger.warn('chat completion failed, retrying', {
        provider: options.provider,
        model: options.model,
        reason,
        delayMs: delay,
        attempt: attempt + 1,
        maxRetries: MAX_RETRIES,
      });
      await new Promise(resolve => setTimeout(resolve, delay));
    } finally {
      clearTimeout(timer);
    }
  }

  if (!response) {
    throw lastError ?? new Error(`${settings.label} request failed without a response.`);
  }
  if (!response.choices || response.choices.length === 0) {
    throw new Error(`${settings.label} returned no choices; response may have been filtered or empty.`);
  }

  const choice = response.choices[0];
  const usage = response.usage;
  const pricing = settings.pricing[options.model] ?? settings.defaultPricing ?? ZERO_PRICING;
  const inputTokens = usage?.prompt_tokens ?? 0;
  const outputTokens = usage?.completion_tokens ?? 0;
  const cost = (inputTokens * pricing.input / 1_000_000) +
               (outputTokens * pricing.output / 1_000_000);

  return {
    message: choice.message,
    usage,
    finishReason: choice.finish_reason,
    model: response.model,
    provider: options.provider,
    cost,
  };
}
