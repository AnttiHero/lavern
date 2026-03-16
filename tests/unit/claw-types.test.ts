/**
 * Unit Tests — Claw Types (src/claw/types.ts)
 *
 * Tests the shared helper that extracts finding severity counts
 * from session debate state. Used by processor.ts and delivery.ts.
 */

import { describe, it, expect } from 'vitest';
import { extractSessionFindings } from '../../src/claw/types.js';

describe('extractSessionFindings', () => {
  it('returns zeros for empty session', () => {
    const result = extractSessionFindings({});
    expect(result).toEqual({ critical: 0, major: 0, minor: 0 });
  });

  it('returns zeros for empty debate', () => {
    const result = extractSessionFindings({ debate: { findings: [] } });
    expect(result).toEqual({ critical: 0, major: 0, minor: 0 });
  });

  it('counts RED as critical', () => {
    const result = extractSessionFindings({
      debate: { findings: [{ severity: 'RED' }] },
    });
    expect(result.critical).toBe(1);
  });

  it('counts CRITICAL as critical', () => {
    const result = extractSessionFindings({
      debate: { findings: [{ severity: 'CRITICAL' }] },
    });
    expect(result.critical).toBe(1);
  });

  it('counts YELLOW as major', () => {
    const result = extractSessionFindings({
      debate: { findings: [{ severity: 'YELLOW' }] },
    });
    expect(result.major).toBe(1);
  });

  it('counts MAJOR as major', () => {
    const result = extractSessionFindings({
      debate: { findings: [{ severity: 'MAJOR' }] },
    });
    expect(result.major).toBe(1);
  });

  it('counts GREEN and other as minor', () => {
    const result = extractSessionFindings({
      debate: { findings: [{ severity: 'GREEN' }, { severity: 'LOW' }, { severity: 'INFO' }] },
    });
    expect(result.minor).toBe(3);
  });

  it('handles missing severity field', () => {
    const result = extractSessionFindings({
      debate: { findings: [{}] },
    });
    // Missing severity → empty string → minor
    expect(result.minor).toBe(1);
  });

  it('is case-insensitive', () => {
    const result = extractSessionFindings({
      debate: {
        findings: [
          { severity: 'red' },
          { severity: 'Yellow' },
          { severity: 'critical' },
        ],
      },
    });
    expect(result.critical).toBe(2);
    expect(result.major).toBe(1);
  });

  it('counts mixed severities correctly', () => {
    const result = extractSessionFindings({
      debate: {
        findings: [
          { severity: 'RED' },
          { severity: 'RED' },
          { severity: 'YELLOW' },
          { severity: 'YELLOW' },
          { severity: 'YELLOW' },
          { severity: 'GREEN' },
        ],
      },
    });
    expect(result).toEqual({ critical: 2, major: 3, minor: 1 });
  });

  it('falls back to verification results when no debate findings', () => {
    const result = extractSessionFindings({
      debate: { findings: [] },
      verificationResults: [
        { passed: true },
        { passed: false },
        { passed: false },
      ],
    });
    // Failed verifications count as critical
    expect(result.critical).toBe(2);
    expect(result.major).toBe(0);
    expect(result.minor).toBe(0);
  });

  it('ignores verification results when debate findings exist', () => {
    const result = extractSessionFindings({
      debate: { findings: [{ severity: 'GREEN' }] },
      verificationResults: [{ passed: false }, { passed: false }],
    });
    // Debate findings take priority — verification results ignored
    expect(result.critical).toBe(0);
    expect(result.minor).toBe(1);
  });

  it('handles undefined debate findings gracefully', () => {
    const result = extractSessionFindings({ debate: {} });
    expect(result).toEqual({ critical: 0, major: 0, minor: 0 });
  });
});
