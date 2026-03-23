/** Claw Mode — Hybrid Local+Frontier Analysis Pipeline. */

import { analyzeLocally } from './local-analysis.js';
import { anonymize, deanonymize } from './anonymize.js';
import { dispatch } from '../dispatch.js';
import { AutoApproveGateResolver } from '../gates/gate-resolver.js';
import type { LocalAnalysisResult, ClauseAnalysis, RiskItem } from './local-analysis.js';
import type { AnonymizationResult, EntityMapping } from './anonymize.js';
import type { ClawProfile, ClawConfig } from './types.js';
import type { ParsedDocument } from '../documents/types.js';
import type { LegalRequest } from '../types/index.js';
import type { SessionState } from '../session/session-state.js';

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
): Promise<HybridAnalysisResult> {
  // ── Step 1: Local triage ───────────────────────────────────────────────
  log(`[hybrid] Local triage: ${filename}`);
  const localResult = await analyzeLocally(documentText, filename, profile);

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

  // ── Step 4: Frontier dispatch ──────────────────────────────────────────
  let frontierSession: SessionState;
  try {
    const request: LegalRequest = {
      type: 'contract_review',
      documentPath: filename,
      requestText: `ANONYMIZED CLAUSE EXCERPTS FOR DEEP REVIEW:\n\n${anonymized.anonymizedText}\n\nThese clauses were flagged by initial analysis as requiring deeper review. Focus on: adversarial edge cases, hidden risks, ambiguous language, and legal reasoning the initial screen may have missed. Each clause is separated by ---. Provide specific findings for each.`,
      context: {
        moment: 'routine',
        audience: 'enterprise',
        jurisdiction: profile.jurisdiction as 'US' | 'EU' | 'UK' | 'CA' | 'AU',
      },
    };

    log(`[hybrid] Dispatching ${escalated.length} clauses to frontier (budget: $${(clawConfig.perDocBudget * 0.3).toFixed(2)}).`);

    frontierSession = await dispatch(request, {
      yoloMode: true,
      maxBudgetUsd: clawConfig.perDocBudget * 0.3,
      intensity: clawConfig.intensity,
      gateResolver: new AutoApproveGateResolver(),
    });
  } catch (err) {
    // Graceful degradation: return local-only findings
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

  // ── Step 5: De-anonymize frontier findings ─────────────────────────────
  const rawFrontierFindings = frontierSession.debate?.findings ?? [];
  const frontierFindings: HybridFinding[] = rawFrontierFindings.map(f => ({
    source: 'frontier' as const,
    severity: f.severity,
    title: f.findingType,
    content: deanonymize(f.content, anonymized.mappings),
    evidence: deanonymize(f.evidence.join('\n'), anonymized.mappings),
    confidence: f.confidence,
  }));

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
  const frontierUsd = frontierSession.accumulatedCost ?? 0;

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
