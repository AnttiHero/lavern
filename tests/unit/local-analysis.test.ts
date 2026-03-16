/**
 * Unit Tests — Local Analysis (src/claw/local-analysis.ts)
 *
 * Tests extractLocalFindings helper for severity mapping.
 */

import { describe, it, expect } from 'vitest';
import { extractLocalFindings, type LocalAnalysisResult } from '../../src/claw/local-analysis.js';

function makeResult(
  clauses: Array<{ severity: 'info' | 'minor' | 'major' | 'critical' }>,
  risks: Array<{ severity: 'low' | 'medium' | 'high' | 'critical' }>,
): LocalAnalysisResult {
  return {
    summary: 'Test',
    documentType: 'NDA',
    clauses: clauses.map((c, i) => ({
      title: `Clause ${i}`,
      text: 'text',
      concern: 'concern',
      severity: c.severity,
    })),
    risks: risks.map((r, i) => ({
      description: `Risk ${i}`,
      severity: r.severity,
      citation: 'cite',
    })),
    recommendations: [],
    confidenceNote: '',
    model: 'test',
  };
}

describe('extractLocalFindings', () => {
  it('returns zeros for empty result', () => {
    const result = makeResult([], []);
    expect(extractLocalFindings(result)).toEqual({ critical: 0, major: 0, minor: 0 });
  });

  it('counts critical clauses', () => {
    const result = makeResult([{ severity: 'critical' }], []);
    expect(extractLocalFindings(result).critical).toBe(1);
  });

  it('counts major clauses', () => {
    const result = makeResult([{ severity: 'major' }], []);
    expect(extractLocalFindings(result).major).toBe(1);
  });

  it('counts minor and info clauses as minor', () => {
    const result = makeResult([{ severity: 'minor' }, { severity: 'info' }], []);
    expect(extractLocalFindings(result).minor).toBe(2);
  });

  it('counts critical risks', () => {
    const result = makeResult([], [{ severity: 'critical' }]);
    expect(extractLocalFindings(result).critical).toBe(1);
  });

  it('counts high risks as major', () => {
    const result = makeResult([], [{ severity: 'high' }]);
    expect(extractLocalFindings(result).major).toBe(1);
  });

  it('counts medium and low risks as minor', () => {
    const result = makeResult([], [{ severity: 'medium' }, { severity: 'low' }]);
    expect(extractLocalFindings(result).minor).toBe(2);
  });

  it('combines clause and risk counts', () => {
    const result = makeResult(
      [{ severity: 'critical' }, { severity: 'major' }, { severity: 'minor' }],
      [{ severity: 'critical' }, { severity: 'high' }, { severity: 'low' }],
    );
    expect(extractLocalFindings(result)).toEqual({ critical: 2, major: 2, minor: 2 });
  });
});
