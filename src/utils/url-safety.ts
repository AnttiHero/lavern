/**
 * URL Safety — SSRF prevention helpers.
 *
 * Used by every endpoint that fetches a URL provided by, or attributable
 * to, an untrusted caller — webhook callbacks, document content URLs,
 * gate-resolver targets.
 *
 * The check is hostname-string-based. It blocks the obvious cases (private
 * IPs, loopback, link-local, IPv4-mapped IPv6) but does NOT defend against
 * DNS rebinding (a domain that resolves to a public IP at validation time
 * and a private IP at fetch time). For that, callers also need to resolve
 * the host once and pin the IP for the actual fetch — see roadmap item in
 * SECURITY.md.
 */

import { config } from '../config.js';

/**
 * Validate that a URL is safe to fetch.
 * Blocks:
 *  - Non-HTTPS schemes (except http://localhost in dev)
 *  - Private/reserved IP ranges (10.x, 172.16-31.x, 192.168.x, 169.254.x, 127.x)
 *  - Localhost and loopback addresses
 *  - IPv6 loopback (::1) and link-local (fe80::)
 *  - IPv4-mapped IPv6 (::ffff:127.0.0.1) bypass attempts
 */
export function isUrlSafe(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  // Only allow HTTPS (and HTTP localhost in dev mode)
  const isDev = config.isDevelopment || config.isTest;
  if (parsed.protocol === 'http:') {
    if (!isDev || !isLocalhostHostname(parsed.hostname)) {
      return false;
    }
    // In dev, allow http://localhost but still block private IPs
    return true;
  }
  if (parsed.protocol !== 'https:') {
    return false;
  }

  // Block localhost / loopback
  if (isLocalhostHostname(parsed.hostname)) {
    return false;
  }

  // Block private/reserved IP ranges
  if (isPrivateIp(parsed.hostname)) {
    return false;
  }

  return true;
}

function isLocalhostHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (lower === 'localhost' || lower === '127.0.0.1' || lower === '::1' || lower === '0.0.0.0') {
    return true;
  }
  // IPv4-mapped IPv6 (::ffff:127.0.0.1) — SSRF bypass vector
  if (lower.startsWith('::ffff:')) {
    const mapped = lower.slice(7);
    if (mapped === '127.0.0.1' || mapped === '0.0.0.0' || mapped.startsWith('10.')
      || mapped.startsWith('192.168.') || mapped.startsWith('172.')) {
      return true;
    }
  }
  return false;
}

function isPrivateIp(hostname: string): boolean {
  // Strip IPv6 brackets if present
  const clean = hostname.replace(/^\[|\]$/g, '');

  // IPv6 loopback and link-local
  if (clean === '::1' || clean.startsWith('fe80:') || clean.startsWith('fc00:') || clean.startsWith('fd00:')) {
    return true;
  }

  // IPv4-mapped IPv6 (::ffff:x.x.x.x) — check the embedded IPv4 address
  if (clean.toLowerCase().startsWith('::ffff:')) {
    const embedded = clean.slice(7);
    return isPrivateIp(embedded);
  }

  // IPv4 checks
  const ipv4Match = clean.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [, a, b] = ipv4Match.map(Number);
    // 10.0.0.0/8
    if (a === 10) return true;
    // 172.16.0.0/12
    if (a === 172 && b >= 16 && b <= 31) return true;
    // 192.168.0.0/16
    if (a === 192 && b === 168) return true;
    // 127.0.0.0/8 (loopback)
    if (a === 127) return true;
    // 169.254.0.0/16 (link-local — AWS metadata, GCP metadata, etc.)
    if (a === 169 && b === 254) return true;
    // 0.0.0.0
    if (a === 0 && b === 0) return true;
  }

  return false;
}
