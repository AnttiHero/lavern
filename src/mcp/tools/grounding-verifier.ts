/**
 * Grounding Verifier — Mechanically cross-references finding evidence
 * against the actual parsed document.
 *
 * Zero LLM cost. Pure string matching. Answers the question:
 * "Did the agent cite things that actually exist in the document?"
 *
 * - Section references (Section 5.2, Clause 3, Article 12) checked against parsed structure
 * - Quoted text checked via substring match with fuzzy fallback
 * - Grounding score: matchedRefs / totalRefs (0.0-1.0)
 */

import { z } from 'zod';
import { tool } from '@anthropic-ai/claude-agent-sdk';
import type { SessionState } from '../../session/session-state.js';
import { flattenSections } from './document-reader.js';
import { eventTimestamp } from '../../events/event-bus.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('GROUNDING');

/** Regex to extract section references from evidence text. */
const SECTION_REF_RE = /(?:Section|Clause|Article|Paragraph|Part)\s+(\d+(?:\.\d+)*)/gi;

/** Extract quoted text (min 8 chars) from evidence strings. */
function extractQuotes(text: string): string[] {
  const matches: string[] = [];
  const re = /"([^"]{8,})"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    matches.push(m[1]);
  }
  // Also try single quotes
  const reSingle = /'([^']{8,})'/g;
  while ((m = reSingle.exec(text)) !== null) {
    matches.push(m[1]);
  }
  return matches;
}

