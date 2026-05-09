/** Claw Mode — Hybrid Local+Frontier Analysis Pipeline. */

import Anthropic from '@anthropic-ai/sdk';
import { analyzeLocally } from './local-analysis.js';
import { anonymize, deanonymize } from './anonymize.js';
import { ensureApiKey } from '../utils/ensure-api-key.js';
import type { LocalAnalysisResult, ClauseAnalysis, RiskItem } from './local-analysis.js';
import type { AnonymizationResult } from './anonymize.js';
import type { ClawProfile, ClawConfig } from './types.js';
import type { ParsedDocument } from '../documents/types.js';

// ── Result Types ─────────────────────────────────────────────────────────

/** A single finding from the hybrid pipeline, tagged with its source. */
export interface HybridFinding {
  /** Where this finding originated. */
  source: 'local' | 'frontier' | 'both';
  /** Severity label (e.g. 'critical', 'major', 'minor', 'info', 'RED', 'YELLOW', 'GREEN'). */
  severity: string;
  /** Short title for the finding. */
  title: string;
  /** Detailed finding content. */
  content: string;
  /** Evidence or citation from the document. */
  evidence: string;
  /** Confidence score (0-1), when available. */
  confidence?: number;
}

/** Result of the hybrid local+frontier analysis pipeline. */
export interface HybridAnalysisResult {
  /** Merged findings from both local and frontier analysis. */
  findings: HybridFinding[];
  /** The raw local analysis result for reference. */
  localResult: LocalAnalysisResult;
  /** Cost breakdown. */
  cost: { localUsd: number; frontierUsd: number; totalUsd: number };
  /** How many clauses were escalated to frontier. */
  frontierClauseCount: number;
  /** Total clauses found by local analysis. */
  totalClauseCount: number;
  /** Number of entities anonymized before frontier dispatch. */
  entityCount: number;
  /** Human-readable note about what happened. */
  processingNote: string;
}

// ── Severity Classification ──────────────────────────────────────────────

const FRONTIER_SEVERITIES = new Set(['major', 'critical', 'high', 'red']);

function needsFrontierReview(severity: string): boolean {
  return FRONTIER_SEVERITIES.has(severity.toLowerCase());
}

// ── Conversion Helpers ───────────────────────────────────────────────────

function clauseToFinding(clause: ClauseAnalysis, source: 'local' | 'both'): HybridFinding {
  return {
    source,
    severity: clause.severity,
    title: clause.title,
    content: clause.concern,
    evidence: clause.text,
  };
}

function riskToFinding(risk: RiskItem): HybridFinding {
  return {
    source: 'local',
    severity: risk.severity,
    title: risk.description,
    content: risk.description,
    evidence: risk.citation,
  };
}

// ── Main Pipeline ────────────────────────────────────────────────────────

/**
 * Run the hybrid local+frontier analysis pipeline.
 *
 * 1. Local model triages the document (free, on-device).
 * 2. Major/critical clauses are anonymized and sent to frontier for deep reasoning.
 * 3. Frontier results are de-anonymized and merged with local findings.
 *
 * If local analysis finds nothing severe, returns immediately (fast path).
 * If frontier dispatch fails, degrades gracefully to local-only results.
 *
 * @param documentText  Full document text
 * @param filename      Original filename
 * @param profile       Claw client profile
 * @param clawConfig    Claw runtime configuration
 * @param parsedDocument Parsed document with defined terms
 * @param log           Optional logger (defaults to console.log)
 */
