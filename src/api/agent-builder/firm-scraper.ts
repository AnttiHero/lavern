/**
 * Firm Scraper — Fetch and clean HTML from a public firm website.
 *
 * Security:
 *  - https only
 *  - Blocks private / link-local / reserved IP ranges (SSRF protection)
 *  - 5 MB response cap
 *  - 12 s per-fetch timeout
 *  - Max 3 pages per import (root + 2 sniffed links)
 *  - User-Agent identifies Lavern
 *
 * Returns clean text suitable for LLM analysis — nav/script/style stripped.
 */

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const USER_AGENT = 'LavernBot/0.14 (+https://lavern.ai/bot)';
const MAX_BYTES = 5 * 1024 * 1024;      // 5 MB
const FETCH_TIMEOUT_MS = 12_000;
const MAX_PAGES = 5;
const MIN_USEFUL_CONTENT_CHARS = 400;

/** Keywords we match against <a href> to find team/about/practice pages. */
const FOLLOW_KEYWORDS = [
  '/about', '/team', '/people', '/partners', '/attorneys', '/lawyers',
  '/practice', '/expertise', '/services', '/firm',
];

export interface ScrapedPage {
  url: string;
  title: string;
  text: string;
}

export interface ScrapeResult {
  rootUrl: string;
  siteTitle: string;
  pages: ScrapedPage[];
  combinedChars: number;
}

export class ScrapeError extends Error {
  readonly code: 'invalid_url' | 'blocked_target' | 'fetch_failed' | 'too_thin';
  constructor(code: ScrapeError['code'], message: string) {
    super(message);
    this.code = code;
  }
}

// ── URL + DNS safety ────────────────────────────────────────────────────

function parseHttpsUrl(input: string): URL {
  let u: URL;
  try {
    u = new URL(input.trim());
  } catch {
    throw new ScrapeError('invalid_url', `Not a valid URL: ${input}`);
  }
  if (u.protocol !== 'https:') {
    throw new ScrapeError('invalid_url', 'Only https:// URLs are allowed.');
  }
  return u;
}

/** Reject RFC1918, loopback, link-local, and reserved IPs. */
function isPublicIp(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) {
    const parts = ip.split('.').map(Number);
    const [a, b] = parts;
    if (a === 10) return false;
    if (a === 127) return false;
    if (a === 0) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
    if (a >= 224) return false;                          // multicast / reserved
    return true;
  }
  if (family === 6) {
    const lower = ip.toLowerCase();
    if (lower === '::1' || lower === '::') return false;
    if (lower.startsWith('fe80:')) return false;         // link-local
    if (lower.startsWith('fc') || lower.startsWith('fd')) return false; // ULA
    if (lower.startsWith('ff')) return false;            // multicast
    return true;
  }
  return false;
}

async function assertPublicHost(u: URL): Promise<void> {
  const host = u.hostname;
  // Direct IP in URL — validate without DNS
  if (isIP(host)) {
    if (!isPublicIp(host)) {
      throw new ScrapeError('blocked_target', 'URL points to a private IP address.');
    }
    return;
  }
  let addresses: { address: string; family: number }[];
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    throw new ScrapeError('blocked_target', `Cannot resolve host: ${host}`);
  }
  if (addresses.length === 0) {
    throw new ScrapeError('blocked_target', `No addresses for host: ${host}`);
  }
  for (const { address } of addresses) {
    if (!isPublicIp(address)) {
      throw new ScrapeError('blocked_target', `Host resolves to a private IP: ${address}`);
    }
  }
}

// ── Fetch + decode with size cap ────────────────────────────────────────

async function fetchWithLimit(u: URL): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    // Audit fix H4: SSRF defense. The previous `redirect: 'follow'` let an
    // attacker-controlled public host 302 to 169.254.169.254 (cloud
    // metadata) or 127.0.0.1 (Ollama / internal services). We now follow
    // redirects manually, re-asserting `assertPublicHost` on each hop.
    let current = u;
    let res: Response | null = null;
    const MAX_HOPS = 3;
    for (let hop = 0; hop <= MAX_HOPS; hop++) {
      const r = await fetch(current.toString(), {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'user-agent': USER_AGENT,
          'accept': 'text/html,application/xhtml+xml',
          'accept-language': 'en-US,en;q=0.8',
        },
      });
      // 3xx with Location → re-validate before following.
      if (r.status >= 300 && r.status < 400 && r.headers.get('location')) {
        if (hop >= MAX_HOPS) {
          throw new ScrapeError('fetch_failed', `Too many redirects (>${MAX_HOPS}).`);
        }
        let next: URL;
        try { next = new URL(r.headers.get('location') as string, current); }
        catch { throw new ScrapeError('fetch_failed', 'Malformed redirect Location header.'); }
        if (next.protocol !== 'http:' && next.protocol !== 'https:') {
          throw new ScrapeError('blocked_target', `Redirect to non-HTTP scheme: ${next.protocol}`);
        }
        await assertPublicHost(next);
        current = next;
        continue;
      }
      res = r;
      break;
    }
    if (!res) throw new ScrapeError('fetch_failed', 'Redirect loop exited without a response.');
    if (!res.ok) {
      throw new ScrapeError('fetch_failed', `${current.hostname} returned HTTP ${res.status}`);
    }
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('html') && !ct.includes('xml') && !ct.includes('text/')) {
      throw new ScrapeError('fetch_failed', `Unexpected content-type: ${ct}`);
    }
    if (!res.body) {
      throw new ScrapeError('fetch_failed', 'Empty response body.');
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let total = 0;
    let text = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) {
        try { reader.cancel(); } catch { /* ignore */ }
        throw new ScrapeError('fetch_failed', `Response exceeded ${MAX_BYTES} bytes.`);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } catch (err) {
    if (err instanceof ScrapeError) throw err;
    if ((err as Error).name === 'AbortError') {
      throw new ScrapeError('fetch_failed', `Fetch timed out after ${FETCH_TIMEOUT_MS}ms.`);
    }
    throw new ScrapeError('fetch_failed', (err as Error).message || 'Fetch failed.');
  } finally {
    clearTimeout(timer);
  }
}

