/**
 * Standalone mode detection.
 *
 * When the frontend is deployed without the API backend, data hooks should skip
 * API fetches and use bundled demo data only.
 */

import { hasApiBackendHint } from './api.js';

export const IS_STANDALONE = (() => {
  if (typeof window === 'undefined') return true; // SSR / build
  return !hasApiBackendHint();
})();