/** Extract section reference numbers from evidence text. */
function extractSectionRefs(text: string): string[] {
  const refs: string[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(SECTION_REF_RE.source, SECTION_REF_RE.flags);
  while ((m = re.exec(text)) !== null) {
    refs.push(m[1]);
  }
  return refs;
}

/** Check if a section reference exists in the flattened sections. */
function sectionExists(ref: string, allText: string, sectionHeadings: string[]): boolean {
  // Check if the reference number appears in any heading
  for (const heading of sectionHeadings) {
    if (heading.includes(ref)) return true;
  }
  // Fallback: check raw text for "Section X" or "X." pattern
  const patterns = [
    new RegExp(`Section\\s+${ref.replace(/\./g, '\\.')}\\b`, 'i'),
    new RegExp(`Clause\\s+${ref.replace(/\./g, '\\.')}\\b`, 'i'),
    new RegExp(`Article\\s+${ref.replace(/\./g, '\\.')}\\b`, 'i'),
    new RegExp(`^${ref.replace(/\./g, '\\.')}[.\\s]`, 'm'),
  ];
  return patterns.some(p => p.test(allText));
}

/** Common legal boilerplate phrases that appear in many contracts. */
const COMMON_LEGAL_PHRASES = new Set([
  'shall not be liable',
  'to the fullest extent permitted by law',
  'without limitation',
  'including but not limited to',
  'in no event shall',
  'notwithstanding anything to the contrary',
  'subject to the terms and conditions',
  'representations and warranties',
  'indemnify and hold harmless',
  'governing law',
]);

/** Check if a quote is ONLY a common boilerplate phrase (case-insensitive).
 *  Exact match only — "shall not be liable for damages exceeding $1M"
 *  should NOT be flagged as boilerplate because it contains specific detail. */
function isBoilerplate(quote: string): boolean {
  const lower = quote.toLowerCase().trim();
  return COMMON_LEGAL_PHRASES.has(lower);
}

/** Max chars to search in the sliding window fallback (prevents O(n*m) DoS). */
const MAX_SEARCH_WINDOW = 10_000;

/** Calculate character overlap ratio between two strings. */
function charOverlap(a: string, b: string): number {
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();
  // Fast paths: exact substring match (O(n) via native includes)
  if (bLower.includes(aLower)) return 1.0;
  if (aLower.includes(bLower)) return 1.0;

  // For very long documents, narrow the search window around keyword matches
  let searchText = bLower;
  if (bLower.length > MAX_SEARCH_WINDOW) {
    const firstWord = aLower.split(/\s+/)[0];
    const idx = firstWord ? bLower.indexOf(firstWord) : -1;
    if (idx >= 0) {
      const windowStart = Math.max(0, idx - 2000);
      searchText = bLower.slice(windowStart, windowStart + MAX_SEARCH_WINDOW);
    } else {
      // First word not found anywhere — very unlikely to be a match
      return 0;
    }
  }

  // Sliding window: find best overlap of a within searchText
  const aChars = aLower.split('');
  let bestMatch = 0;
  for (let start = 0; start <= searchText.length - Math.floor(aChars.length * 0.5); start++) {
    let matched = 0;
    for (let i = 0; i < aChars.length && start + i < searchText.length; i++) {
      if (aChars[i] === searchText[start + i]) matched++;
    }
    bestMatch = Math.max(bestMatch, matched);
  }
  return aChars.length > 0 ? bestMatch / aChars.length : 0;
}

export interface EvidenceGroundingResult {
  evidenceText: string;
  sectionRefs: { ref: string; found: boolean }[];
  quotes: { quote: string; found: boolean; overlap: number }[];
  score: number;
}

export interface FindingGroundingResult {
  findingId: string;
  severity: string;
  evidenceResults: EvidenceGroundingResult[];
  overallScore: number;
}

/** Verify grounding for a single finding's evidence against the document. */
export function verifyFindingEvidence(
  evidence: string[],
  documentText: string,
  sectionHeadings: string[],
): EvidenceGroundingResult[] {
  return evidence.map(ev => {
    const sectionRefs = extractSectionRefs(ev);
    const quotes = extractQuotes(ev);

    const sectionResults = sectionRefs.map(ref => ({
      ref,
      found: sectionExists(ref, documentText, sectionHeadings),
    }));

    const quoteResults = quotes.map(quote => {
      const overlap = charOverlap(quote, documentText);
      const boilerplate = isBoilerplate(quote);
      return {
        quote: quote.slice(0, 80),
        // Boilerplate phrases found in the doc don't count as strong grounding
        // (they'd match any contract). Still mark as found but with reduced weight.
        found: overlap >= 0.8,
        overlap: Math.round(overlap * 100) / 100,
        boilerplate,
      };
    });

    const totalChecks = sectionResults.length + quoteResults.length;
    // Boilerplate quotes that match count as 0.5 instead of 1.0
    const matched = sectionResults.filter(r => r.found).length
      + quoteResults.filter(r => r.found).reduce((sum, r) => sum + (r.boilerplate ? 0.5 : 1.0), 0);

    return {
      evidenceText: ev.slice(0, 120),
      sectionRefs: sectionResults,
      quotes: quoteResults,
      score: totalChecks > 0 ? matched / totalChecks : 1.0, // No refs = assume grounded (general observation)
    };
  });
}

/** Create MCP tools for grounding verification. */
export function createGroundingVerifierTools(session: SessionState) {

  // Get combined document text and headings from ALL session documents
  function getDocumentContext(): { text: string; headings: string[] } {
    if (session.documents.length === 0) return { text: '', headings: [] };

    const textParts: string[] = [];
    const headings: string[] = [];
    for (const doc of session.documents) {
      textParts.push(doc.fullText ?? '');
      if (doc.sections) {
        for (const s of flattenSections(doc.sections)) {
          headings.push(s.heading ?? '');
        }
      }
    }
    return { text: textParts.join('\n\n'), headings };
  }

  const verifyFindingGrounding = tool(
    'verify_finding_grounding',
    'Mechanically verify that a finding\'s evidence citations exist in the source document. Checks section references (Section 5.2, Clause 3) and quoted text against the parsed document. Returns a grounding score (0.0-1.0). Zero LLM cost.',
    {
      finding_id: z.string().describe('The finding ID to verify (e.g., F-001)'),
    },
    async ({ finding_id }) => {
      const finding = session.debate.findings.find(f => f.id === finding_id);
      if (!finding) {
        return { content: [{ type: 'text' as const, text: `Finding ${finding_id} not found.` }] };
      }

      const { text, headings } = getDocumentContext();
      if (!text) {
        return { content: [{ type: 'text' as const, text: 'No parsed document available for grounding check.' }] };
      }

      const evidenceResults = verifyFindingEvidence(finding.evidence, text, headings);
      const overallScore = evidenceResults.length > 0
        ? evidenceResults.reduce((sum, r) => sum + r.score, 0) / evidenceResults.length
        : 1.0;

      // Store grounding score on the finding
      finding.groundingScore = Math.round(overallScore * 100) / 100;

      session.events.emitEvent({
        type: 'tool_used' as const,
        tool: 'verify_finding_grounding',
        agent: 'evaluator',
        timestamp: eventTimestamp(),
      });

      const lines = [
        `## Grounding Report: ${finding_id}`,
        `**Overall Score: ${(overallScore * 100).toFixed(0)}%**`,
        `**Severity:** ${finding.severity}`,
        '',
      ];

      for (const er of evidenceResults) {
        lines.push(`### Evidence: "${er.evidenceText}..."`);
        if (er.sectionRefs.length > 0) {
          lines.push('**Section references:**');
          for (const sr of er.sectionRefs) {
            lines.push(`- ${sr.ref}: ${sr.found ? 'FOUND' : 'NOT FOUND'}`);
          }
        }
        if (er.quotes.length > 0) {
          lines.push('**Quoted text:**');
          for (const qr of er.quotes) {
            lines.push(`- "${qr.quote}...": ${qr.found ? 'FOUND' : 'NOT FOUND'} (${(qr.overlap * 100).toFixed(0)}% overlap)`);
          }
        }
        lines.push(`**Evidence score:** ${(er.score * 100).toFixed(0)}%`);
        lines.push('');
      }

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    },
  );

  const verifyAllFindingsGrounding = tool(
    'verify_all_findings_grounding',
    'Batch-verify grounding for all findings on the debate board. Returns per-finding scores and an aggregate. Use before synthesis to identify weakly-grounded findings.',
    {
      min_severity: z.enum(['RED', 'YELLOW', 'GREEN']).optional()
        .describe('Only verify findings at or above this severity (default: all)'),
    },
    async ({ min_severity }) => {
      const { text, headings } = getDocumentContext();
      if (!text) {
        return { content: [{ type: 'text' as const, text: 'No parsed document available for grounding check.' }] };
      }

      const severityOrder = { RED: 3, YELLOW: 2, GREEN: 1 };
      const minSev = min_severity ? severityOrder[min_severity] : 0;

      const findings = session.debate.findings.filter(f =>
        severityOrder[f.severity] >= minSev
      );

      if (findings.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No findings to verify.' }] };
      }

      const results: FindingGroundingResult[] = [];

      for (const finding of findings) {
        const evidenceResults = verifyFindingEvidence(finding.evidence, text, headings);
        const overallScore = evidenceResults.length > 0
          ? evidenceResults.reduce((sum, r) => sum + r.score, 0) / evidenceResults.length
          : 1.0;

        finding.groundingScore = Math.round(overallScore * 100) / 100;

        results.push({
          findingId: finding.id,
          severity: finding.severity,
          evidenceResults,
          overallScore,
        });
      }

      const avgScore = results.reduce((s, r) => s + r.overallScore, 0) / results.length;
      const weaklyGrounded = results.filter(r => r.overallScore < 0.5);
      const wellGrounded = results.filter(r => r.overallScore >= 0.8);

      session.events.emitEvent({
        type: 'tool_used' as const,
        tool: 'verify_all_findings_grounding',
        agent: 'evaluator',
        timestamp: eventTimestamp(),
      });

      logger.info('Grounding verification complete', {
        total: results.length,
        avgScore: avgScore.toFixed(2),
        weaklyGrounded: weaklyGrounded.length,
        wellGrounded: wellGrounded.length,
      });

      const lines = [
        `## Grounding Verification Summary`,
        '',
        `**Findings verified:** ${results.length}`,
        `**Average grounding score:** ${(avgScore * 100).toFixed(0)}%`,
        `**Well-grounded (>80%):** ${wellGrounded.length}`,
        `**Weakly grounded (<50%):** ${weaklyGrounded.length}`,
        '',
        '### Per-Finding Scores',
        '',
        '| Finding | Severity | Score | Status |',
        '|---------|----------|-------|--------|',
      ];

      for (const r of results) {
        const status = r.overallScore >= 0.8 ? 'Well-grounded'
          : r.overallScore >= 0.5 ? 'Partial'
          : 'Weakly grounded';
        lines.push(`| ${r.findingId} | ${r.severity} | ${(r.overallScore * 100).toFixed(0)}% | ${status} |`);
      }

      if (weaklyGrounded.length > 0) {
        lines.push('');
        lines.push('### Weakly Grounded Findings (require review)');
        for (const wg of weaklyGrounded) {
          lines.push(`- **${wg.findingId}** (${wg.severity}): ${(wg.overallScore * 100).toFixed(0)}% grounded`);
          for (const er of wg.evidenceResults) {
            const missing = [
              ...er.sectionRefs.filter(r => !r.found).map(r => `Section ${r.ref}`),
              ...er.quotes.filter(r => !r.found).map(r => `"${r.quote.slice(0, 40)}..."`),
            ];
            if (missing.length > 0) {
              lines.push(`  - Not found: ${missing.join(', ')}`);
            }
          }
        }
      }

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    },
  );

  return [verifyFindingGrounding, verifyAllFindingsGrounding];
}
