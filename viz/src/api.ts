/**
 * Frontend API URL helpers.
 *
 * Relative /api calls work for the embedded dashboard and Vite dev proxy.
 * Split-origin deployments can set VITE_API_URL, e.g. https://api.example.com.
 */

const rawApiBase = (import.meta.env.VITE_API_URL as string | undefined)?.trim() ?? '';

export const API_BASE_URL = rawApiBase.replace(/\/+$/, '');

function inferredLocalDevApiBaseUrl(): string {
  if (typeof window === 'undefined') return '';

  const localHosts = new Set(['localhost', '127.0.0.1', '::1']);
  if (!localHosts.has(window.location.hostname)) return '';

  // Vite dev serves the SPA on 5173 while the API listens on 3000. Using the
  // API directly avoids proxy-aborted multipart uploads for large documents.
  if (window.location.port === '5173') {
    const host = window.location.hostname === '::1' ? '[::1]' : window.location.hostname;
    return `${window.location.protocol}//${host}:3000`;
  }

  return '';
}

function effectiveApiBaseUrl(): string {
  return API_BASE_URL || inferredLocalDevApiBaseUrl();
}

function normalizePath(path: string): string {
  return path.startsWith('/') ? path : `/${path}`;
}

function isLavernApiPath(path: string): boolean {
  return path.startsWith('/api/') || path === '/api' || path.startsWith('/health');
}

export function apiUrl(path: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return path;
  const apiBaseUrl = effectiveApiBaseUrl();
  if (!apiBaseUrl) return path;
  const normalizedPath = normalizePath(path);
  if (!isLavernApiPath(normalizedPath)) return path;
  return `${apiBaseUrl}${normalizedPath}`;
}

export function webSocketUrl(path: string): string {
  const normalizedPath = normalizePath(path);

  const apiBaseUrl = effectiveApiBaseUrl();
  if (apiBaseUrl) {
    const target = new URL(normalizedPath, 'http://lavern.local');
    const url = new URL(apiBaseUrl);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = target.pathname;
    url.search = target.search;
    url.hash = '';
    return url.toString();
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}${normalizedPath}`;
}

export function isLocalDevApiHost(): boolean {
  if (typeof window === 'undefined') return false;
  const localHosts = new Set(['localhost', '127.0.0.1', '::1']);
  return localHosts.has(window.location.hostname) && ['3000', '5173'].includes(window.location.port);
}

export function hasApiBackendHint(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(effectiveApiBaseUrl())
    || window.location.pathname.startsWith('/dashboard')
    || isLocalDevApiHost();
}

export function apiPathFromInput(input: RequestInfo | URL): string {
  const rawUrl = typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.toString()
      : typeof Request !== 'undefined' && input instanceof Request
        ? input.url
        : '';

  try {
    const parsed = new URL(rawUrl, window.location.origin);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return rawUrl;
  }
}
