/** with-retry policy tests. */
// ── Client-side timeouts are not retried ─────────────────────────────────
import { describe, it, expect } from 'vitest';
import { isClientTimeout, isRetryableError, withRetry } from '../../src/utils/with-retry.js';
describe('client timeout policy', () => {
  it('a request timeout is our own deadline, not a transient failure — no retry', async () => {
    const err = Object.assign(new Error('Request timed out.'), { name: 'APIConnectionTimeoutError' });
    expect(isClientTimeout(err)).toBe(true);
    expect(isRetryableError(err)).toBe(false);
    let calls = 0;
    await expect(withRetry(async () => { calls++; throw err; }, { maxRetries: 3, label: 'test' })).rejects.toThrow('Request timed out');
    expect(calls).toBe(1);
  });
  it('server-side 504 / overloaded remain retryable', () => {
    expect(isRetryableError(Object.assign(new Error('Gateway Timeout'), { status: 504 }))).toBe(true);
    expect(isRetryableError(new Error('Overloaded'))).toBe(true);
  });
});
