/**
 * The Curator — cross-document intelligence (lighthouse persona 3).
 *
 * Runs on heartbeat, not per-document. The "lighthouse keeper": looks
 * across the portfolio of recent findings and the precedent board, and
 * decides three things each cycle:
 *
 *   1. Surface decision    — what (if anything) to push to the user
 *                            via notify.ts. Replaces today's hard-coded
 *                            threshold alerts ("X critical findings")
 *                            with portfolio-aware insights ("recurring
 *                            penalty-doctrine issue across 4 docs").
 *
 *   2. Re-read queue       — which documents look stale in light of
 *                            recently-added precedents. Flags them so
 *                            the existing scheduled re-review machinery
 *                            picks them up. (Phase 4 — separate pass.)
 *
 *   3. Consolidation       — which precedents have been seen N+ times
 *                            with consistent verdicts and should be
 *                            promoted from 'tentative' to 'confirmed'.
 *                            (Phase 5 — separate pass.)
 *
 * Each pass is one LLM call (or zero, if the heuristic gate decides
 * the LLM has nothing to evaluate). All passes use the local model
 * when available (zero cost).
 *
 * The Curator does NOT mutate registry state directly — it returns a
 * CuratorDecision; the heartbeat in index.ts consumes the decision
 * and acts on it.
 */

import { config } from '../config.js';
import { createLogger } from '../utils/logger.js';
import type { CuratorDecision, DocumentEntry, ClawProfile } from './types.js';
import type { PrecedentBoard } from './precedent-board.js';
import type { DocumentRegistry } from './registry.js';

const logger = createLogger('CLAW-CURATOR');

// ── Configuration ──────────────────────────────────────────────────────

/** How far back the Curator looks when deciding what to surface. */
const SURFACE_LOOKBACK_HOURS = config.claw.curatorSurfaceHours;

/** Threshold to promote a precedent from tentative to confirmed.
 *  Default 5; env-configurable per the architecture plan. */
export const CONFIRM_THRESHOLD = config.claw.precedentConfirmThreshold;

/** Minimum portfolio-level pattern recurrence before the Curator surfaces
 *  a "we see this across the portfolio" alert vs a per-doc threshold alert. */
const PORTFOLIO_PATTERN_MIN = 3;

// ── Helpers ────────────────────────────────────────────────────────────

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
  const timeoutMs = config.claw.curatorTimeoutMs;
  return { baseUrl, modelName, timeoutMs };
}

async function callOllama(
  cfg: OllamaSettings,
  systemPrompt: string,
  userMessage: string,
  maxTokens = 600,
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
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(cfg.timeoutMs),
  });
  if (!response.ok) {
    const txt = await response.text().catch(() => '');
    throw new Error(`Curator local model returned ${response.status}: ${txt.slice(0, 200)}`);
  }
  const data = await response.json() as { choices?: Array<{ message: { content: string } }> };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Curator local model returned empty response');
  return content;
}

function safeJsonParse(content: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(content);
    return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : null;
  } catch { /* fallthrough */ }
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    try {
      const parsed = JSON.parse(fenced[1]);
      return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : null;
    } catch { /* fallthrough */ }
  }
  const obj = content.match(/\{[\s\S]*\}/);
  if (obj) {
    try {
      const parsed = JSON.parse(obj[0]);
      return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : null;
    } catch { /* fallthrough */ }
  }
  return null;
}

// ── Surface-Decision Pass ──────────────────────────────────────────────

/**
 * Build a compact text summary of recent activity for the Curator.
 * Heuristic — no LLM. Returns null when nothing happened recently
 * (the surface-decision call is skipped entirely in that case, saving
 * an LLM call per heartbeat when the folder is quiet).
 */
