/**
 * The Watchman — per-document triage, runs first.
 *
 * Lighthouse architecture, persona 1. One LLM call with structured output.
 * Reads filename + first ~1500 chars and decides:
 *   - what kind of document this is (jv / nda / employment / lease / loan
 *     / saas / policy / other)
 *   - what jurisdiction
 *   - how urgent
 *   - what happens next: skip / quick-scan / deep-read
 *   - which Reader template to use (Phase 6)
 *
 * Local-first: if a local Ollama model is configured, the Watchman uses
 * it (zero cost). If not, falls back to cloud Haiku ($0.001/call). If
 * both fail, falls back to the heuristic classifier (zero LLM, regex on
 * filename and document text).
 *
 * The Watchman is the bouncer. It can say "this isn't worth reading" —
 * a meeting agenda accidentally dropped in the watched folder, an empty
 * boilerplate, a duplicate. That decision saves the Reader ~22 calls
 * per skipped document.
 */

import * as path from 'node:path';
import { config } from '../config.js';
import { crossProviderChat } from '../providers/cross-provider-chat.js';
import { createLogger } from '../utils/logger.js';
import type {
  ClawProfile,
  WatchmanResult,
  WatchmanRoute,
  WatchmanDocumentType,
} from './types.js';

const logger = createLogger('CLAW-WATCHMAN');

// ── Prompt ─────────────────────────────────────────────────────────────

const WATCHMAN_PROMPT = `You are the Watchman of a legal AI lighthouse. Documents arrive in the watched folder; you decide what happens next. You read the filename and the first ~1500 characters, nothing more. Your job is triage, not analysis.

Output a single JSON object with EXACTLY these fields:

{
  "documentType": "jv" | "nda" | "employment" | "lease" | "loan" | "saas" | "policy" | "other",
  "jurisdiction": "string — see jurisdiction rules below",
  "confidence": number,
  "urgency": "routine" | "elevated" | "critical",
  "route": "skip" | "quick-scan" | "deep-read",
  "readerTemplate": "string (matches documentType for now)",
  "rationale": "string (one sentence)"
}

**CRITICAL — jurisdiction rules (read twice):**
The jurisdiction field must come ONLY from the DOCUMENT TEXT below — governing-law clauses, defined terms, party addresses, or state/country names appearing in the contract. It must NOT be the CLIENT's home jurisdiction. The CLIENT field tells you who is reviewing this document; it is NOT where the document is from.

Examples:
  - Document text says "governed by the laws of Delaware" → jurisdiction = "Delaware"
  - Document text shows a Texas address for both parties → jurisdiction = "Texas"
  - Document text mentions Japanese and Chinese parties → jurisdiction = "Japan, China"
  - Document text says nothing about governing law → jurisdiction = "" (empty string is valid)
  - The CLIENT is in NSW but the document is governed by Delaware law → jurisdiction = "Delaware" (NOT "NSW, Delaware", NOT "NSW")

If you cannot find a jurisdiction in the document text, return an EMPTY STRING. Do NOT use the client's jurisdiction as a fallback.

Type taxonomy:
  jv         — joint venture / shareholders / consortium agreement
  nda        — non-disclosure / confidentiality
  employment — offer letter, employment agreement, separation agreement
  lease      — real-estate lease, sublease
  loan       — credit agreement, loan, term sheet for financing
  saas       — software/SaaS/vendor/supply agreement
  policy     — terms of service, privacy policy, EULA, internal policy
  other      — none of the above, or you cannot tell

Route decisions:
  deep-read   — substantive contract that warrants per-clause analysis (default for jv/nda/employment/lease/loan/saas with real terms)
  quick-scan  — routine / boilerplate / short policy doc; one synthesis pass is enough
  skip        — meeting agenda, empty template, junk file, duplicate, fragmentary text. Use SPARINGLY.

Confidence is 0.0-1.0. Be honest — if the type is unclear, say "other" with a low confidence. Do not invent.

Respond with the JSON object ONLY. No prose, no markdown fences.`;