export async function analyzeHybrid(
  documentText: string,
  filename: string,
  profile: ClawProfile,
  clawConfig: ClawConfig,
  parsedDocument: ParsedDocument,
  log: (msg: string) => void = console.log,
  /** Lighthouse Phase 2: forward Watchman + precedent board into local triage. */
  opts?: { watchman?: import('./types.js').WatchmanResult; precedentBoard?: import('./precedent-board.js').PrecedentBoard },
): Promise<HybridAnalysisResult> {
  // ── Step 1: Local triage ───────────────────────────────────────────────
  log(`[hybrid] Local triage: ${filename}`);
  const localResult = await analyzeLocally(documentText, filename, profile, log, opts);

  const totalClauseCount = localResult.clauses.length;

  // ── Step 2: Filter by severity ─────────────────────────────────────────
  const escalated: ClauseAnalysis[] = [];
  const localOnly: ClauseAnalysis[] = [];

  for (const clause of localResult.clauses) {
    if (needsFrontierReview(clause.severity)) {
      escalated.push(clause);
    } else {
      localOnly.push(clause);
    }
  }

  // Fast path: nothing needs frontier review
  if (escalated.length === 0) {
    log(`[hybrid] All findings low-severity. Skipping frontier.`);
    const findings: HybridFinding[] = [
      ...localResult.clauses.map(c => clauseToFinding(c, 'local')),
      ...localResult.risks.map(riskToFinding),
    ];

    return {
      findings,
      localResult,
      cost: { localUsd: 0, frontierUsd: 0, totalUsd: 0 },
      frontierClauseCount: 0,
      totalClauseCount,
      entityCount: 0,
      processingNote: 'All findings were low-severity. Local analysis sufficient.',
    };
  }

  log(`[hybrid] ${escalated.length}/${totalClauseCount} clauses escalated to frontier.`);

  // ── Step 3: Anonymize escalated clauses ────────────────────────────────
  const combinedText = escalated.map(c => c.text).join('\n\n---\n\n');
  const anonymized: AnonymizationResult = anonymize(combinedText, parsedDocument.definedTerms);
  const entityCount = anonymized.mappings.length;

  log(`[hybrid] Anonymized ${entityCount} entities.`);

  // ── Step 4: Frontier deep-analysis (direct Opus call, no MCP/Agent SDK) ──
  // Why direct API: dispatching the full agentic pipeline through MCP for
  // 18 anonymised clause excerpts is overkill, slow, and historically broke
  // (`mcpServer.listTools is not a function`). The anonymisation is already
  // done; what we need from the frontier is a strong, focused per-clause
  // analysis. A direct Opus call is cleaner, faster, and works.
  let frontierFindings: HybridFinding[] = [];
  let frontierUsd = 0;

  try {
    log(`[hybrid] Sending ${escalated.length} anonymised clauses to Opus 4.7 for deep review (budget cap: $${(clawConfig.perDocBudget * 0.3).toFixed(2)}).`);
    ensureApiKey();
    const client = new Anthropic();

    const system = `You are senior counsel performing a deep adversarial review of contract clauses flagged as elevated-risk by an initial automated triage. The clauses you receive have been anonymised — party names, dollar amounts, dates and identifiers have been replaced with stable placeholders. Analyse the clause as drafted, regardless of placeholders.

For each clause separated by '---' below, produce a JSON finding object with:
{
  "title": "string (1 short heading naming the clause)",
  "severity": "critical" | "major" | "minor",
  "content": "string — your analysis: what could go wrong, who is favoured, what counter-argument the other side will run, what an experienced senior partner would do about it. Reference defined terms / numbers / parties verbatim from the clause text.",
  "evidence": "string — the operative phrase from the clause that drives your concern (1-2 sentences, verbatim from the input)",
  "confidence": number   // 0.0-1.0
}

Output ONLY a JSON object of shape:
{
  "findings": [ <one object per clause analysed> ]
}

No commentary, no markdown, no code fences. JSON only.

Apply rigorous standards. Where Australian or NSW law canons of construction are relevant (penalty doctrine post-Andrews/Paciocco, good-faith implied terms post-Burger King/Macquarie, fiduciary exclusion post-Brian's case), apply them and cite the case shortly inside the "content" field.

If the clause is benign on a fair reading, mark it minor and say so concisely. Do not invent risks.`;

    const userMessage = `Client: ${profile.company} (${profile.jurisdiction}, ${profile.industry})
Client's role: 40% non-operator participant in this joint venture
Client's risk appetite: ${profile.preferences.riskAppetite}

ANONYMISED CLAUSES FOR DEEP REVIEW (one per '---'):

${anonymized.anonymizedText}`;

    const response = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 16_000,
      system,
      messages: [{ role: 'user', content: userMessage }],
    }, { timeout: 240_000, maxRetries: 1 });

    let raw = '';
    for (const block of response.content) {
      if (block.type === 'text') raw += block.text;
    }

    // Cost — Opus 4.7: $15/M input, $75/M output
    const inputT = response.usage?.input_tokens ?? 0;
    const outputT = response.usage?.output_tokens ?? 0;
    frontierUsd = (inputT * 15 / 1_000_000) + (outputT * 75 / 1_000_000);

    // Parse the findings — accept JSON object or fenced JSON
    const tryParse = (s: string): unknown => {
      try { return JSON.parse(s); } catch { /* fall through */ }
      const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenced) { try { return JSON.parse(fenced[1]); } catch { /* fall through */ } }
      const obj = s.match(/\{[\s\S]*\}/);
      if (obj) { try { return JSON.parse(obj[0]); } catch { /* fall through */ } }
      throw new Error('Frontier response was not parseable JSON');
    };

    const parsed = tryParse(raw) as { findings?: unknown };
    const rawFindings = Array.isArray(parsed.findings) ? parsed.findings : [];

    frontierFindings = rawFindings.map((f) => {
      const ff = f as Record<string, unknown>;
      return {
        source: 'frontier' as const,
        severity: typeof ff.severity === 'string' ? ff.severity : 'major',
        title: typeof ff.title === 'string' ? ff.title : 'Frontier finding',
        content: typeof ff.content === 'string' ? deanonymize(ff.content, anonymized.mappings) : '',
        evidence: typeof ff.evidence === 'string' ? deanonymize(ff.evidence, anonymized.mappings) : '',
        confidence: typeof ff.confidence === 'number' ? ff.confidence : undefined,
      };
    }).filter(f => f.content.length > 0);

    log(`[hybrid] Frontier produced ${frontierFindings.length} findings ($${frontierUsd.toFixed(4)}).`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`[hybrid] Frontier dispatch failed: ${message}. Returning local findings only.`);

    const findings: HybridFinding[] = [
      ...localResult.clauses.map(c => clauseToFinding(c, 'local')),
      ...localResult.risks.map(riskToFinding),
    ];

    return {
      findings,
      localResult,
      cost: { localUsd: 0, frontierUsd: 0, totalUsd: 0 },
      frontierClauseCount: escalated.length,
      totalClauseCount,
      entityCount,
      processingNote: 'Frontier analysis failed. Returning local findings only.',
    };
  }

  // ── Step 6: Merge findings ─────────────────────────────────────────────
  const mergedFindings: HybridFinding[] = [];

  // Local-only clauses (not escalated)
  for (const clause of localOnly) {
    mergedFindings.push(clauseToFinding(clause, 'local'));
  }

  // Escalated clauses: check if frontier produced a matching finding
  for (const clause of escalated) {
    const titleLower = clause.title.toLowerCase();
    const matchingFrontier = frontierFindings.find(
      ff => ff.content.toLowerCase().includes(titleLower) ||
            ff.evidence.toLowerCase().includes(titleLower),
    );

    if (matchingFrontier) {
      // Frontier has a richer analysis — use it, tag as 'both'
      mergedFindings.push({ ...matchingFrontier, source: 'both' });
      // Remove from frontier list so it's not added again
      const idx = frontierFindings.indexOf(matchingFrontier);
      if (idx !== -1) frontierFindings.splice(idx, 1);
    } else {
      // No frontier match — keep local finding
      mergedFindings.push(clauseToFinding(clause, 'local'));
    }
  }

  // Frontier-only findings (new issues the frontier found)
  for (const ff of frontierFindings) {
    mergedFindings.push(ff);
  }

  // Local risks → findings
  for (const risk of localResult.risks) {
    mergedFindings.push(riskToFinding(risk));
  }

  // ── Step 7: Cost ───────────────────────────────────────────────────────
  log(`[hybrid] Complete. ${mergedFindings.length} merged findings. Frontier cost: $${frontierUsd.toFixed(4)}.`);

  return {
    findings: mergedFindings,
    localResult,
    cost: { localUsd: 0, frontierUsd, totalUsd: frontierUsd },
    frontierClauseCount: escalated.length,
    totalClauseCount,
    entityCount,
    processingNote: `Hybrid analysis: ${escalated.length} of ${totalClauseCount} clauses escalated to frontier. ${entityCount} entities anonymized.`,
  };
}
