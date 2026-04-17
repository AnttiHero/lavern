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
 * App.tsx listens for 'shem:api-error' events and shows toasts / TopUpDialog / logout.
 */

// ── Event types ───────────────────────────────────────────────────────

export type ApiErrorType = 'auth-expired' | 'payment-required' | 'rate-limited' | 'server-error';

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

function dispatchApiError(type: ApiErrorType, message: string, status: number): void {
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
    // Skip ALL auth-related endpoints — a 401 here means "not logged in",
    // not "session expired". AuthGate handles this silently.
    if (url.startsWith('/api/auth/')) return;
    // Only show "expired" if the user was actually logged in. If there's
    // no evidence of a prior session, this is just an unauthenticated
    // visit hitting a protected endpoint — not an expiration event.
    const hadSession = document.cookie.includes('lavern_token') ||
      sessionStorage.getItem('shem-session-id') !== null;
    if (!hadSession) return;
    dispatchApiError('auth-expired', 'Your session has expired. Please sign in again.', 401);
    return;
  }

  if (res.status === 402) {
    dispatchApiError('payment-required', 'You need more billable hours to continue.', 402);
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
    dispatchApiError('server-error', 'Something went wrong on our end. Please try again.', res.status);
  }
}

// ── Global fetch interceptor (install once at startup) ────────────────

let installed = false;

/**
 * Install a global fetch interceptor that monitors all responses to /api/* URLs.
 * Call once in main.tsx before rendering the app.
 * Safe to call multiple times (no-ops after first install).
 */
export function installApiInterceptor(): void {
  if (installed) return;
  installed = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async function interceptedFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const res = await originalFetch(input, init);

    // Extract URL string for path matching
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.pathname
        : input instanceof Request
          ? new URL(input.url).pathname
          : '';

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
  return fetch(url, {
    credentials: 'include',
    ...init,
  });
}
