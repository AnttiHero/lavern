/**
 * Unit Tests — Claw Planner (src/claw/planner.ts)
 *
 * Tests sensitivity pattern matching and default patterns.
 */

import { describe, it, expect } from 'vitest';
import {
  matchesSensitivityPattern,
  DEFAULT_SENSITIVITY_PATTERNS,
  estimateCost,
} from '../../src/claw/planner.js';
import type { DocumentEntry } from '../../src/claw/types.js';

describe('matchesSensitivityPattern', () => {
  const patterns = DEFAULT_SENSITIVITY_PATTERNS;

  it('matches *confidential* pattern', () => {
    expect(matchesSensitivityPattern('contract-confidential.pdf', patterns)).toBe('*confidential*');
    expect(matchesSensitivityPattern('CONFIDENTIAL_memo.docx', patterns)).toBe('*confidential*');
  });

  it('matches *privileged* pattern', () => {
    expect(matchesSensitivityPattern('privileged-communication.pdf', patterns)).toBe('*privileged*');
  });

  it('matches *merger* pattern', () => {
    expect(matchesSensitivityPattern('project-merger-draft.docx', patterns)).toBe('*merger*');
  });

  it('matches *attorney* pattern', () => {
    expect(matchesSensitivityPattern('attorney-client-letter.pdf', patterns)).toBe('*attorney*');
  });

  it('does not match normal filenames', () => {
    expect(matchesSensitivityPattern('contract.pdf', patterns)).toBeNull();
    expect(matchesSensitivityPattern('nda-review.docx', patterns)).toBeNull();
    expect(matchesSensitivityPattern('terms-of-service.md', patterns)).toBeNull();
  });

  it('is case-insensitive', () => {
    expect(matchesSensitivityPattern('CONFIDENTIAL_doc.pdf', patterns)).toBe('*confidential*');
    expect(matchesSensitivityPattern('Privileged_Report.docx', patterns)).toBe('*privileged*');
  });

  it('returns the first matching pattern', () => {
    // "confidential" matches before "attorney"
    const result = matchesSensitivityPattern('confidential.pdf', patterns);
    expect(result).toBe('*confidential*');
  });

  it('works with custom patterns', () => {
    const custom = ['*.secret.*', 'top-secret-*'];
    expect(matchesSensitivityPattern('doc.secret.pdf', custom)).toBe('*.secret.*');
    expect(matchesSensitivityPattern('top-secret-plan.txt', custom)).toBe('top-secret-*');
    expect(matchesSensitivityPattern('normal.pdf', custom)).toBeNull();
  });

  it('returns null for empty patterns array', () => {
    expect(matchesSensitivityPattern('confidential.pdf', [])).toBeNull();
  });

  it('handles exact filename patterns', () => {
    const exact = ['secret.pdf'];
    expect(matchesSensitivityPattern('secret.pdf', exact)).toBe('secret.pdf');
    expect(matchesSensitivityPattern('not-secret.pdf', exact)).toBeNull();
  });

  it('handles regex special characters in filenames safely', () => {
    // Filenames with regex chars shouldn't cause issues
    expect(matchesSensitivityPattern('doc(1).pdf', patterns)).toBeNull();
    expect(matchesSensitivityPattern('file[2].txt', patterns)).toBeNull();
    expect(matchesSensitivityPattern('report+summary.doc', patterns)).toBeNull();
  });
});

describe('DEFAULT_SENSITIVITY_PATTERNS', () => {
  it('covers the core sensitivity terms', () => {
    expect(DEFAULT_SENSITIVITY_PATTERNS).toContain('*confidential*');
    expect(DEFAULT_SENSITIVITY_PATTERNS).toContain('*privileged*');
    expect(DEFAULT_SENSITIVITY_PATTERNS).toContain('*merger*');
    expect(DEFAULT_SENSITIVITY_PATTERNS).toContain('*acquisition*');
    expect(DEFAULT_SENSITIVITY_PATTERNS).toContain('*litigation*');
    expect(DEFAULT_SENSITIVITY_PATTERNS).toContain('*attorney*');
    expect(DEFAULT_SENSITIVITY_PATTERNS).toContain('*counsel*');
  });

  it('has at least 5 patterns', () => {
    expect(DEFAULT_SENSITIVITY_PATTERNS.length).toBeGreaterThanOrEqual(5);
  });
});

describe('estimateCost', () => {
  function makeDoc(sizeBytes: number): DocumentEntry {
    return {
      path: '/test/doc.pdf', name: 'doc.pdf', type: 'NDA', hash: 'abc',
      sizeBytes, firstSeen: '', lastModified: '', status: 'new',
    };
  }

  it('returns minimum $0.10 for tiny documents', () => {
    expect(estimateCost(makeDoc(100), 'standard')).toBe(0.10);
  });

  it('scales with document size', () => {
    const small = estimateCost(makeDoc(50_000), 'standard');
    const large = estimateCost(makeDoc(200_000), 'standard');
    expect(large).toBeGreaterThan(small);
  });

  it('scales with intensity', () => {
    const doc = makeDoc(100_000);
    const quick = estimateCost(doc, 'quick');
    const standard = estimateCost(doc, 'standard');
    const thorough = estimateCost(doc, 'thorough');
    expect(quick).toBeLessThan(standard);
    expect(thorough).toBeGreaterThan(standard);
  });

  it('caps size multiplier at 5', () => {
    const huge = estimateCost(makeDoc(10_000_000), 'standard');
    const exactCap = estimateCost(makeDoc(512_000), 'standard'); // 512KB / 100KB = 5.12 → capped at 5
    // Both should be the same because size multiplier caps at 5
    expect(huge).toBe(exactCap);
    expect(huge).toBe(5);
  });
});