function summarizeRecentActivity(
  registry: DocumentRegistry,
  lookbackHours: number,
): {
  text: string;
  docCount: number;
  totalCritical: number;
  totalMajor: number;
  recurringPatterns: Map<string, number>;
} | null {
  const state = registry.getState();
  const cutoff = Date.now() - lookbackHours * 60 * 60 * 1000;
  const recent: DocumentEntry[] = Object.values(state.documents).filter(d => {
    const ts = d.lastReviewed ? Date.parse(d.lastReviewed) : 0;
    return ts >= cutoff && (d.status === 'reviewed' || d.status === 'flagged');
  });

  if (recent.length === 0) return null;

  let totalCritical = 0;
  let totalMajor = 0;
  let totalMinor = 0;
  for (const d of recent) {
    totalCritical += d.findingsSummary?.critical ?? 0;
    totalMajor += d.findingsSummary?.major ?? 0;
    totalMinor += d.findingsSummary?.minor ?? 0;
  }

  // Pattern recurrence — count how often each document type appears.
  // Cheap proxy for "we see X across the portfolio."
  const typeCounts = new Map<string, number>();
  for (const d of recent) {
    const t = (d.type || 'unknown').toLowerCase();
    typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1);
  }

  const lines: string[] = [
    `Past ${lookbackHours}h activity (${recent.length} document${recent.length === 1 ? '' : 's'}):`,
    `  Findings: ${totalCritical} critical, ${totalMajor} major, ${totalMinor} minor`,
    '',
    'Per-document:',
  ];
  for (const d of recent.slice(0, 20)) {
    const f = d.findingsSummary;
    lines.push(
      `  - ${d.name} (${d.type}) → ${f?.critical ?? 0}c/${f?.major ?? 0}m/${f?.minor ?? 0}lo · status=${d.status}`,
    );
  }

  if (typeCounts.size > 0) {
    lines.push('', 'Document-type recurrence:');
    for (const [t, n] of [...typeCounts.entries()].sort((a, b) => b[1] - a[1])) {
      lines.push(`  ${t}: ${n} document${n === 1 ? '' : 's'}`);
    }
  }

  return {
    text: lines.join('\n'),
    docCount: recent.length,
    totalCritical,
    totalMajor,
    recurringPatterns: typeCounts,
  };
}

const SURFACE_DECISION_PROMPT = `You are the Curator of a legal AI lighthouse. Your job: decide whether to ping the user about recent activity, and if so, what to say.

You are looking at recent document-review activity across the portfolio. You do NOT see clause-level detail — only summary counts and document-type recurrence. The user has a noise-allergic inbox. Be sparing.

Default to silence. Emit a surface decision ONLY when:
  - There is at least one critical finding the user should know about, OR
  - There is a CROSS-DOCUMENT PATTERN worth flagging (same document type, same issue family, 3+ documents).

Output a single JSON object:
{
  "surface": boolean,
  "title": "string (≤ 80 chars, used as notification title)",
  "message": "string (≤ 280 chars, what the user actually sees)",
  "severity": "info" | "warning" | "critical",
  "rationale": "string (1 sentence — why you decided to surface or not)"
}

**CRITICAL — what NOT to do (anti-patterns that make the surface useless):**

❌ FORBIDDEN: Reciting the CLIENT'S CONCERNS verbatim. The user wrote those concerns; telling them back what they already wrote is noise, not insight.
   BAD:  "We've identified findings related to joint and several liability, capital call mechanics, and indemnification carve-outs."
   GOOD: "Same penalty-doctrine flag fired across 3 JV agreements this week — the firm may want a portfolio-level position on this."

❌ FORBIDDEN: Generic "review these documents" calls to action. The user knows they need to review them; they want to know WHICH ONE FIRST and WHY.
   BAD:  "Review these documents for potential implications."
   GOOD: "Bellrock JV has 2 criticals; recommend opening that one first."

❌ FORBIDDEN: Listing the client's industry, jurisdiction, or company name as if they were findings. Those are stance, not facts.

**What a good surface message looks like:**

It names the SPECIFIC ACROSS-DOCUMENT PATTERN you see in the activity data (not the generic concern list), or it names the SPECIFIC DOCUMENT with the most critical findings. One actionable sentence + optional second sentence with the count.

Examples of good messages:
  - "3 SaaS agreements this week share an unbounded-liability indemnity carve-out pattern — recommend portfolio position."
  - "Veoneer JV amendment has a survival-of-pre-closing-claims risk that warrants senior partner review."
  - "Two vendor MSAs reviewed today both flag the same auto-renewal trap on payment terms — pattern, not coincidence."

If you decide NOT to surface, set surface=false and the title/message/severity to empty/info; rationale is mandatory either way.

Respond with the JSON object only.`;

/**
 * Decide whether and what to surface to the user given recent activity.
 *
 * Heuristic gate runs first — if there's nothing meaningful in the
 * lookback window, returns no surface (and skips the LLM call entirely).
 *
 * Otherwise runs one LLM call to compose a portfolio-aware decision.
 */