// ── HTML cleaning ───────────────────────────────────────────────────────

function extractTitle(html: string): string {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return '';
  return decodeEntities(m[1]).replace(/\s+/g, ' ').trim().slice(0, 200);
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&[a-z]+;/gi, ' ');
}

/** Strip chrome and return clean-ish text. Not perfect — good enough for LLM. */
function htmlToText(html: string): string {
  let s = html;
  // Remove elements whose text is noise
  s = s.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  s = s.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  s = s.replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');
  s = s.replace(/<svg[\s\S]*?<\/svg>/gi, ' ');
  s = s.replace(/<nav[\s\S]*?<\/nav>/gi, ' ');
  s = s.replace(/<footer[\s\S]*?<\/footer>/gi, ' ');
  s = s.replace(/<header[\s\S]*?<\/header>/gi, ' ');
  s = s.replace(/<form[\s\S]*?<\/form>/gi, ' ');
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  // Collapse remaining tags to whitespace
  s = s.replace(/<[^>]+>/g, ' ');
  s = decodeEntities(s);
  // Collapse whitespace
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

/** Extract follow candidates — same-origin links that look like about/team pages. */
function sniffFollowLinks(html: string, base: URL): URL[] {
  const hrefs = new Set<string>();
  const re = /<a\s[^>]*href\s*=\s*(?:"([^"]+)"|'([^']+)')/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const raw = m[1] ?? m[2];
    if (!raw) continue;
    if (raw.startsWith('#') || raw.startsWith('mailto:') || raw.startsWith('tel:')) continue;
    try {
      const resolved = new URL(raw, base);
      if (resolved.protocol !== 'https:') continue;
      if (resolved.hostname !== base.hostname) continue;
      const path = resolved.pathname.toLowerCase();
      if (path === '/' || path === '') continue;
      if (FOLLOW_KEYWORDS.some(kw => path.includes(kw))) {
        hrefs.add(resolved.toString());
      }
    } catch { /* ignore bad hrefs */ }
  }
  // Prefer shorter paths (less likely to be individual attorney detail pages)
  return Array.from(hrefs)
    .map(h => new URL(h))
    .sort((a, b) => a.pathname.length - b.pathname.length);
}

// ── Main entry ──────────────────────────────────────────────────────────

export async function scrapeFirmSite(
  inputUrl: string,
  onLog?: (msg: string) => void,
): Promise<ScrapeResult> {
  const root = parseHttpsUrl(inputUrl);
  await assertPublicHost(root);

  onLog?.(`Fetching ${root.hostname}…`);
  const rootHtml = await fetchWithLimit(root);
  const rootTitle = extractTitle(rootHtml);
  const rootText = htmlToText(rootHtml);

  const pages: ScrapedPage[] = [
    { url: root.toString(), title: rootTitle, text: rootText },
  ];

  const linksToFollow = sniffFollowLinks(rootHtml, root).slice(0, MAX_PAGES - 1);
  for (const link of linksToFollow) {
    try {
      await assertPublicHost(link);
      onLog?.(`Following ${link.pathname}…`);
      const html = await fetchWithLimit(link);
      pages.push({
        url: link.toString(),
        title: extractTitle(html),
        text: htmlToText(html),
      });
    } catch {
      // Non-fatal — skip and continue
    }
  }

  const combinedChars = pages.reduce((n, p) => n + p.text.length, 0);
  if (combinedChars < MIN_USEFUL_CONTENT_CHARS) {
    throw new ScrapeError(
      'too_thin',
      `Scraped content is too thin (${combinedChars} chars). The site may be JS-rendered or bot-blocked.`,
    );
  }

  return {
    rootUrl: root.toString(),
    siteTitle: rootTitle,
    pages,
    combinedChars,
  };
}
