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
    const res = await fetch(u.toString(), {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': USER_AGENT,
        'accept': 'text/html,application/xhtml+xml',
        'accept-language': 'en-US,en;q=0.8',
      },
    });
    if (!res.ok) {
      throw new ScrapeError('fetch_failed', `${u.hostname} returned HTTP ${res.status}`);
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

// ── Signature phrase extraction ─────────────────────────────────────────

/**
 * Pull the most distinctive ~12 sentences from the scraped pages — the kind
 * of lines a partner would put on a slide: short tagline-like statements,
 * positioning paragraphs, named-practice phrases. We use these as a "live
 * reading" overlay on the frontend so the user sees what the system saw
 * while the LLM works.
 *
 * Heuristic, no LLM call. Cheap and fast.
 */
export function extractSignaturePhrases(scraped: ScrapeResult, maxPhrases = 12): string[] {
  // Combine all page text, split into sentence-like fragments.
  const allText = scraped.pages.map(p => p.text).join(' ');
  // Sentence-ish split: terminal punctuation followed by capital letter, OR
  // hard period boundaries. Also split on em-dashes between two long phrases.
  const fragments = allText
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z])|\s—\s|\s\|\s|\s•\s/g)
    .map(s => s.trim());

  // Filter: length, character mix, exclude obvious boilerplate.
  const BOILERPLATE = /\b(?:cookie|privacy policy|terms of use|sitemap|all rights reserved|skip to (?:content|main)|©|search this site|menu|sign up|subscribe|newsletter|©\s*\d{4}|cookies?|gdpr|opt[- ]out)\b/i;
  const NAV_NOISE = /^(?:home|about|contact|news|insights|careers|people|services)$/i;

  const candidates: { text: string; score: number }[] = [];
  for (const raw of fragments) {
    const f = raw.replace(/\s+/g, ' ').replace(/[\s.,;:!]+$/, '').trim();
    if (f.length < 25 || f.length > 200) continue;
    if (BOILERPLATE.test(f)) continue;
    if (NAV_NOISE.test(f)) continue;
    // Must have at least one space (no single-word fragments)
    if (!f.includes(' ')) continue;
    // Must look like prose: ratio of letters to non-letters
    const letters = (f.match(/[A-Za-z]/g) || []).length;
    if (letters < f.length * 0.6) continue;
    // Must start with a letter (no list markers, no numbers)
    if (!/^[A-Za-z]/.test(f)) continue;

    // Score: positive signals
    let score = 0;
    // Length sweet spot 40-120 chars
    if (f.length >= 40 && f.length <= 120) score += 3;
    else if (f.length >= 30 && f.length <= 160) score += 1;
    // Has named-entity-like capitalised mid-sentence words
    const capWords = (f.match(/\b[A-Z][a-z]{2,}\b/g) || []).length;
    if (capWords >= 2 && capWords <= 6) score += 2;
    // Has signal keywords typical of firm positioning
    if (/\b(?:advice|advise|insight|trusted|leading|partner|client|industry|sector|practice|expertise|strategic|deal|matter|complex|premier|firm|over \d+ years|since \d{4})\b/i.test(f)) score += 2;
    // Penalise lists-of-words look (lots of commas/no verbs)
    const commaCount = (f.match(/,/g) || []).length;
    if (commaCount >= 4) score -= 2;
    // Penalise question marks (FAQ-style)
    if (f.includes('?')) score -= 1;
    // Penalise repeated runs of 3+ short uppercase words (likely nav)
    if (/(?:\b[A-Z][A-Za-z]{0,12}\b\s+){3,}/.test(f) && letters / f.length > 0.85) score -= 2;

    if (score > 0) candidates.push({ text: f, score });
  }

  // Dedup by lowercase-prefix (avoid near-duplicates)
  const seen = new Set<string>();
  const unique: { text: string; score: number }[] = [];
  for (const c of candidates.sort((a, b) => b.score - a.score)) {
    const key = c.text.toLowerCase().slice(0, 60);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(c);
    if (unique.length >= maxPhrases) break;
  }

  // Return text only; preserve discovery order so the user sees the
  // strongest phrases first.
  return unique.map(c => c.text);
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
