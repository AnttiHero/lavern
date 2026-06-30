/**
 * CourtListener connector — read-only access to U.S. case law via the free,
 * public CourtListener v4 REST API (https://www.courtlistener.com/api/rest/v4/).
 *
 * This is Lavern's first external legal-data connector. It follows the
 * claude-for-legal connector contract:
 *   - Read-heavy (search + citation lookup only; no writes)
 *   - Provenance on every result (case name, court, date, citation, URL)
 *   - Degrades gracefully (timeouts/rate-limits return a clean error, never hang)
 *   - Results are DATA, not instructions — callers must treat them as source material
 *
 * Auth is optional: the API serves anonymous requests (rate-limited). Set
 * COURTLISTENER_API_TOKEN for higher limits and citation-lookup access.
 */

import { config } from '../config.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('COURTLISTENER');

const DEFAULT_TIMEOUT_MS = 15_000;

export interface CaseLawResult {
  /** Short case name, e.g. "Brown v. Board of Education" */
  caseName: string;
  /** Court name, e.g. "Supreme Court of the United States" */
  court: string;
  /** ISO date the opinion was filed (may be empty) */
  dateFiled: string;
  /** Reporter citation(s), e.g. "347 U.S. 483". Empty if unreported. */
  citation: string;
  /** Docket number, if available */
  docketNumber: string;
  /** Canonical CourtListener URL for the opinion */
  url: string;
  /** CourtListener opinion-cluster id (stable identifier) */
  clusterId: number | null;
  /** Number of times this opinion has been cited (authority signal) */
  citeCount: number;
  /** Short text excerpt from the opinion, if the search returned one */
  snippet: string;
}

/** A failed connector call — surfaced to the caller as a clean message, never a throw upstream. */
export interface ConnectorError {
  error: string;
}

export function isConnectorError(x: unknown): x is ConnectorError {
  return !!x && typeof x === 'object' && 'error' in (x as Record<string, unknown>);
}

function authHeaders(): Record<string, string> {
  const token = config.courtListener.apiToken;
  return token ? { Authorization: `Token ${token}` } : {};
}

/** Public-link origin, derived from the configured base URL (so the cited
 *  source always matches the host actually queried). */
function linkOrigin(): string {
  try { return new URL(config.courtListener.baseUrl).origin; } catch { return 'https://www.courtlistener.com'; }
}

/** Map a raw v4 search result to our normalized, provenance-bearing shape. Defensive about field names. */
function normalize(r: Record<string, unknown>): CaseLawResult {
  const citationArr = Array.isArray(r.citation) ? (r.citation as string[]) : [];
  const citation =
    citationArr.length > 0
      ? citationArr.join('; ')
      : ((r.neutralCite as string) || (r.lexisCite as string) || '');
  const opinions = Array.isArray(r.opinions) ? (r.opinions as Array<Record<string, unknown>>) : [];
  const snippet = (opinions[0]?.snippet as string) ?? (r.snippet as string) ?? '';
  const absUrl = (r.absolute_url as string) ?? '';

  return {
    caseName: (r.caseName as string) || (r.caseNameFull as string) || '(unnamed opinion)',
    court: (r.court as string) || (r.court_citation_string as string) || (r.court_id as string) || '',
    dateFiled: (r.dateFiled as string) || '',
    citation,
    docketNumber: (r.docketNumber as string) || '',
    url: absUrl ? `${linkOrigin()}${absUrl}` : '',
    clusterId: typeof r.cluster_id === 'number' ? (r.cluster_id as number) : null,
    citeCount: typeof r.citeCount === 'number' ? (r.citeCount as number) : 0,
    // Strip newlines so a snippet can never look like multi-line instructions.
    snippet: typeof snippet === 'string' ? snippet.replace(/\s+/g, ' ').trim().slice(0, 600) : '',
  };
}

export interface SearchOptions {
  maxResults?: number;
  /** CourtListener court id filter, e.g. "scotus", "ca9". Omit to search all courts. */
  court?: string;
  timeoutMs?: number;
}

/**
 * Search U.S. case law (judicial opinions). Returns ranked, provenance-bearing
 * results, or a ConnectorError on network/rate-limit/HTTP failure.
 */
export async function searchCaseLaw(
  query: string,
  opts: SearchOptions = {},
): Promise<CaseLawResult[] | ConnectorError> {
  const maxResults = Math.min(Math.max(opts.maxResults ?? 5, 1), 20);
  const base = config.courtListener.baseUrl.replace(/\/$/, '');
  const params = new URLSearchParams({ q: query, type: 'o', page_size: String(maxResults) });
  if (opts.court) params.set('court', opts.court);
  const url = `${base}/search/?${params.toString()}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json', ...authHeaders() },
    });
    if (res.status === 429) return { error: 'CourtListener rate limit reached. Set COURTLISTENER_API_TOKEN for higher limits, or retry shortly.' };
    if (!res.ok) return { error: `CourtListener returned HTTP ${res.status}.` };
    const data = (await res.json()) as { results?: Array<Record<string, unknown>> };
    const results = Array.isArray(data.results) ? data.results : [];
    return results.slice(0, maxResults).map(normalize);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn('searchCaseLaw failed', { msg });
    return { error: `Could not reach CourtListener (${msg}).` };
  } finally {
    clearTimeout(timer);
  }
}

export interface CitationLookupResult {
  /** The citation string that was looked up */
  citation: string;
  /** true if CourtListener resolved it to a real opinion */
  found: boolean;
  /** Matched case name, if found */
  caseName?: string;
  /** Canonical URL, if found */
  url?: string;
}

/**
 * Verify that a reporter citation (e.g. "347 U.S. 483") resolves to a real
 * opinion. Used to fact-check citations an agent produced. Requires an API
 * token; degrades gracefully when one isn't configured.
 */
export async function lookupCitation(
  citation: string,
  opts: { timeoutMs?: number } = {},
): Promise<CitationLookupResult | ConnectorError> {
  if (!config.courtListener.apiToken) {
    return { error: 'Citation lookup requires a CourtListener API token (COURTLISTENER_API_TOKEN). Use search_case_law for tokenless access.' };
  }
  const base = config.courtListener.baseUrl.replace(/\/$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/citation-lookup/`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authHeaders() },
      body: JSON.stringify({ text: citation }),
    });
    if (!res.ok) return { error: `CourtListener citation lookup returned HTTP ${res.status}.` };
    const data = (await res.json()) as Array<Record<string, unknown>>;
    const first = Array.isArray(data) ? data[0] : undefined;
    const clusters = (first?.clusters as Array<Record<string, unknown>>) ?? [];
    const match = clusters[0];
    if (!match) return { citation, found: false };
    const absUrl = (match.absolute_url as string) ?? '';
    return {
      citation,
      found: true,
      caseName: (match.case_name as string) || (match.caseName as string) || undefined,
      url: absUrl ? `${linkOrigin()}${absUrl}` : undefined,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn('lookupCitation failed', { msg });
    return { error: `Could not reach CourtListener citation lookup (${msg}).` };
  } finally {
    clearTimeout(timer);
  }
}
