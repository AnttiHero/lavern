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

// ── DocumentRegistry retry methods ──────────────────────────────────────

import { DocumentRegistry } from '../../src/claw/registry.js';

describe('DocumentRegistry retryFailed / retryStale', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claw-registry-unit-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('retryFailed returns the count of reset documents', () => {
    const clawDir = path.join(tempDir, 'claw');
    const watchDir = path.join(tempDir, 'watch');
    fs.mkdirSync(clawDir);
    fs.mkdirSync(watchDir);

    fs.writeFileSync(path.join(watchDir, 'doc1.md'), '# Doc 1\nAlpha content.', 'utf-8');
    fs.writeFileSync(path.join(watchDir, 'doc2.md'), '# Doc 2\nBeta content.', 'utf-8');
    fs.writeFileSync(path.join(watchDir, 'doc3.md'), '# Doc 3\nGamma content.', 'utf-8');

    const registry = new DocumentRegistry(clawDir, 100);
    registry.scan([watchDir]);

    const docs = registry.getDocumentsByStatus('new');
    // Mark 2 out of 3 as error
    registry.markFailed(docs[0].hash, 'Error one');
    registry.markFailed(docs[1].hash, 'Error two');

    const count = registry.retryFailed();
    expect(count).toBe(2);
  });

  it('retryStale returns the count of reset documents', () => {
    const clawDir = path.join(tempDir, 'claw');
    const watchDir = path.join(tempDir, 'watch');
    fs.mkdirSync(clawDir);
    fs.mkdirSync(watchDir);

    const docPath = path.join(watchDir, 'evolving.md');
    fs.writeFileSync(docPath, 'Version 1 content', 'utf-8');

    const registry = new DocumentRegistry(clawDir, 100);
    registry.scan([watchDir]);

    // Mark as reviewed then modify to trigger stale
    const doc = registry.getDocumentByPath(docPath);
    registry.markReviewed(doc!.hash, 'sess', { critical: 0, major: 0, minor: 0 }, 1);

    fs.writeFileSync(docPath, 'Version 2 content', 'utf-8');
    registry.scan([watchDir]);

    const count = registry.retryStale();
    expect(count).toBe(1);
  });

  it('retryFailed returns 0 when there are no error documents', () => {
    const clawDir = path.join(tempDir, 'claw');
    const watchDir = path.join(tempDir, 'watch');
    fs.mkdirSync(clawDir);
    fs.mkdirSync(watchDir);

    fs.writeFileSync(path.join(watchDir, 'clean.md'), '# Clean\nNo errors here at all.', 'utf-8');

    const registry = new DocumentRegistry(clawDir, 100);
    registry.scan([watchDir]);

    // All docs are 'new', none in error state
    const count = registry.retryFailed();
    expect(count).toBe(0);
  });
});
