/**
 * useOnlineStatus — Tracks online state by pinging the API.
 *
 * We used to trust `navigator.onLine`, but it's notoriously unreliable
 * on macOS (latches to offline after transient network blips, VPN flaps,
 * dev-server restarts). It was causing false "You appear to be offline"
 * banners in the middle of demos when the server was in fact reachable.
 *
 * Strategy:
 *   1. Start optimistic (`isOnline: true`) so we never flash a false
 *      offline state on initial render.
 *   2. Only flip to offline after an actual `/api/health` probe fails
 *      twice in a row (HEAD, 3s timeout).
 *   3. When the browser fires `online`/`offline`, re-probe instead of
 *      trusting it.
 *   4. When the tab regains visibility/focus, re-probe — but throttled.
 *   5. Passive periodic probe every 30 s as a safety net.
 *
 * Hardening (2026-04-23): the previous version added an unnamed
 * `visibilitychange` listener that the cleanup forgot to remove, plus
 * had no in-flight dedup or min-interval throttle. In environments
 * where visibility/focus events fire repeatedly (e.g. Chrome devtools
 * docking, Preview MCP screenshots, OS notification flicker) this
 * stacked up thousands of HEAD probes per minute, all mutually
 * cancelling each other (`net::ERR_ABORTED`) and saturating the
 * Fastify auth middleware on `/api/health`. The fix is two-part:
 *   - One single named handler for visibilitychange, properly removed.
 *   - A `MIN_INTERVAL_MS` floor + in-flight guard so triggers can never
 *     run probes faster than once every ~5 s, regardless of source.
 */

import { useState, useEffect, useRef } from 'react';

const PROBE_URL = '/api/health';
const PROBE_TIMEOUT_MS = 3000;
const PROBE_INTERVAL_MS = 30_000;
/** Hard floor between probes — protects us against event-storm triggers. */
const MIN_INTERVAL_MS = 5_000;
const FAILURES_BEFORE_OFFLINE = 2;

async function probe(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    // HEAD is cheap; any HTTP response (even 401/403) means we reached the server.
    const res = await fetch(PROBE_URL, {
      method: 'HEAD',
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timer);
    return res.status > 0;
  } catch {
    return false;
  }
}

export function useOnlineStatus(): { isOnline: boolean } {
  // Optimistic start — don't flash offline on first render.
  const [isOnline, setIsOnline] = useState(true);
  const failuresRef = useRef(0);
  const mountedRef = useRef(true);
  const inFlightRef = useRef(false);
  const lastProbeAtRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;

    /**
     * Throttled, dedupe-safe probe entry point.
     * - Skips if a probe is currently in flight.
     * - Skips if last probe was less than MIN_INTERVAL_MS ago,
     *   unless `force` is true (we still honour the periodic 30s tick).
     */
    const runProbe = async (force = false): Promise<void> => {
      if (inFlightRef.current) return;
      const now = Date.now();
      if (!force && now - lastProbeAtRef.current < MIN_INTERVAL_MS) return;

      inFlightRef.current = true;
      lastProbeAtRef.current = now;
      try {
        const ok = await probe();
        if (!mountedRef.current) return;
        if (ok) {
          failuresRef.current = 0;
          setIsOnline(true);
        } else {
          failuresRef.current += 1;
          if (failuresRef.current >= FAILURES_BEFORE_OFFLINE) {
            setIsOnline(false);
          }
        }
      } finally {
        inFlightRef.current = false;
      }
    };

    // Kick off an immediate probe so we correct any stale state fast.
    void runProbe(true);

    // Periodic safety-net probe (always fires, regardless of throttle floor).
    const interval = window.setInterval(() => { void runProbe(true); }, PROBE_INTERVAL_MS);

    // Browser signals — hint, don't trust blindly. These are throttled.
    const onBrowserOnline  = (): void => { void runProbe(); };
    const onBrowserOffline = (): void => { void runProbe(); };
    const onFocus          = (): void => { void runProbe(); };
    const onVisibility     = (): void => {
      if (document.visibilityState === 'visible') void runProbe();
    };

    window.addEventListener('online',  onBrowserOnline);
    window.addEventListener('offline', onBrowserOffline);
    window.addEventListener('focus',   onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      mountedRef.current = false;
      window.clearInterval(interval);
      window.removeEventListener('online',  onBrowserOnline);
      window.removeEventListener('offline', onBrowserOffline);
      window.removeEventListener('focus',   onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return { isOnline };
}
