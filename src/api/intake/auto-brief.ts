/**
 * Auto-Brief — when the user's request text is brief and they've attached
 * documents, read the documents and extract the actual task the user wants
 * answered. The orchestrator gets the enriched briefing instead of a
 * one-liner like "review this".
 *
 * Why this exists:
 *   A real client engagement starts with a covering email + attached
 *   contract. The cover email contains the questions and the deadline.
 *   The user shouldn't have to retype that into the Lavern prompt — the
 *   covering doc IS the briefing. This module reads it and synthesises
 *   the task automatically before workflow dispatch.
 *
 * Triggers when ALL of the following hold:
 *   - request.requestText is short (< AUTO_BRIEF_THRESHOLD_CHARS)
 *   - at least one document is attached with substantive fullText
 *
 * Cost: one Sonnet 4.5 call, ~3–6k input tokens, ~600 output. ≈ $0.02–0.06.
 *
 * Safe-fail: if the LLM call errors or times out, the original request is
 * returned unchanged. Auto-enrichment is best-effort, never blocking.
 */

import type { LegalRequest } from '../../types/index.js';
import type { ParsedDocument } from '../../documents/types.js';
import { crossProviderChat } from '../../providers/cross-provider-chat.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('AUTO-BRIEF');

const ENRICH_MODEL = 'claude-sonnet-4-5';
const AUTO_BRIEF_THRESHOLD_CHARS = 400;
const PER_DOC_EXCERPT_CHARS = 8_000;
const MAX_DOCS_FOR_BRIEF = 3;
const REQUEST_TIMEOUT_MS = 45_000;
const MAX_OUTPUT_TOKENS = 1_500;

interface EnrichResult {
  /** Whether the request was actually enriched (false = passthrough). */
  enriched: boolean;
  /** The (possibly enriched) request to dispatch. */
  request: LegalRequest;
  /** USD cost of the enrichment call (0 if not enriched). */
  costUsd: number;
}

function pricingFor(): { input: number; output: number } {
  // Sonnet 4.5: $3/M input, $15/M output
  return { input: 3.0, output: 15.0 };
}

/**
 * Extract usable text from a parsed document — bias toward the start where
 * cover emails state the ask, and prefer section content when available.
 */
function takeExcerpt(doc: ParsedDocument, maxChars: number): string {
  const text = doc.fullText ?? '';
  if (text.length <= maxChars) return text;
  // Prefer head + tail so we keep both the opening "Dear Counsel"
  // and any trailing format/deadline notes.
  const head = text.slice(0, Math.floor(maxChars * 0.7));
  const tail = text.slice(-Math.floor(maxChars * 0.3));
  return `${head}\n[…]\n${tail}`;
}

function buildSystemPrompt(): string {
  return `You read attached client documents and extract the legal task the client actually wants answered.

INPUT
You will receive:
- The user's brief instruction (often one line)
- One or more attached documents (typically a covering email + a contract)

OUTPUT (plain prose, no markdown headers, no preamble)
Produce a single enriched briefing paragraph that an orchestrating partner could read to understand the engagement. Include, in this order, only the items that are actually present:
  1. WHO the client is and what their position is (e.g. "Acting for Cobaridge Resources (40% participant) in a 40/60 unincorporated JV").
  2. The COUNTERPARTY and the asset / matter.
  3. The CORE ASK in one sentence.
  4. Any SPECIFIC QUESTIONS — list them numbered, kept tight (one sentence each).
  5. JURISDICTION / governing law if stated.
  6. DEADLINE if stated.
  7. FORMAT requested (e.g. "numbered responses + executive summary").
  8. Anything that should be FLAGGED FOR SPECIALIST referral if the user says so.

RULES
- Use only what is present in the user's instruction or the documents. Do not invent positions, parties, or facts.
- If the documents don't reveal a coherent task, return a single sentence: "INSUFFICIENT_BRIEF: the attached documents do not contain a clear legal question."
- No commentary, no meta language, no "this brief contains…". Just the briefing itself, ready to drop into a system prompt.
- Stay under 500 words.`;
}

function buildUserPrompt(userText: string, docs: ParsedDocument[]): string {
  const docBlocks = docs.slice(0, MAX_DOCS_FOR_BRIEF).map((d, i) => {
    const excerpt = takeExcerpt(d, PER_DOC_EXCERPT_CHARS);
    return `### Document ${i + 1}: ${d.name}\n${excerpt}`;
  }).join('\n\n');

  return `## User's brief instruction
"${(userText || '').trim() || '(blank)'}"

## Attached documents

${docBlocks}

---

Synthesise the enriched briefing now.`;
}

/**
 * Decide whether a request needs auto-enrichment.
 */
function needsEnrichment(request: LegalRequest, docs: ParsedDocument[]): boolean {
  if (!docs || docs.length === 0) return false;
  // Need at least one doc with real content
  const totalChars = docs.reduce((n, d) => n + (d.fullText?.length ?? 0), 0);
  if (totalChars < 500) return false;
  const reqLen = (request.requestText ?? '').trim().length;
  return reqLen < AUTO_BRIEF_THRESHOLD_CHARS;
}

/**
 * Call Sonnet to synthesise the enriched briefing.
 * Returns the new requestText and cost. Throws on hard failure.
 */
async function synthesise(
  userText: string,
  docs: ParsedDocument[],
): Promise<{ enrichedText: string; costUsd: number }> {
  const { text, cost: costUsd } = await crossProviderChat({
    system: buildSystemPrompt(),
    user: buildUserPrompt(userText, docs),
    tier: 'sonnet',
    maxTokens: MAX_OUTPUT_TOKENS,
    timeoutMs: REQUEST_TIMEOUT_MS,
  });

  return { enrichedText: text.trim(), costUsd };
}

/**
 * Enrich the request if needed. Always returns a usable LegalRequest.
 */
export async function enrichRequestFromDocs(
  request: LegalRequest,
  docs: ParsedDocument[],
): Promise<EnrichResult> {
  if (!needsEnrichment(request, docs)) {
    return { enriched: false, request, costUsd: 0 };
  }

  const userText = request.requestText ?? '';

  try {
    logger.info('Auto-brief triggered', {
      userTextChars: userText.length,
      docCount: docs.length,
      docNames: docs.map(d => d.name),
    });

    const { enrichedText, costUsd } = await synthesise(userText, docs);

    if (!enrichedText || enrichedText.startsWith('INSUFFICIENT_BRIEF:')) {
      logger.warn('Auto-brief returned insufficient', { reason: enrichedText.slice(0, 200) });
      return { enriched: false, request, costUsd };
    }

    // Preserve the original instruction for audit, but the orchestrator runs
    // off the enriched text.
    const merged = userText.trim()
      ? `${enrichedText}\n\n---\nClient's original short instruction: "${userText.trim()}"`
      : enrichedText;

    logger.info('Auto-brief succeeded', {
      enrichedChars: merged.length,
      costUsd: costUsd.toFixed(4),
    });

    return {
      enriched: true,
      request: { ...request, requestText: merged },
      costUsd,
    };
  } catch (err) {
    // Best-effort. Never block dispatch on enrichment failure.
    logger.warn('Auto-brief failed — proceeding with original request', {
      error: err instanceof Error ? err.message : String(err),
    });
    return { enriched: false, request, costUsd: 0 };
  }
}