async function surfaceDecisionPass(
  registry: DocumentRegistry,
  profile: ClawProfile,
): Promise<CuratorDecision['surface'] | undefined> {
  const summary = summarizeRecentActivity(registry, SURFACE_LOOKBACK_HOURS);
  if (!summary) return undefined; // quiet folder — nothing to say

  // If there are zero criticals and no portfolio pattern, stay silent.
  // Cheap exit BEFORE the LLM call.
  const hasPattern = [...summary.recurringPatterns.values()].some(n => n >= PORTFOLIO_PATTERN_MIN);
  if (summary.totalCritical === 0 && !hasPattern) return undefined;

  // LLM available? If not, fall back to a deterministic surface that's
  // better than today's threshold-only behavior (it includes the pattern).
  const local = localOllamaSettings();
  if (!local) {
    if (summary.totalCritical > 0) {
      return {
        title: `${summary.totalCritical} critical finding${summary.totalCritical === 1 ? '' : 's'} (past ${SURFACE_LOOKBACK_HOURS}h)`,
        message: `Across ${summary.docCount} document${summary.docCount === 1 ? '' : 's'} in the past ${SURFACE_LOOKBACK_HOURS}h: ${summary.totalCritical} critical, ${summary.totalMajor} major. Review the dashboard for details.`,
        severity: 'critical',
      };
    }
    if (hasPattern) {
      const [topType] = [...summary.recurringPatterns.entries()].sort((a, b) => b[1] - a[1])[0];
      const count = summary.recurringPatterns.get(topType) ?? 0;
      return {
        title: `Pattern across ${count} ${topType} documents`,
        message: `${count} ${topType} documents reviewed in the past ${SURFACE_LOOKBACK_HOURS}h. Recurring patterns may warrant portfolio-level review.`,
        severity: 'warning',
      };
    }
    return undefined;
  }

  // The client-context block is intentionally framed as "background only"
  // and listed AFTER the activity data. The model is told explicitly NOT
  // to recite the concerns. v2 eval showed gemma2:2b will repeat back the
  // entire concerns list as if it were the cross-document pattern.
  const userMessage = [
    '=== ACTIVITY DATA (this is what your surface decision must describe) ===',
    summary.text,
    '',
    '=== CLIENT BACKGROUND (use ONLY to set tone — do NOT paste concerns into the message) ===',
    `Risk appetite: ${profile.preferences.riskAppetite}`,
    `Background concerns the client has stated elsewhere (DO NOT recite these): ${profile.concerns.join('; ')}`,
    '',
    'Now produce your JSON surface decision. The message must describe what you see in the ACTIVITY DATA above, not the CLIENT BACKGROUND. Specifics over generics. Name documents and pattern types, not the concern list.',
  ].join('\n');

  try {
    const raw = await callOllama(local, SURFACE_DECISION_PROMPT, userMessage, 500);
    const parsed = safeJsonParse(raw);
    if (!parsed) {
      logger.warn('Curator surface: malformed JSON, suppressing');
      return undefined;
    }
    if (parsed.surface !== true) return undefined;

    const title = typeof parsed.title === 'string' ? parsed.title.slice(0, 120) : '';
    const message = typeof parsed.message === 'string' ? parsed.message.slice(0, 600) : '';
    const severity = parsed.severity === 'critical' || parsed.severity === 'warning' || parsed.severity === 'info'
      ? parsed.severity
      : 'info';
    if (!title || !message) return undefined;
    return { title, message, severity };
  } catch (err) {
    logger.warn('Curator surface failed', { error: err instanceof Error ? err.message : String(err) });
    return undefined;
  }
}

// ── Re-Read Queue Pass (Phase 4) ───────────────────────────────────────

/**
 * Identify documents whose prior conclusions look stale because precedents
 * matching their type/jurisdiction were added/changed recently.
 *
 * Heuristic-only for now — every document of type T whose last review
 * predates the last precedent-board change for T (within reason) is a
 * candidate. The full LLM-driven version (which reasons about clause-level
 * relevance) lands in a future iteration.
 */
