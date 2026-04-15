/**
 * useOnlineStatus — Tracks online state by pinging the API.
 *
 * We used to trust `navigator.onLine`, but it's notoriously unreliable
 * on macOS (latches to offline after transient network blips, VPN flaps,
 * dev-server restarts). It was causing false "You appear to be offline"
 * banners in the middle of demos when the server was in fact reachable.
 *
 * New strategy: treat ourselves as online unless a real probe fails.
 *   1. Start optimistic (`isOnline: true`) so we never flash a false
 *      offline state on initial render.
 *   2. Only flip to offline after an actual `/api/health` probe fails
 *      twice in a row (HEAD, 3s timeout).
 *   3. When browser fires `online`, re-probe instead of trusting it.
 *   4. When browser fires `offline`, probe first — only then flip.
 *   5. Passive periodic probe every 30s as a safety net.
 *
 * Net effect: the banner only appears when the server is *actually*
 * unreachable, not when the browser's network stack is confused.
 */

import { useState, useEffect, useRef } from 'react';

const PROBE_URL = '/api/health';
const PROBE_TIMEOUT_MS = 3000;
const PROBE_INTERVAL_MS = 30_000;
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
    // 0 shouldn't happen for same-origin fetch, but treat any response as "reachable"
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

  useEffect(() => {
    mountedRef.current = true;

    const runProbe = async () => {
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
    };

    // Kick off an immediate probe so we correct any stale state fast.
    void runProbe();

    // Periodic safety-net probe.
    const interval = window.setInterval(() => { void runProbe(); }, PROBE_INTERVAL_MS);

    // Browser signal — don't trust blindly, use as a hint to probe.
    const onBrowserOnline = () => { void runProbe(); };
    const onBrowserOffline = () => { void runProbe(); };

    window.addEventListener('online', onBrowserOnline);
    window.addEventListener('offline', onBrowserOffline);

    // When the tab regains focus, re-probe — covers laptop wake, etc.
    const onFocus = () => { void runProbe(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void runProbe();
    });

    return () => {
      mountedRef.current = false;
      window.clearInterval(interval);
      window.removeEventListener('online', onBrowserOnline);
      window.removeEventListener('offline', onBrowserOffline);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  return { isOnline };
}
