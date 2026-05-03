/**
 * withRetry — generic retry wrapper for transient API failures.
 *
 * Audit fix H7: extracted from retry-query.ts so non-streaming Anthropic /
 * Mistral / cross-provider one-shot calls (revise, conversation, quality
 * gate, document assembler, firm import) also benefit. Without this, a
 * single 429 / 529 / 503 / 502 from upstream surfaces as a hard 500 to
 * the user — even though v0.11.2 claims "retry hardening."
 *
 * Default policy: 3 retries, exponential backoff (1s → 2s → 4s, capped 8s),
 * with the same retryable-error detection as the SDK retry wrapper.
 */

import { createLogger } from './logger.js';

const logger = createLogger('RETRY');

const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504, 529]);
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_MAX_DELAY_MS = 8_000;

function getErrorStatus(error: unknown): number | undefined {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status: unknown }).status;
    if (typeof status === 'number') return status;
  }
  return undefined;
}

function isRetryableMessage(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes('overloaded') ||
    msg.includes('rate limit') ||
    msg.includes('timeout') ||
    msg.includes('econnreset') ||
    msg.includes('econnrefused') ||
    msg.includes('fetch failed') ||
    msg.includes('network') ||
    msg.includes('socket hang up')
  );
}

export function isRetryableError(error: unknown): boolean {
  const status = getErrorStatus(error);
  if (status && RETRYABLE_STATUS_CODES.has(status)) return true;
  return isRetryableMessage(error);
}

export interface WithRetryOptions {
  /** Max attempts AFTER the first try (default 3 → up to 4 total). */
  maxRetries?: number;
  /** Cap on the per-attempt backoff (default 8s). */
  maxDelayMs?: number;
  /** Label for log lines / Sentry breadcrumbs. */
  label?: string;
}

/**
 * Run `fn` and retry on transient errors. Throws the last error if all
 * attempts fail or the error isn't retryable.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: WithRetryOptions = {},
): Promise<T> {
  const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
  const maxDelay = opts.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const label = opts.label ?? 'unknown';

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt >= maxRetries || !isRetryableError(error)) throw error;
      const delay = Math.min(1000 * Math.pow(2, attempt), maxDelay);
      const status = getErrorStatus(error);
      const reason = status ? `HTTP ${status}` : (error instanceof Error ? error.message.slice(0, 100) : 'unknown');
      logger.warn('withRetry: transient failure, retrying', {
        label, reason, delayMs: delay, attempt: attempt + 1, maxRetries,
      });
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}
