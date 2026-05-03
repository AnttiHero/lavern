/**
 * SSRF defense tests for firm-scraper (audit fix H4).
 *
 * Strategy: stub the global `fetch` so we can drive arbitrary 3xx
 * Location headers and verify the manual redirect handler re-validates
 * each hop via `assertPublicHost`. We use literal public IPs in the
 * input URL so the initial DNS-lookup branch is bypassed (`isIP()`
 * returns truthy → no DNS round-trip).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { scrapeFirmSite, ScrapeError } from '../../src/api/agent-builder/firm-scraper.js';

const realFetch = globalThis.fetch;

function makeFetchSequence(responses: Response[]): typeof fetch {
  const queue = [...responses];
  return ((async (_input: unknown, _init?: unknown) => {
    const next = queue.shift();
    if (!next) throw new Error('test fetch: no more responses queued');
    return next;
  }) as unknown) as typeof fetch;
}

function htmlPage(): Response {
  // Body padded above MIN_USEFUL_CONTENT_CHARS so the scraper doesn't
  // reject the result as "too thin" — we're testing redirect handling,
  // not content sniffing.
  const body = '<p>' + 'This firm advises on cross-border transactions, regulatory matters, and disputes. '.repeat(20) + '</p>';
  return new Response(`<html><head><title>Public</title></head><body>${body}</body></html>`, {
    status: 200,
    headers: { 'content-type': 'text/html' },
  });
}

function redirectTo(location: string): Response {
  return new Response(null, {
    status: 302,
    headers: { 'location': location },
  });
}

beforeEach(() => {
  // No-op; each test installs its own mock
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('firm-scraper SSRF defense (H4)', () => {
  it('rejects a redirect that points at a private IP (127.0.0.1)', async () => {
    globalThis.fetch = makeFetchSequence([
      redirectTo('http://127.0.0.1:11434/api/tags'), // Ollama default
    ]);
    await expect(scrapeFirmSite('https://1.1.1.1/'))
      .rejects.toBeInstanceOf(ScrapeError);
  });

  it('rejects a redirect that points at link-local cloud metadata (169.254.169.254)', async () => {
    globalThis.fetch = makeFetchSequence([
      redirectTo('http://169.254.169.254/latest/meta-data/iam/security-credentials/'),
    ]);
    await expect(scrapeFirmSite('https://1.1.1.1/'))
      .rejects.toBeInstanceOf(ScrapeError);
  });

  it('rejects a redirect to a non-HTTP scheme (file://)', async () => {
    globalThis.fetch = makeFetchSequence([
      redirectTo('file:///etc/passwd'),
    ]);
    await expect(scrapeFirmSite('https://1.1.1.1/'))
      .rejects.toBeInstanceOf(ScrapeError);
  });

  it('follows a redirect to ANOTHER public IP and returns the final HTML', async () => {
    globalThis.fetch = makeFetchSequence([
      redirectTo('https://8.8.8.8/'), // Public IP
      htmlPage(),                       // Final page (root)
      // sniffFollowLinks finds no anchors in our minimal HTML, so no further fetches.
    ]);
    const result = await scrapeFirmSite('https://1.1.1.1/');
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].title).toBe('Public');
  });

  it('caps redirects at 3 hops', async () => {
    // 4 redirects in a row should exceed MAX_HOPS (3) and throw.
    globalThis.fetch = makeFetchSequence([
      redirectTo('https://8.8.8.8/a'),
      redirectTo('https://8.8.8.8/b'),
      redirectTo('https://8.8.8.8/c'),
      redirectTo('https://8.8.8.8/d'),
    ]);
    await expect(scrapeFirmSite('https://1.1.1.1/'))
      .rejects.toBeInstanceOf(ScrapeError);
  });
});
