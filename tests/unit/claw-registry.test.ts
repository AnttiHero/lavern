/**
 * Unit Tests — Document Registry helpers (src/claw/registry.ts)
 *
 * Tests document type inference from filenames. Important for
 * correct task routing in Claw mode.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// We can't easily test the class directly (requires filesystem),
// but we can test matchesSensitivityPattern from the planner.
import { matchesSensitivityPattern, DEFAULT_SENSITIVITY_PATTERNS } from '../../src/claw/planner.js';

describe('matchesSensitivityPattern', () => {
  it('matches *confidential* pattern', () => {
    expect(matchesSensitivityPattern('Project_Confidential_NDA.pdf', DEFAULT_SENSITIVITY_PATTERNS)).toBe('*confidential*');
    expect(matchesSensitivityPattern('CONFIDENTIAL-merger.docx', DEFAULT_SENSITIVITY_PATTERNS)).toBe('*confidential*');
  });

  it('matches *privileged* pattern', () => {
    expect(matchesSensitivityPattern('privileged-communication.txt', DEFAULT_SENSITIVITY_PATTERNS)).toBe('*privileged*');
  });

  it('matches *merger* pattern', () => {
    expect(matchesSensitivityPattern('merger-agreement-draft.pdf', DEFAULT_SENSITIVITY_PATTERNS)).toBe('*merger*');
  });

  it('matches *acquisition* pattern', () => {
    expect(matchesSensitivityPattern('acquisition-terms.docx', DEFAULT_SENSITIVITY_PATTERNS)).toBe('*acquisition*');
  });

  it('matches *litigation* pattern', () => {
    expect(matchesSensitivityPattern('litigation-hold-notice.pdf', DEFAULT_SENSITIVITY_PATTERNS)).toBe('*litigation*');
  });

  it('matches *attorney* pattern', () => {
    expect(matchesSensitivityPattern('attorney-client-memo.pdf', DEFAULT_SENSITIVITY_PATTERNS)).toBe('*attorney*');
  });

  it('matches *counsel* pattern', () => {
    expect(matchesSensitivityPattern('outside-counsel-guidelines.docx', DEFAULT_SENSITIVITY_PATTERNS)).toBe('*counsel*');
  });

  it('is case-insensitive', () => {
    expect(matchesSensitivityPattern('MERGER_REPORT.PDF', DEFAULT_SENSITIVITY_PATTERNS)).toBe('*merger*');
    expect(matchesSensitivityPattern('Confidential_Brief.docx', DEFAULT_SENSITIVITY_PATTERNS)).toBe('*confidential*');
  });

  it('returns null for non-sensitive filenames', () => {
    expect(matchesSensitivityPattern('employee-handbook.pdf', DEFAULT_SENSITIVITY_PATTERNS)).toBeNull();
    expect(matchesSensitivityPattern('terms-of-service.md', DEFAULT_SENSITIVITY_PATTERNS)).toBeNull();
    expect(matchesSensitivityPattern('readme.txt', DEFAULT_SENSITIVITY_PATTERNS)).toBeNull();
  });

  it('supports custom patterns', () => {
    const custom = ['*secret*', '*draft*'];
    expect(matchesSensitivityPattern('top-secret-plan.pdf', custom)).toBe('*secret*');
    expect(matchesSensitivityPattern('draft-nda.docx', custom)).toBe('*draft*');
    expect(matchesSensitivityPattern('final-nda.docx', custom)).toBeNull();
  });

  it('matches pattern at start/end of filename', () => {
    expect(matchesSensitivityPattern('confidential.pdf', DEFAULT_SENSITIVITY_PATTERNS)).toBe('*confidential*');
    expect(matchesSensitivityPattern('doc-privileged', DEFAULT_SENSITIVITY_PATTERNS)).toBe('*privileged*');
  });
});
