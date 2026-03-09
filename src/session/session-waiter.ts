/**
 * Session Waiter — Utility to await session completion.
 *
 * Used by the engage endpoint to block until the session finishes,
 * converting the fire-and-forget dispatch() into a synchronous response.
 */

import type { SessionState } from './session-state.js';
import type { ShemEvent } from '../events/event-bus.js';

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Wait for a session to complete (emit `session_end`) or fail.
 *
 * Resolves when the session ends successfully.
 * Rejects on fatal error or timeout.
 */
export function waitForSessionCompletion(
  session: SessionState,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      session.events.removeListener('session_end', onEnd);
      session.events.removeListener('shem_error', onError);
    };

    const onEnd = (_event: ShemEvent) => {
      cleanup();
      resolve();
    };

    const onError = (event: ShemEvent) => {
      const msg = 'message' in event
        ? (event as { message: string }).message
        : 'Unknown session error';
      // Reject on ALL errors — don't filter by substring.
      // Any error event should unblock the waiter rather than letting it hang.
      cleanup();
      reject(new Error(msg));
    };

    // Listen for completion and errors
    session.events.on('session_end', onEnd);
    session.events.on('shem_error', onError);

    // Timeout
    timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Session timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);
  });
}
