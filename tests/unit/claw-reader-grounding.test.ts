/**
 * Unit Tests — Reader Grounding Pass (src/claw/local-analysis.ts)
 *
 * Lighthouse Phase 2: a deterministic grounding pass strips Reader-emitted
 * concerns whose claims cannot be anchored back to the clause text. This
 * is the local-only defence against hallucination — local Gemma sometimes
 * emits plausible-sounding concerns that reference numbers / clauses that
 * aren't in the document.
 *
 * The grounding pass is private inside local-analysis.ts. We test it
 * indirectly by mocking the Ollama per-clause response to emit:
 *   - one concern with a clear anchor (token + reference present in clause body)
 *   - one concern with a number/reference that does NOT appear in the body
 * and asserting:
 *   - the result.unanchoredStripped count reflects the unanchored concern
 *   - the synthesis-stage payload only sees the anchored concern
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { analyzeLocally } from '../../src/claw/local-analysis.js';
import type { ClawProfile, WatchmanResult } from '../../src/claw/types.js';

function makeProfile(): ClawProfile {
  return {
    company: 'Acme Holdings',
    jurisdiction: 'NSW',
    industry: 'mining',
    size: 'mid',
    concerns: ['penalty clauses'],
    preferences: { style: 'plain-language', intensity: 'standard', riskAppetite: 'conservative' },
    watchPaths: ['/tmp/test'],
    budget: { totalUsd: 100, perDocumentMaxUsd: 5 },
    processing: 'local',
    createdAt: new Date().toISOString(),
  };
}

function makeWatchman(): WatchmanResult {
  return {
    documentType: 'jv',
    jurisdiction: 'NSW',
    confidence: 0.9,
    urgency: 'routine',
    route: 'deep-read',
    readerTemplate: 'jv',
    rationale: '',
    method: 'llm-local',
    costUsd: 0,
  };
}

afterEach(() => vi.restoreAllMocks());

describe('Reader · grounding pass', () => {
  it('strips concerns whose tokens do not appear in the clause body', async () => {
    // The clause discusses a $500,000 penalty in clause 2.
    // We have the model emit two concerns:
    //   (A) anchored — references "$500,000" + the text mentions cl 2
    //   (B) unanchored — references something else ($999 + cl 99) that the body doesn't contain
    const calls: number[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      calls.push(1);
      const isFirstCall = calls.length === 1;
      if (isFirstCall) {
        return new Response(JSON.stringify({
          choices: [{
            message: {
              content: JSON.stringify({
                clauseRiskSummary: 'Penalty exposure under cl 2.',
                operative_text: 'Acme shall pay liquidated damages of AUD 500,000 per week of delay.',
                concerns: [
                  {
                    // ANCHORED — uses "$500,000" which appears in body, plus references
                    text: 'Clause 2 imposes liquidated damages of AUD 500,000 per week — possibly unenforceable as penalty.',
                    severity: 'major',
                    references: ['AUD 500,000', 'cl 2'],
                  },
                  {
                    // UNANCHORED — mentions "$999" and "Clause 99" which are not in body,
                    // but text passes isSpecificConcern (has a number + clause ref)
                    text: 'Clause 99 references a $999 fee that may be problematic over 30 days.',
                    severity: 'minor',
                    references: [],
                  },
                ],
                favoursWhom: 'non-operator',
              }),
            },
          }],
        }), { status: 200 }) as unknown as Response;
      }
      // Synthesis call
      return new Response(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              summary: 'Penalty exposure on JV.',
              documentType: 'JV',
              topRisks: [{ description: 'Penalty risk', severity: 'high', citation: 'cl 2' }],
              recommendations: [],
            }),
          },
        }],
      }), { status: 200 }) as unknown as Response;
    });

    const docText =
      'JOINT VENTURE AGREEMENT\n\n' +
      '2. Penalty for Late Contribution\n' +
      'Acme shall pay liquidated damages of AUD 500,000 per week of delay, ' +
      'up to a maximum of AUD 5,000,000.\n'.padEnd(900, ' ');

    const result = await analyzeLocally(docText, 'jv.docx', makeProfile(), undefined,
      { watchman: makeWatchman() });

    // The unanchored concern must be stripped — count > 0
    expect(result.unanchoredStripped).toBeGreaterThanOrEqual(1);

    // The deliverable's clauses array reflects the FILTERED concerns.
    // The remaining concern should be the anchored one (has $500,000 in text).
    const clause = result.clauses[0];
    expect(clause).toBeDefined();
    expect(clause.concern.toLowerCase()).toContain('500,000');
    // The unanchored concern's text ("$999 fee", "Clause 99") must not have
    // become the surviving "concern" string.
    expect(clause.concern).not.toContain('999');
    expect(clause.concern).not.toContain('Clause 99');
  });

  it('does not strip concerns when their references appear in the clause body', async () => {
    // Both concerns in this case use references that ARE in the body.
    const calls: number[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      calls.push(1);
      if (calls.length === 1) {
        return new Response(JSON.stringify({
          choices: [{
            message: {
              content: JSON.stringify({
                clauseRiskSummary: 'Multiple risks.',
                operative_text: 'Acme shall pay liquidated damages of AUD 500,000 per week of delay over 30 days.',
                concerns: [
                  {
                    text: 'Clause 2 imposes AUD 500,000 weekly penalty over 30 days.',
                    severity: 'major',
                    references: ['AUD 500,000'],
                  },
                  {
                    text: 'Clause 2 ramps to maximum AUD 5,000,000 over 30 days.',
                    severity: 'major',
                    references: ['AUD 5,000,000', '30 days'],
                  },
                ],
                favoursWhom: 'non-operator',
              }),
            },
          }],
        }), { status: 200 }) as unknown as Response;
      }
      return new Response(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              summary: 'OK', documentType: 'JV',
              topRisks: [{ description: 'P', severity: 'high', citation: 'cl 2' }],
              recommendations: [],
            }),
          },
        }],
      }), { status: 200 }) as unknown as Response;
    });

    const docText =
      'JOINT VENTURE AGREEMENT\n\n' +
      '2. Penalty\n' +
      'Acme shall pay liquidated damages of AUD 500,000 per week of delay, ' +
      'up to a maximum of AUD 5,000,000 over 30 days.\n'.padEnd(900, ' ');

    const result = await analyzeLocally(docText, 'jv.docx', makeProfile(), undefined,
      { watchman: makeWatchman() });

    // Both concerns are anchored — none stripped
    expect(result.unanchoredStripped ?? 0).toBe(0);
  });

  it('strips ALL concerns when none can be anchored (and result still ships gracefully)', async () => {
    const calls: number[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      calls.push(1);
      if (calls.length === 1) {
        return new Response(JSON.stringify({
          choices: [{
            message: {
              content: JSON.stringify({
                clauseRiskSummary: 'Generic concerns.',
                operative_text: 'The Parties shall act in good faith.',
                concerns: [
                  {
                    text: 'Clause 99 imposes $1,000,000 over 365 days — way out of scope.',
                    severity: 'major',
                    references: [],
                  },
                  {
                    text: 'Section 42 references a 50% discount that is missing.',
                    severity: 'minor',
                    references: [],
                  },
                ],
                favoursWhom: 'neutral',
              }),
            },
          }],
        }), { status: 200 }) as unknown as Response;
      }
      return new Response(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              summary: 'No anchored concerns — quiet clause.',
              documentType: 'JV',
              topRisks: [],
              recommendations: [],
            }),
          },
        }],
      }), { status: 200 }) as unknown as Response;
    });

    const docText =
      'JOINT VENTURE AGREEMENT\n\n' +
      '1. Good Faith\n' +
      'The Parties shall act in good faith.\n'.padEnd(900, ' ');

    const result = await analyzeLocally(docText, 'jv.docx', makeProfile(), undefined,
      { watchman: makeWatchman() });

    // All concerns stripped
    expect(result.unanchoredStripped).toBeGreaterThanOrEqual(2);
    // The result still has a usable shape
    expect(result.summary).toBeTruthy();
    expect(result.clauses.length).toBeGreaterThan(0);
  });
});
