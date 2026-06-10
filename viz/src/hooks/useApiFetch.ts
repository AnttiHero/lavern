/**
 * API Error Interceptor — Global fetch monitoring for the Lavern SPA.
 *
 * Two complementary mechanisms:
 *
 * 1. `installApiInterceptor()` — Called once at app startup (main.tsx).
 *    Monkey-patches window.fetch to intercept ALL responses to /api/* URLs.
 *    Dispatches 'shem:api-error' custom events for 401/402/429/5xx.
 *    Zero changes needed in existing hooks.
 *
 * 2. `apiFetch()` — Optional drop-in replacement for new code.
 *    Same interception + auto-includes `credentials: 'include'`.
 *
 * App.tsx listens for 'shem:api-error' events and shows toasts / handles logout.
 */

// ── Event types ───────────────────────────────────────────────────────

import { apiPathFromInput, apiUrl } from '../api.js';

export type ApiErrorType = 'auth-expired' | 'rate-limited' | 'server-error';

export interface ApiErrorEvent {
  type: ApiErrorType;
  message: string;
  status: number;
}

// ── Dedup: prevent duplicate toasts for rapid-fire 401s ───────────────

let lastErrorKey = '';
let lastErrorTime = 0;
const DEDUP_MS = 3000;

function shouldDispatch(type: ApiErrorType, status: number): boolean {
  const key = `${type}:${status}`;
  const now = Date.now();
  if (key === lastErrorKey && now - lastErrorTime < DEDUP_MS) return false;
  lastErrorKey = key;
  lastErrorTime = now;
  return true;
}

// ── Event dispatch ────────────────────────────────────────────────────

export function dispatchApiError(type: ApiErrorType, message: string, status: number): void {
  if (!shouldDispatch(type, status)) return;
  window.dispatchEvent(
    new CustomEvent<ApiErrorEvent>('shem:api-error', {
      detail: { type, message, status },
    }),
  );
}

// ── Response interceptor (shared logic) ───────────────────────────────

async function interceptResponse(res: Response, url: string): Promise<void> {
  // Only intercept our API calls
  if (!url.startsWith('/api/')) return;

  if (res.status === 401) {
    return; // LOCAL MODE: no auth expiration
    // Skip ALL auth-related endpoints — a 401 here means "not logged in",
    // not "session expired". AuthGate handles this silently.
    if (url.startsWith('/api/auth/')) return;
    // Only show "expired" if the user was actually logged in. If there's
    // no evidence of a prior session, this is just an unauthenticated
    // visit hitting a protected endpoint — not an expiration event.
    // Note: lavern_token is HttpOnly so document.cookie can't see it —
    // check sessionStorage and also verify with the server before
    // triggering a destructive logout.
    const hadSession = sessionStorage.getItem('shem-session-id') !== null;
    if (!hadSession) return;
    // Verify session is truly expired before destructive logout.
    // A transient 401 (DB hiccup, race condition) should not permanently
    // delete the user's auth token.
    try {
      const verifyRes = await originalFetchRef(apiUrl('/api/auth/me'), { credentials: 'include' });
      if (verifyRes.ok) return; // Session is actually fine — skip logout
    } catch {
      // Network error during verification — don't logout on connectivity issues
      return;
    }
    dispatchApiError('auth-expired', 'Your session has expired. Please sign in again.', 401);
    return;
  }

  if (res.status === 403) {
    // Check if it's the email-not-verified case (handled by VerificationBanner — skip)
    try {
      const cloned = res.clone();
      const body = await cloned.json();
      if (body?.code === 'EMAIL_NOT_VERIFIED') return;
    } catch { /* non-JSON 403 — ignore */ }
    return;
  }

  if (res.status === 429) {
    dispatchApiError('rate-limited', 'Too many requests. Please wait a moment before trying again.', 429);
    return;
  }

  if (res.status >= 500) {
    // Try to extract a specific message from the JSON body so users see what
    // actually failed (e.g. "Briefing analysis failed — ANTHROPIC_API_KEY is
    // not configured") instead of the generic fallback.
    let message = 'Something went wrong on our end. Please try again.';
    try {
      const cloned = res.clone();
      const body = await cloned.json();
      if (body && typeof body === 'object') {
        const error = typeof body.error === 'string' ? body.error : undefined;
        const detail = typeof body.message === 'string' ? body.message : undefined;
        if (error && detail) message = `${error}: ${detail}`;
        else if (error) message = error;
        else if (detail) message = detail;
      }
    } catch { /* non-JSON 5xx — keep generic message */ }
    dispatchApiError('server-error', message, res.status);
  }
}

// ── Global fetch interceptor (install once at startup) ────────────────

let installed = false;
// Reference to the un-patched fetch so interceptResponse can verify
// session status without going through the interceptor (avoids recursion).
let originalFetchRef: typeof window.fetch = window.fetch.bind(window);

/**
 * Install a global fetch interceptor that monitors all responses to /api/* URLs.
 * Call once in main.tsx before rendering the app.
 * Safe to call multiple times (no-ops after first install).
 */
export function installApiInterceptor(): void {
  if (installed) return;
  installed = true;

  const originalFetch = window.fetch.bind(window);
  originalFetchRef = originalFetch;

  window.fetch = async function interceptedFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const fetchInput = typeof input === 'string' ? apiUrl(input) : input;
    const res = await originalFetch(fetchInput, init);
    const url = apiPathFromInput(fetchInput);

    // Fire-and-forget interception (don't delay the response)
    interceptResponse(res, url).catch(() => {});

    return res;
  };
}

// ── Optional explicit wrapper (for new code that wants credentials) ───

/**
 * Drop-in replacement for fetch() that auto-includes credentials
 * and benefits from the global interceptor.
 */
export async function apiFetch(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(apiUrl(url), {
    credentials: 'include',
    ...init,
  });
}
