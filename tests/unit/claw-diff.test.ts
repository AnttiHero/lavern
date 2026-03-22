/**
 * Unit Tests — Claw Diff (src/claw/diff.ts)
 *
 * Tests change detection between consecutive reviews of the same document.
 */

import { describe, it, expect } from 'vitest';
import { computeDiff, type FindingRecord } from '../../src/claw/diff.js';

function makeFinding(overrides: Partial<FindingRecord> = {}): FindingRecord {
  return {
    id: 'F-001',
    category: 'contract-risk',
    severity: 'RED',
    content: 'Test finding content',
    evidence: ['Section 4.2: "Test evidence text"'],
    ...overrides,
  };
}

describe('computeDiff', () => {
  it('detects added findings (new in current, not in previous)', () => {
    const previous: FindingRecord[] = [];
    const current = [
      makeFinding({ id: 'F-001', evidence: ['Section 1: clause A'] }),
      makeFinding({ id: 'F-002', evidence: ['Section 2: clause B'] }),
    ];

    const diff = computeDiff(previous, current, 'prev-session');
    expect(diff.added).toHaveLength(2);
    expect(diff.resolved).toHaveLength(0);
    expect(diff.changed).toHaveLength(0);
    expect(diff.unchanged).toBe(0);
    expect(diff.previousSessionId).toBe('prev-session');
  });

  it('detects resolved findings (in previous, not in current)', () => {
    const previous = [
      makeFinding({ id: 'F-001', evidence: ['Section 1: clause A'] }),
      makeFinding({ id: 'F-002', evidence: ['Section 2: clause B'] }),
    ];
    const current: FindingRecord[] = [];

    const diff = computeDiff(previous, current, 'prev-session');
    expect(diff.added).toHaveLength(0);
    expect(diff.resolved).toHaveLength(2);
    expect(diff.unchanged).toBe(0);
  });

  it('detects changed severity (same evidence, different severity)', () => {
    const previous = [
      makeFinding({ id: 'F-001', severity: 'YELLOW', evidence: ['Section 4.2: liability cap'] }),
    ];
    const current = [
      makeFinding({ id: 'F-001', severity: 'RED', evidence: ['Section 4.2: liability cap'] }),
    ];

    const diff = computeDiff(previous, current, 'prev');
    expect(diff.changed).toHaveLength(1);
    expect(diff.changed[0].severity).toBe('RED');
    expect(diff.changed[0].previousSeverity).toBe('YELLOW');
    expect(diff.added).toHaveLength(0);
    expect(diff.resolved).toHaveLength(0);
    expect(diff.unchanged).toBe(0);
  });

  it('detects unchanged findings (same evidence, same severity)', () => {
    const finding = makeFinding({ evidence: ['Section 5: indemnification'] });
    const diff = computeDiff([finding], [finding], 'prev');

    expect(diff.unchanged).toBe(1);
    expect(diff.added).toHaveLength(0);
    expect(diff.resolved).toHaveLength(0);
    expect(diff.changed).toHaveLength(0);
  });

  it('handles mixed scenario: some added, some resolved, some unchanged', () => {
    const previous = [
      makeFinding({ id: 'F-001', category: 'contract-risk', evidence: ['Section 1: stays'] }),
      makeFinding({ id: 'F-002', category: 'contract-risk', evidence: ['Section 2: gets resolved'] }),
    ];
    const current = [
      makeFinding({ id: 'F-001', category: 'contract-risk', evidence: ['Section 1: stays'] }),
      makeFinding({ id: 'F-003', category: 'contract-risk', evidence: ['Section 3: new finding'] }),
    ];

    const diff = computeDiff(previous, current, 'prev');
    expect(diff.unchanged).toBe(1);
    expect(diff.resolved).toHaveLength(1);
    expect(diff.resolved[0].evidence[0]).toContain('Section 2');
    expect(diff.added).toHaveLength(1);
    expect(diff.added[0].evidence[0]).toContain('Section 3');
  });

  it('matches evidence case-insensitively', () => {
    const previous = [
      makeFinding({ evidence: ['Section 4.2: "Company SHALL indemnify"'] }),
    ];
    const current = [
      makeFinding({ evidence: ['Section 4.2: "company shall indemnify"'] }),
    ];

    const diff = computeDiff(previous, current, 'prev');
    expect(diff.unchanged).toBe(1);
    expect(diff.added).toHaveLength(0);
  });

  it('handles empty evidence gracefully', () => {
    const previous = [makeFinding({ evidence: [] })];
    const current = [makeFinding({ evidence: [] })];

    // Same category + same (empty) evidence → matched as unchanged
    const diff = computeDiff(previous, current, 'prev');
    expect(diff.unchanged).toBe(1);
    expect(diff.added).toHaveLength(0);
    expect(diff.resolved).toHaveLength(0);
  });

  it('returns correct previousSessionId', () => {
    const diff = computeDiff([], [], 'session-abc');
    expect(diff.previousSessionId).toBe('session-abc');
  });

  it('differentiates findings by category even with same evidence', () => {
    const previous = [
      makeFinding({ category: 'contract-risk', evidence: ['Section 4: clause'] }),
    ];
    const current = [
      makeFinding({ category: 'contract-deviation', evidence: ['Section 4: clause'] }),
    ];

    // Different category means different evidence key — treated as added + resolved
    const diff = computeDiff(previous, current, 'prev');
    expect(diff.added).toHaveLength(1);
    expect(diff.resolved).toHaveLength(1);
  });
});
