/**
 * Sentry capture helper — module-level singleton.
 *
 * Lightweight HTTP-POST integration (no SDK dependency) so any module can
 * `import { captureError } from '../utils/sentry.js'` and report errors.
 *
 * Initialization is lazy: the first call reads SENTRY_DSN and sets up the
 * send function. If DSN is missing or malformed, calls become no-ops.
 *
 * Keep this file dependency-light — it's imported from hot error paths.
 */

import crypto from 'node:crypto';
import { config } from '../config.js';

type Sender = (err: Error, extra?: Record<string, unknown>) => void;

let initialized = false;
let sender: Sender | null = null;

function initialize(): void {
  if (initialized) return;
  initialized = true;

  const dsn = config.sentry.dsn;
  if (!dsn) return;

  const match = dsn.match(/^https:\/\/([^@]+)@([^/]+)\/(\d+)$/);
  if (!match) {
    // Malformed DSN — log once and stay a no-op.
    // eslint-disable-next-line no-console
    console.warn('[SENTRY] SENTRY_DSN present but malformed; error monitoring disabled.');
    return;
  }

  const [, publicKey, host, projectId] = match;
  const url = `https://${host}/api/${projectId}/store/?sentry_key=${publicKey}&sentry_version=7`;

  sender = (err, extra) => {
    try {
      const payload = JSON.stringify({
        event_id: crypto.randomUUID().replace(/-/g, ''),
        timestamp: new Date().toISOString(),
        platform: 'node',
        level: 'error',
        server_name: 'lavern-api',
        release: `lavern@${config.version}`,
        exception: {
          values: [
            {
              type: err.name,
              value: err.message,
              stacktrace: {
                frames: (err.stack ?? '')
                  .split('\n')
                  .slice(1, 10)
                  .map((l) => ({ filename: l.trim() })),
              },
            },
          ],
        },
        extra,
      });
      fetch(url, {
        method: 'POST',
        body: payload,
        headers: { 'Content-Type': 'application/json' },
      }).catch(() => {
        // Swallow — never let telemetry failures escape.
      });
    } catch {
      // Never throw from the capture path.
    }
  };
}

/**
 * Send an error to Sentry (no-op if SENTRY_DSN is unset).
 * Safe to call from any module; never throws.
 */
export function captureError(err: unknown, extra?: Record<string, unknown>): void {
  initialize();
  if (!sender) return;
  const normalized = err instanceof Error ? err : new Error(String(err));
  sender(normalized, extra);
}

/** Returns true if Sentry is active — mostly for startup log messages. */
export function isSentryEnabled(): boolean {
  initialize();
  return sender !== null;
}