// ── Local Ollama call (preferred path) ─────────────────────────────────

interface OllamaSettings {
  baseUrl: string;
  modelName: string;
  timeoutMs: number;
}

function localOllamaSettings(): OllamaSettings | null {
  const modelName =
    config.claw.localAnalysisModel ||
    config.claw.localModel ||
    config.local.defaultModel;
  if (!modelName) return null;
  const baseUrl = (config.claw.localModelUrl || config.local.baseUrl).replace(/\/$/, '');
  // Watchman is small and fast — keep the timeout tight so a hung Ollama
  // doesn't block the entire pipeline.
  const timeoutMs = config.claw.watchmanTimeoutMs;
  return { baseUrl, modelName, timeoutMs };
}

async function callOllamaWatchman(
  cfg: OllamaSettings,
  systemPrompt: string,
  userMessage: string,
): Promise<string> {
  const response = await fetch(`${cfg.baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: cfg.modelName,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.1,
      max_tokens: 400,
      // Force structured JSON. Ollama's OpenAI-compat layer accepts this.
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(cfg.timeoutMs),
  });
  if (!response.ok) {
    const txt = await response.text().catch(() => '');
    throw new Error(`Watchman local model returned ${response.status}: ${txt.slice(0, 200)}`);
  }
  const data = await response.json() as { choices?: Array<{ message: { content: string } }> };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Watchman local model returned empty response');
  return content;
}

// ── Cloud Haiku fallback ───────────────────────────────────────────────

async function callCloudWatchman(
  systemPrompt: string,
  userMessage: string,
): Promise<{ text: string; cost: number }> {
  const { text, cost } = await crossProviderChat({
    system: systemPrompt,
    user: userMessage,
    tier: 'haiku',
    maxTokens: 400,
    timeoutMs: 60_000,
  });
  return { text, cost };
}

// ── JSON parsing ───────────────────────────────────────────────────────

function safeJsonParse(content: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(content);
    return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : null;
  } catch { /* try fallbacks */ }
  // Markdown-fenced JSON
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    try {
      const parsed = JSON.parse(fenced[1]);
      return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : null;
    } catch { /* try last fallback */ }
  }
  // First balanced object
  const obj = content.match(/\{[\s\S]*\}/);
  if (obj) {
    try {
      const parsed = JSON.parse(obj[0]);
      return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : null;
    } catch { /* fall through */ }
  }
  return null;
}

// ── Validation ─────────────────────────────────────────────────────────

const VALID_TYPES: WatchmanDocumentType[] = [
  'jv', 'nda', 'employment', 'lease', 'loan', 'saas', 'policy', 'other',
];
const VALID_ROUTES: WatchmanRoute[] = ['skip', 'quick-scan', 'deep-read'];
const VALID_URGENCY = ['routine', 'elevated', 'critical'] as const;

function validateType(s: unknown): WatchmanDocumentType {
  return typeof s === 'string' && (VALID_TYPES as string[]).includes(s)
    ? (s as WatchmanDocumentType)
    : 'other';
}

function validateRoute(s: unknown): WatchmanRoute {
  return typeof s === 'string' && (VALID_ROUTES as string[]).includes(s)
    ? (s as WatchmanRoute)
    : 'deep-read';
}

function validateUrgency(s: unknown): 'routine' | 'elevated' | 'critical' {
  return typeof s === 'string' && (VALID_URGENCY as readonly string[]).includes(s)
    ? (s as 'routine' | 'elevated' | 'critical')
    : 'routine';
}

function clampConfidence(n: unknown): number {
  if (typeof n !== 'number' || isNaN(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

// ── Heuristic fallback (no LLM) ────────────────────────────────────────

/**
 * Last-resort classifier. Used when both local and cloud LLM paths fail —
 * the daemon stays useful even if Ollama is down and the API key expired.
 */
function heuristicWatchman(
  filename: string,
  documentText: string,
): Omit<WatchmanResult, 'method' | 'costUsd'> {
  const lower = filename.toLowerCase();
  const head = documentText.slice(0, 2000).toLowerCase();

  const has = (term: string) => lower.includes(term) || head.includes(term);

  let docType: WatchmanDocumentType = 'other';
  if (has('joint venture') || has('shareholders agreement') || lower.includes('jv')) docType = 'jv';
  else if (has('non-disclosure') || has('confidentiality agreement') || lower.includes('nda')) docType = 'nda';
  else if (has('offer letter') || has('employment agreement') || has('employment contract')) docType = 'employment';
  else if (has('lease agreement') || has('sublease')) docType = 'lease';
  else if (has('credit agreement') || has('loan agreement') || has('term sheet')) docType = 'loan';
  else if (has('subscription agreement') || has('saas') || has('master services agreement') || has('msa')) docType = 'saas';
  else if (has('terms of service') || has('privacy policy') || has('eula') || has('terms of use')) docType = 'policy';

  // Skip heuristics — soft skip only obviously-not-a-contract files
  let route: WatchmanRoute = 'deep-read';
  if (documentText.length < 400) route = 'skip';
  else if (lower.includes('agenda') || lower.includes('minutes') || lower.includes('memo-internal')) route = 'skip';
  else if (docType === 'policy' || docType === 'other') route = 'quick-scan';

  // Cheap jurisdiction guess
  let jurisdiction = '';
  for (const j of ['NSW', 'Victoria', 'England', 'Delaware', 'New York', 'California', 'EU', 'Finland', 'UK']) {
    if (head.includes(j.toLowerCase()) || filename.includes(j)) { jurisdiction = j; break; }
  }

  return {
    documentType: docType,
    jurisdiction,
    confidence: 0.35, // heuristic — never claim high confidence
    urgency: 'routine',
    route,
    readerTemplate: docType,
    rationale: `Heuristic classification (LLM unavailable): filename + opening text scan.`,
  };
}

// ── Public API ─────────────────────────────────────────────────────────

export interface WatchmanInput {
  filename: string;
  documentText: string;
  profile: ClawProfile;
  /** Optional: short list of precedent pattern names already known for similar
   *  filenames. Helps the Watchman recognize a recurrent doc type. */
  knownPrecedentHints?: string[];
  /**
   * Privacy guarantee: when true, NEVER fall through to the cloud LLM, even
   * if local Ollama is unavailable. Required for confidential documents and
   * for users who set `profile.processing = 'local'`. The fallback chain
   * becomes: local Ollama → heuristic (cloud is skipped entirely).
   *
   * The processor sets this to true whenever the document would be routed
   * locally anyway — that way a confidential doc's first 1500 chars + the
   * client profile never leave the machine, even during triage.
   */
  localOnly?: boolean;
}

/**
 * Triage a document. Local-first, cloud fallback, heuristic last resort.
 * Always returns a usable result — never throws.
 *
 * Privacy: when `input.localOnly === true`, the cloud-Haiku fallback is
 * skipped. This is the required setting for confidential documents and
 * for the `processing: 'local'` mode.
 */
export async function watchmanTriage(input: WatchmanInput): Promise<WatchmanResult> {
  const { filename, documentText, profile, knownPrecedentHints, localOnly } = input;

  // Visual section dividers so the small model doesn't conflate the client
  // block (stance) with the document text (facts). Jurisdiction in particular
  // is at risk of profile contamination — see v2 eval where gemma2:2b
  // leaked "NSW" into 2/3 documents' jurisdiction fields.
  const clientBlock = [
    '=== CLIENT (the reviewer\'s home context — DO NOT copy into jurisdiction) ===',
    `Company name: ${profile.company}`,
    `Client's industry: ${profile.industry}`,
    `Client's home jurisdiction: ${profile.jurisdiction}`,
    profile.concerns.length ? `Client's stated concerns: ${profile.concerns.join(', ')}` : '',
    knownPrecedentHints && knownPrecedentHints.length
      ? `Prior patterns seen on similar docs: ${knownPrecedentHints.slice(0, 3).join(' · ')}`
      : '',
  ].filter(Boolean).join('\n');

  const userMessage = [
    `FILENAME: ${filename}`,
    '',
    clientBlock,
    '',
    '=== DOCUMENT TEXT (the source of facts — jurisdiction comes FROM HERE) ===',
    documentText.slice(0, 1500),
    '=== END DOCUMENT TEXT ===',
    '',
    'Return your JSON triage decision now. Jurisdiction must come from DOCUMENT TEXT above, never from CLIENT.',
  ].join('\n');

  // Path 1: local Ollama (preferred — free, private)
  const local = localOllamaSettings();
  if (local) {
    try {
      const raw = await callOllamaWatchman(local, WATCHMAN_PROMPT, userMessage);
      const parsed = safeJsonParse(raw);
      if (parsed) {
        return assembleResult(parsed, 'llm-local', 0);
      }
      logger.warn('Watchman local: malformed JSON, trying cloud', { filename });
    } catch (err) {
      logger.warn('Watchman local failed, trying cloud', {
        filename,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Path 2: cloud Haiku — SKIPPED in localOnly mode (privacy guarantee).
  // For confidential docs and processing='local', the document content must
  // never leave the machine. We jump straight to the heuristic instead.
  if (!localOnly) {
    try {
      const { text, cost } = await callCloudWatchman(WATCHMAN_PROMPT, userMessage);
      const parsed = safeJsonParse(text);
      if (parsed) {
        return assembleResult(parsed, 'llm-cloud', cost);
      }
      logger.warn('Watchman cloud: malformed JSON, falling back to heuristic', { filename });
    } catch (err) {
      logger.warn('Watchman cloud failed, falling back to heuristic', {
        filename,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  } else if (local) {
    // Local-only mode AND local model failed above — log the privacy decision
    // explicitly so an operator inspecting daemon logs can see why we
    // skipped the cloud path.
    logger.info('Watchman local-only: cloud fallback suppressed for privacy', { filename });
  }

  // Path 3: heuristic — never fails
  const h = heuristicWatchman(filename, documentText);
  return { ...h, method: 'heuristic', costUsd: 0 };
}

function assembleResult(
  parsed: Record<string, unknown>,
  method: WatchmanResult['method'],
  costUsd: number,
): WatchmanResult {
  const docType = validateType(parsed.documentType);
  const route = validateRoute(parsed.route);
  return {
    documentType: docType,
    jurisdiction: typeof parsed.jurisdiction === 'string' ? parsed.jurisdiction.slice(0, 80) : '',
    confidence: clampConfidence(parsed.confidence),
    urgency: validateUrgency(parsed.urgency),
    route,
    // Default readerTemplate to documentType when the model omits it (it usually does)
    readerTemplate: typeof parsed.readerTemplate === 'string' && parsed.readerTemplate.length > 0
      ? path.basename(parsed.readerTemplate).slice(0, 40) // sanitize against path traversal
      : docType,
    rationale: typeof parsed.rationale === 'string' ? parsed.rationale.slice(0, 300) : '',
    method,
    costUsd,
  };
}

/**
 * Helper used by integration tests + sidecar bypass: build a result without
 * an LLM call, given known fields. Used when sidecar instructions exist.
 */
export function watchmanFromSidecar(documentType: WatchmanDocumentType, jurisdiction: string): WatchmanResult {
  return {
    documentType,
    jurisdiction,
    confidence: 1.0,
    urgency: 'routine',
    route: 'deep-read',
    readerTemplate: documentType,
    rationale: 'Sidecar instructions present — Watchman bypassed, deep-read forced.',
    method: 'sidecar',
    costUsd: 0,
  };
}
