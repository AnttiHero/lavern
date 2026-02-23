/**
 * Standalone mode detection.
 *
 * When the frontend is deployed without the API backend (e.g. Vercel),
 * all data hooks should skip API fetches and use bundled demo data only.
 *
 * Detection: if the page is NOT served from the API server's /dashboard/ path,
 * we're in standalone mode. This avoids every API fetch timing/fallback issue.
 */

export const IS_STANDALONE = (() => {
  if (typeof window === 'undefined') return true; // SSR / build
  // If served from the API's embedded dashboard, we have a backend
  if (window.location.pathname.startsWith('/dashboard')) return false;
  // If VITE_API_URL is set, we have a backend
  if (import.meta.env.VITE_API_URL) return false;
  // Otherwise: standalone deploy (Vercel, static hosting, etc.)
  return true;
})();
