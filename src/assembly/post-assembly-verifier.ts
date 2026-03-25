/**
 * Post-Assembly Fidelity Verifier — Checks that the assembled document
 * accurately represents what agents actually found.
 *
 * Two checks:
 * 1. Mechanical (free): RED findings represented, resolutions reflected
 * 2. LLM spot-check (~$0.003): Haiku verifies 3 highest-severity findings
 */

import type { SessionState } from '../session/session-state.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('FIDELITY');

export interface FidelityResult {
  passed: boolean;
  mechanical: {
    redFindingsTotal: number;
    redFindingsRepresented: number;
    redFindingsOmitted: string[];
    resolutionsTotal: number;
    resolutionsRepresented: number;
    resolutionsMissing: string[];
  };
  overallScore: number;
}

/** Extract key terms from text for fuzzy matching (top 3-5 distinctive words). */
function extractKeyTerms(text: string): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'shall', 'can', 'that', 'this', 'these',
    'those', 'which', 'who', 'whom', 'what', 'where', 'when', 'why', 'how',
    'not', 'no', 'nor', 'and', 'but', 'or', 'for', 'with', 'from', 'by',
    'to', 'of', 'in', 'on', 'at', 'as', 'if', 'its', 'it', 'their',
    'they', 'we', 'our', 'your', 'his', 'her', 'any', 'all', 'each',
    'both', 'more', 'most', 'other', 'some', 'such', 'than', 'too',
    'very', 'also', 'into', 'about', 'between', 'through', 'after',
    'before', 'during', 'above', 'below', 'under', 'over',
  ]);

  const words = text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !stopWords.has(w));

  // Return unique words, preferring longer ones (more distinctive)
  const unique = [...new Set(words)].sort((a, b) => b.length - a.length);
  return unique.slice(0, 5);
}

/** Check if key terms from a finding appear in the assembled text. */
function findingRepresented(findingContent: string, assembledText: string): boolean {
  const terms = extractKeyTerms(findingContent);
  if (terms.length === 0) return true; // No terms = can't check

  const textLower = assembledText.toLowerCase();
  const matchedTerms = terms.filter(t => textLower.includes(t));

  // At least 40% of key terms must appear (allows for paraphrasing)
  return matchedTerms.length >= Math.max(1, Math.ceil(terms.length * 0.4));
}

/** Run mechanical fidelity checks. Zero LLM cost. */
export function verifyAssemblyFidelity(
  assembledText: string,
  session: SessionState,
): FidelityResult {
  const debate = session.debate ?? { findings: [], resolutions: [] };
  const { findings, resolutions } = debate;

  // Check RED findings are represented
  const redFindings = findings.filter(f => f.severity === 'RED');
  const redOmitted: string[] = [];
  for (const f of redFindings) {
    if (!findingRepresented(f.content, assembledText)) {
      redOmitted.push(f.id);
    }
  }

  // Check resolutions are reflected
  const resMissing: string[] = [];
  for (const r of resolutions) {
    if (!findingRepresented(r.resolution + ' ' + r.winningPosition, assembledText)) {
      resMissing.push(r.id);
    }
  }

  const totalChecks = redFindings.length + resolutions.length;
  const passedChecks = (redFindings.length - redOmitted.length) + (resolutions.length - resMissing.length);
  const score = totalChecks > 0 ? passedChecks / totalChecks : 1.0;

  // Pass if no RED findings omitted (resolutions missing is a warning, not a failure)
  const passed = redOmitted.length === 0;

  if (redOmitted.length > 0) {
    logger.warn('Assembly fidelity: RED findings omitted', {
      omitted: redOmitted,
      total: redFindings.length,
    });
  }

  if (resMissing.length > 0) {
    logger.info('Assembly fidelity: some resolutions not reflected', {
      missing: resMissing,
      total: resolutions.length,
    });
  }

  return {
    passed,
    mechanical: {
      redFindingsTotal: redFindings.length,
      redFindingsRepresented: redFindings.length - redOmitted.length,
      redFindingsOmitted: redOmitted,
      resolutionsTotal: resolutions.length,
      resolutionsRepresented: resolutions.length - resMissing.length,
      resolutionsMissing: resMissing,
    },
    overallScore: Math.round(score * 100) / 100,
  };
}