function reReadQueuePass(
  registry: DocumentRegistry,
  precedentBoard: PrecedentBoard,
  maxQueueSize = 20,
): string[] {
  try {
    const state = registry.getState();
    const boardState = precedentBoard.getState();

    // Build a map: documentType → most recent precedent update timestamp
    const typeLatest = new Map<string, number>();
    for (const entry of Object.values(boardState.entries)) {
      if (entry.deprecated) continue;
      const lastActivity = entry.outcomes.length > 0
        ? entry.outcomes[entry.outcomes.length - 1].timestamp
        : entry.addedAt;
      const ts = Date.parse(lastActivity);
      if (isNaN(ts)) continue;
      const type = (entry.documentType || 'unknown').toLowerCase();
      typeLatest.set(type, Math.max(typeLatest.get(type) ?? 0, ts));
    }

    const queue: { hash: string; staleBy: number }[] = [];
    for (const doc of Object.values(state.documents)) {
      if (doc.status !== 'reviewed' && doc.status !== 'flagged') continue;
      if (!doc.lastReviewed) continue;
      const reviewedAt = Date.parse(doc.lastReviewed);
      if (isNaN(reviewedAt)) continue;
      const docType = (doc.type || 'unknown').toLowerCase();
      const latestForType = typeLatest.get(docType);
      if (!latestForType) continue;
      // Stale if precedents for this type updated AFTER this doc's last review.
      // 1-hour buffer to avoid re-reading a doc immediately after its own precedent index.
      if (latestForType > reviewedAt + 60 * 60 * 1000) {
        queue.push({ hash: doc.hash, staleBy: latestForType - reviewedAt });
      }
    }

    // Most-stale first, capped.
    queue.sort((a, b) => b.staleBy - a.staleBy);
    return queue.slice(0, maxQueueSize).map(q => q.hash);
  } catch (err) {
    logger.warn('Curator re-read queue failed', { error: err instanceof Error ? err.message : String(err) });
    return [];
  }
}

// ── Consolidation Pass (Phase 5) ───────────────────────────────────────

/**
 * Identify precedents that have been seen ≥ CONFIRM_THRESHOLD times with
 * consistent verdicts and should be promoted to 'confirmed' status.
 *
 * "Consistent verdicts" today means: every outcome has applied=true and
 * verificationPassed=true. The threshold is env-configurable. Once
 * 'confirmed', Reader prompts weight these precedents higher (Phase 5+).
 */
function consolidationPass(
  precedentBoard: PrecedentBoard,
): { promote: string[]; drift: string[] } {
  try {
    const state = precedentBoard.getState();
    const promote: string[] = [];
    const drift: string[] = [];

    for (const entry of Object.values(state.entries)) {
      if (entry.deprecated) continue;
      // Skip entries already confirmed (status field added in Phase 5 schema migration).
      const status = (entry as { status?: string }).status;
      if (status === 'confirmed') continue;

      const occurrences = entry.timesUsed;
      if (occurrences < CONFIRM_THRESHOLD) continue;

      const consistent = entry.outcomes.every(o => o.applied && o.verificationPassed);
      const negativeOutcomes = entry.outcomes.filter(o => !o.applied || !o.verificationPassed).length;

      if (consistent) {
        promote.push(entry.id);
      } else if (negativeOutcomes >= 2) {
        // Mixed signal — flag drift. Don't deprecate; the operator decides.
        drift.push(entry.id);
      }
    }

    return { promote, drift };
  } catch (err) {
    logger.warn('Curator consolidation failed', { error: err instanceof Error ? err.message : String(err) });
    return { promote: [], drift: [] };
  }
}

// ── Public Entry ───────────────────────────────────────────────────────

export interface CuratorRunOptions {
  registry: DocumentRegistry;
  precedentBoard: PrecedentBoard;
  profile: ClawProfile;
  /** Run consolidation? Default true; the heartbeat gates this to every
   *  Nth tick (e.g., every 12 heartbeats / ~6h) since it's not free. */
  doConsolidation?: boolean;
  /** Run re-read queue? Default true. */
  doReReadQueue?: boolean;
  /** Run surface decision? Default true. */
  doSurface?: boolean;
}

/**
 * Run the Curator's three passes and return a single CuratorDecision.
 * The heartbeat consumes the decision and acts on it.
 *
 * Soft-fail on every pass — Curator failures must never break the daemon.
 */
export async function runCurator(opts: CuratorRunOptions): Promise<CuratorDecision> {
  const { registry, precedentBoard, profile, doConsolidation = true, doReReadQueue = true, doSurface = true } = opts;

  const decision: CuratorDecision = {
    reReadQueue: [],
    promoteToConfirmed: [],
    driftDetected: [],
    requestFrontierEscalation: [],
  };

  if (doSurface) {
    try {
      decision.surface = await surfaceDecisionPass(registry, profile);
    } catch (err) {
      logger.warn('Surface pass failed', { error: err instanceof Error ? err.message : String(err) });
    }
  }

  if (doReReadQueue) {
    decision.reReadQueue = reReadQueuePass(registry, precedentBoard);
  }

  if (doConsolidation) {
    const { promote, drift } = consolidationPass(precedentBoard);
    decision.promoteToConfirmed = promote;
    decision.driftDetected = drift;
  }

  return decision;
}
