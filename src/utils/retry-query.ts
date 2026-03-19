/**
 * retryQuery — Retry wrapper for the Claude Agent SDK query() call.
 *
 * The SDK's query() function can fail on initialization with transient
 * API errors (429, 500, 502, 503, 529). This wrapper retries with
 * exponential backoff and emits events to the session so users see
 * "Retrying..." instead of silence.
 *
 * Once query() returns successfully, the streaming phase is handled
 * by streamMessages() + handleSessionError() — no retry needed there.
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { eventTimestamp } from '../events/event-bus.js';
import type { SessionState } from '../session/session-state.js';
import { createLogger } from './logger.js';

const logger = createLogger('RETRY');

/** Status codes that indicate a transient error worth retrying. */
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 529]);

/** Max retry attempts before giving up. */
const MAX_RETRIES = 3;

/** Max backoff delay in milliseconds. */
const MAX_DELAY_MS = 8000;

/**
 * Extract HTTP status code from an error, if available.
 * The Anthropic SDK throws errors with a `status` property.
 */
function getErrorStatus(error: unknown): number | undefined {
  if (error && typeof error === 'object' && 'status' in error) {
    return (error as { status: number }).status;
  }
  return undefined;
}

/**
 * Check if an error message indicates a transient/retryable condition.
 * Catches network errors, timeouts, and overloaded errors without a status code.
 */
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

/**
 * Determine if an error is retryable.
 */
function isRetryable(error: unknown): boolean {
  const status = getErrorStatus(error);
  if (status && RETRYABLE_STATUS_CODES.has(status)) return true;
  return isRetryableMessage(error);
}

/**
 * Call query() with retry logic for transient API errors.
 *
 * @param args - The same arguments you'd pass to query()
 * @param session - Optional session to emit retry events to
 * @returns The query result (async iterable of messages)
 */
export function retryQuery(
  args: Parameters<typeof query>[0],
  session?: SessionState,
): ReturnType<typeof query> {
  // First attempt — try synchronously (query() is sync in the SDK)
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return query(args);
    } catch (error) {
      lastError = error;

      if (!isRetryable(error) || attempt >= MAX_RETRIES) {
        throw error;
      }

      // This is a sync function but query() is sync too — we can't await here.
      // For the retry to work with a delay, we need to make this async.
      // Break out and use the async path below.
      break;
    }
  }

  // If we get here, the first attempt failed with a retryable error.
  // We need async retry with delays. Return a wrapper that does the retry
  // on first iteration of the async iterable.
  return retryQueryAsync(args, session, lastError);
}

/**
 * Async retry implementation. Creates a proxy async iterable that
 * performs retries with backoff before yielding from the real query.
 */
function retryQueryAsync(
  args: Parameters<typeof query>[0],
  session: SessionState | undefined,
  firstError: unknown,
): ReturnType<typeof query> {
  // We need to match the return type of query() which is an object with
  // an async iterator. We'll create the real result lazily.
  let realResult: ReturnType<typeof query> | null = null;
  let initialized = false;

  const init = async (): Promise<ReturnType<typeof query>> => {
    if (realResult) return realResult;

    let lastError = firstError;

    // Start from attempt 1 (attempt 0 already failed above)
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), MAX_DELAY_MS);
      const status = getErrorStatus(lastError);
      const reason = status ? `API ${status}` : (lastError instanceof Error ? lastError.message : 'Unknown error');

      logger.warn('query() failed, retrying', { reason, delayMs: delay, attempt, maxRetries: MAX_RETRIES });

      // Emit retry event so the frontend shows "Retrying..."
      if (session) {
        session.events.emitEvent({
          type: 'error',
          source: 'retry',
          message: `API temporarily unavailable (${reason}). Retrying in ${Math.round(delay / 1000)}s... (attempt ${attempt}/${MAX_RETRIES})`,
          timestamp: eventTimestamp(),
        });
      }

      await new Promise(resolve => setTimeout(resolve, delay));

      try {
        realResult = query(args);
        return realResult;
      } catch (error) {
        lastError = error;
        if (!isRetryable(error) || attempt >= MAX_RETRIES) {
          throw error;
        }
      }
    }

    // Should not reach here, but throw last error for safety
    throw lastError;
  };

  // Return a proxy object that matches the query() return type.
  // The query() function returns an object that is async iterable.
  // We intercept the first access to trigger retry logic.
  const proxy = {
    [Symbol.asyncIterator]() {
      let innerIterator: AsyncIterator<unknown> | null = null;

      return {
        async next(): Promise<IteratorResult<unknown>> {
          if (!initialized) {
            initialized = true;
            const result = await init();
            const iterable = result as AsyncIterable<unknown>;
            innerIterator = iterable[Symbol.asyncIterator]();
          }
          if (!innerIterator) {
            return { done: true, value: undefined };
          }
          return innerIterator.next();
        },
        async return(value?: unknown): Promise<IteratorResult<unknown>> {
          if (innerIterator?.return) {
            return innerIterator.return(value);
          }
          return { done: true, value: undefined };
        },
      };
    },
  };

  // Cast to match the return type of query()
  return proxy as ReturnType<typeof query>;
}
