/**
 * URL Safety — SSRF prevention helpers.
 *
 * Used by every endpoint that fetches a URL provided by, or attributable
 * to, an untrusted caller — webhook callbacks, document content URLs,
 * gate-resolver targets.
 *
 * The check parses IP literals properly (IPv4, IPv6 with `::` compression,
 * IPv4-mapped / NAT64 / 6to4 embeddings in either notation) and tests
 * complete ranges rather than string prefixes. It does NOT defend against
 * DNS rebinding (a name that resolves to a public IP at validation time and
 * a private IP at fetch time); callers must also refuse redirects and,
 * where possible, resolve once and pin the address — see SECURITY.md.
 */

import { isIPv4, isIPv6 } from 'node:net';
import { config } from '../config.js';

/**
 * Validate that a URL is safe to fetch.
 * Blocks:
 *  - Non-HTTPS schemes (except http://localhost in dev)
 *  - Private/reserved IPv4 ranges (10/8, 172.16/12, 192.168/16, 127/8,
 *    169.254/16, 0/8, 100.64/10, 224/4, 240/4)
 *  - Localhost and loopback names
 *  - IPv6 loopback (::1), unspecified (::), link-local (fe80::/10),
 *    unique-local (fc00::/7), and any IPv4 embedded in IPv6 (::ffff:a.b.c.d,
 *    ::ffff:7f00:1, 64:ff9b::/96, 2002::/16) that is itself private
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

  if (isLocalhostHostname(parsed.hostname)) return false;
  if (isPrivateHost(parsed.hostname)) return false;
  return true;
}

function stripBrackets(hostname: string): string {
  return hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
}

function isLocalhostHostname(hostname: string): boolean {
  const lower = stripBrackets(hostname);
  if (lower === 'localhost' || lower.endsWith('.localhost')) return true;
  const v4 = embeddedIPv4(lower) ?? (isIPv4(lower) ? lower : null);
  if (v4 && isPrivateIPv4(v4)) return true;
  if (isIPv6(lower)) {
    const words = expandIPv6(lower);
    if (words && (isLoopbackOrUnspecifiedV6(words))) return true;
  }
  return lower === '0.0.0.0';
}

/** True for any hostname that is a private, loopback, link-local or reserved IP literal. */
export function isPrivateHost(hostname: string): boolean {
  const clean = stripBrackets(hostname);
  if (isIPv4(clean)) return isPrivateIPv4(clean);
  if (isIPv6(clean)) return isPrivateIPv6(clean);
  return false;
}

/** IPv4 private/reserved ranges — complete, not prefix strings. */
export function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => !Number.isInteger(p) || p < 0 || p > 255)) return true; // malformed: refuse
  const [a, b] = parts;
  if (a === 10) return true;                       // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true;         // 192.168.0.0/16
  if (a === 127) return true;                      // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true;         // 169.254.0.0/16 link-local / cloud metadata
  if (a === 0) return true;                        // 0.0.0.0/8
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a >= 224) return true;                       // 224.0.0.0/4 multicast, 240.0.0.0/4 reserved, broadcast
  return false;
}

/**
 * Expand an IPv6 literal to eight 16-bit words. Handles `::` compression and
 * a trailing dotted IPv4 (e.g. ::ffff:127.0.0.1). Returns null if malformed.
 */
export function expandIPv6(ip: string): number[] | null {
  let s = ip.toLowerCase();
  const zone = s.indexOf('%');
  if (zone !== -1) s = s.slice(0, zone);
  // trailing dotted IPv4 -> two hex words
  const dotted = s.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (dotted) {
    const o = dotted[1].split('.').map(Number);
    if (o.some(n => n > 255)) return null;
    s = s.slice(0, -dotted[1].length) + ((o[0] << 8) | o[1]).toString(16) + ':' + ((o[2] << 8) | o[3]).toString(16);
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return null;
  const words = [...head, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...tail];
  if (words.length !== 8) return null;
  const out: number[] = [];
  for (const w of words) {
    if (!/^[0-9a-f]{1,4}$/.test(w)) return null;
    out.push(parseInt(w, 16));
  }
  return out;
}

function isLoopbackOrUnspecifiedV6(w: number[]): boolean {
  const allZeroButLast = w.slice(0, 7).every(x => x === 0);
  return allZeroButLast && (w[7] === 1 || w[7] === 0); // ::1 loopback, :: unspecified
}

/** IPv4 embedded in an IPv6 literal (mapped ::ffff:/96, NAT64 64:ff9b::/96, 6to4 2002::/16), as dotted text. */
function embeddedIPv4(host: string): string | null {
  if (!isIPv6(host)) return null;
  const w = expandIPv6(host);
  if (!w) return null;
  const v4 = (hi: number, lo: number) => `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;
  if (w.slice(0, 5).every(x => x === 0) && w[5] === 0xffff) return v4(w[6], w[7]);       // ::ffff:a.b.c.d / ::ffff:7f00:1
  if (w[0] === 0x64 && w[1] === 0xff9b && w.slice(2, 6).every(x => x === 0)) return v4(w[6], w[7]); // 64:ff9b::/96 NAT64
  if (w[0] === 0x2002) return v4(w[1], w[2]);                                             // 2002::/16 6to4
  return null;
}

/** IPv6 private/reserved: loopback, unspecified, link-local fe80::/10, ULA fc00::/7, embedded private IPv4. */
export function isPrivateIPv6(ip: string): boolean {
  const w = expandIPv6(ip);
  if (!w) return true; // malformed: refuse
  if (isLoopbackOrUnspecifiedV6(w)) return true;
  if ((w[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((w[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local (fc00–fdff)
  if ((w[0] & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  const embedded = embeddedIPv4(ip);
  if (embedded && isPrivateIPv4(embedded)) return true;
  return false;
}
