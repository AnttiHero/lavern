/**
 * Verification Pipeline Types — The 10-pass quality verification system.
 *
 * Used by both standalone verification (upload any document) and
 * post-production verification (after Lavern transforms a document).
 *
 * Every finding has severity, location, evidence, and optionally
 * a suggestion + auto-fixable flag for remediation.
 */

import { z } from 'zod';

// ── Pass Names ───────────────────────────────────────────────────────────

export const VERIFICATION_PASS_NAMES = [
  'context',
  'ux',
  'clarity',
  'structure',
  'accuracy',
  'completeness',
  'risk',
  'formatting',
  'legal_design',
  'delivery',
] as const;

export const VerificationPassName = z.enum(VERIFICATION_PASS_NAMES);
export type VerificationPassName = z.infer<typeof VerificationPassName>;

/** Human-readable labels for each pass. */
export const PASS_LABELS: Record<VerificationPassName, string> = {
  context: 'Context',
  ux: 'UX & Findability',
  clarity: 'Clarity & Readability',
  structure: 'Structure',
  accuracy: 'Accuracy',
  completeness: 'Completeness',
  risk: 'Risk & Ethics',
  formatting: 'Formatting',
  legal_design: 'Legal Design',
  delivery: 'Delivery',
};

/** Short descriptions shown during each pass. */
export const PASS_DESCRIPTIONS: Record<VerificationPassName, string> = {
  context: 'Briefing sufficiency, document type, jurisdiction, audience',
  ux: 'Table of contents, headings, navigation, section labels',
  clarity: 'Sentence length, passive voice, jargon density',
  structure: 'Heading hierarchy, numbering continuity, section flow',
  accuracy: 'Factual correctness, citations, jurisdictional accuracy',
  completeness: 'Missing clauses, coverage gaps, orphaned definitions',
  risk: 'Risk pricing, dark patterns, ethics violations',
  formatting: 'Cross-references, defined terms, numbering, typography',
  legal_design: 'Readability, Findability, Clarity, Visual Design, Ethics',
  delivery: 'Disclaimers, dual artifacts, metadata, packaging',
};

// ── Finding Severity ─────────────────────────────────────────────────────

export const FindingSeverity = z.enum(['critical', 'major', 'minor']);
export type FindingSeverity = z.infer<typeof FindingSeverity>;

// ── Verification Finding ─────────────────────────────────────────────────

export const VerificationFindingSchema = z.object({
  id: z.string(),
  pass: VerificationPassName,
  severity: FindingSeverity,
  location: z.string(),
  description: z.string(),
  evidence: z.string(),
  suggestion: z.string().optional(),
  autoFixable: z.boolean(),
  confidence: z.number().min(0).max(1),
});

export type VerificationFinding = z.infer<typeof VerificationFindingSchema>;

// ── Pass Status & Result ─────────────────────────────────────────────────

export type PassStatus = 'pending' | 'running' | 'complete';

export interface PassResult {
  pass: VerificationPassName;
  status: PassStatus;
  score: number;           // 0.0–1.0 normalized
  findings: VerificationFinding[];
  criticalCount: number;
  majorCount: number;
  minorCount: number;
  durationMs: number;
  timestamp: string;
}

// ── Verification Verdict ─────────────────────────────────────────────────

export type VerificationVerdict = 'PASS' | 'CONDITIONAL_PASS' | 'FAIL';

export type VerificationMode = 'standalone' | 'post_production';

// ── Verification Report ──────────────────────────────────────────────────

export interface VerificationReport {
  sessionId: string;
  documentName: string;
  mode: VerificationMode;
  verdict: VerificationVerdict;
  overallScore: number;    // Weighted average of pass scores
  passes: PassResult[];
  totalFindings: {
    critical: number;
    major: number;
    minor: number;
  };
  autoFixableCount: number;
  timestamp: string;
  durationMs: number;
}

// ── Pipeline State (stored on SessionState) ──────────────────────────────

export interface VerificationPipelineState {
  mode: VerificationMode;
  passes: PassResult[];
  findings: VerificationFinding[];
  findingCounter: number;
  report: VerificationReport | null;
  startedAt: string;
}

// ── Score Weights ────────────────────────────────────────────────────────

/** Weights for the overall score calculation. Sum = 1.0. */
export const PASS_WEIGHTS: Record<VerificationPassName, number> = {
  context: 0.05,
  ux: 0.10,
  clarity: 0.10,
  structure: 0.10,
  accuracy: 0.15,
  completeness: 0.15,
  risk: 0.10,
  formatting: 0.05,
  legal_design: 0.15,
  delivery: 0.05,
};

// ── Verdict Logic ────────────────────────────────────────────────────────

/**
 * Determine the verdict from aggregated pass results.
 * - PASS: 0 critical, ≤2 major, score ≥ 0.80
 * - CONDITIONAL_PASS: 0 critical, 3+ major or score 0.60–0.79
 * - FAIL: Any critical, or score < 0.60
 */
export function computeVerdict(
  totalCritical: number,
  totalMajor: number,
  overallScore: number,
): VerificationVerdict {
  if (totalCritical > 0 || overallScore < 0.60) return 'FAIL';
  if (totalMajor > 2 || overallScore < 0.80) return 'CONDITIONAL_PASS';
  return 'PASS';
}

/**
 * Calculate the weighted overall score from pass results.
 */
export function computeOverallScore(passes: PassResult[]): number {
  let weighted = 0;
  let totalWeight = 0;
  for (const pass of passes) {
    if (pass.status !== 'complete') continue;
    const w = PASS_WEIGHTS[pass.pass] ?? 0;
    weighted += pass.score * w;
    totalWeight += w;
  }
  return totalWeight > 0 ? weighted / totalWeight : 0;
}
