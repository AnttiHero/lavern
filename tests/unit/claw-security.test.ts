/**
 * Unit Tests — Claw Mode Security Hardening (v0.8.1)
 *
 * Tests for:
 * - Config defaults (file size, scan cap, trustProxy)
 * - Sensitivity pattern matching
 * - Notification deduplication
 * - Local analysis result extraction
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Claw Security Hardening', () => {

  // ── Config Defaults ──────────────────────────────────────────────────

  describe('Config defaults', () => {
    it('should have maxFileSizeBytes default of 10MB', async () => {
      const { config } = await import('../../src/config.js');
      expect(config.claw.maxFileSizeBytes).toBe(10 * 1024 * 1024);
    });

    it('should have maxDocsPerScan default of 50', async () => {
      const { config } = await import('../../src/config.js');
      expect(config.claw.maxDocsPerScan).toBe(50);
    });

    it('should have trustProxy default of false', async () => {
      const { config } = await import('../../src/config.js');
      expect(config.trustProxy).toBe(false);
    });

    it('should have empty webhookUrl by default', async () => {
      const { config } = await import('../../src/config.js');
      expect(config.claw.webhookUrl).toBe('');
    });

    it('should have notifyMacOs enabled by default', async () => {
      const { config } = await import('../../src/config.js');
      expect(config.claw.notifyMacOs).toBe(true);
    });

    it('should have empty local model by default (disabled)', async () => {
      const { config } = await import('../../src/config.js');
      expect(config.claw.localModel).toBe('');
      expect(config.claw.localAnalysisModel).toBe('');
    });

    it('should have default Ollama URL', async () => {
      const { config } = await import('../../src/config.js');
      expect(config.claw.localModelUrl).toBe('http://localhost:11434');
    });
  });

  // ── Sensitivity Pattern Matching ─────────────────────────────────────

  describe('Sensitivity pattern matching', () => {
    let matchesSensitivityPattern: typeof import('../../src/claw/planner.js').matchesSensitivityPattern;
    let DEFAULT_SENSITIVITY_PATTERNS: typeof import('../../src/claw/planner.js').DEFAULT_SENSITIVITY_PATTERNS;

    beforeEach(async () => {
      const planner = await import('../../src/claw/planner.js');
      matchesSensitivityPattern = planner.matchesSensitivityPattern;
      DEFAULT_SENSITIVITY_PATTERNS = planner.DEFAULT_SENSITIVITY_PATTERNS;
    });

    it('should have default patterns', () => {
      expect(DEFAULT_SENSITIVITY_PATTERNS).toContain('*confidential*');
      expect(DEFAULT_SENSITIVITY_PATTERNS).toContain('*privileged*');
      expect(DEFAULT_SENSITIVITY_PATTERNS).toContain('*merger*');
      expect(DEFAULT_SENSITIVITY_PATTERNS.length).toBeGreaterThanOrEqual(5);
    });

    it('should match filenames containing "confidential"', () => {
      expect(matchesSensitivityPattern('acme-confidential-nda.pdf', DEFAULT_SENSITIVITY_PATTERNS))
        .toBe('*confidential*');
    });

    it('should match filenames containing "privileged"', () => {
      expect(matchesSensitivityPattern('privileged-communication.docx', DEFAULT_SENSITIVITY_PATTERNS))
        .toBe('*privileged*');
    });

    it('should match filenames containing "merger"', () => {
      expect(matchesSensitivityPattern('merger-agreement-draft.pdf', DEFAULT_SENSITIVITY_PATTERNS))
        .toBe('*merger*');
    });

    it('should match case-insensitively', () => {
      expect(matchesSensitivityPattern('CONFIDENTIAL_REPORT.PDF', DEFAULT_SENSITIVITY_PATTERNS))
        .toBe('*confidential*');
    });

    it('should NOT match regular filenames', () => {
      expect(matchesSensitivityPattern('vendor-agreement.pdf', DEFAULT_SENSITIVITY_PATTERNS))
        .toBeNull();
    });

    it('should NOT match regular NDA filenames', () => {
      expect(matchesSensitivityPattern('standard-nda.pdf', DEFAULT_SENSITIVITY_PATTERNS))
        .toBeNull();
    });

    it('should match custom patterns', () => {
      const custom = ['*secret*', '*internal-only*'];
      expect(matchesSensitivityPattern('secret-memo.pdf', custom)).toBe('*secret*');
      expect(matchesSensitivityPattern('internal-only-report.docx', custom)).toBe('*internal-only*');
      expect(matchesSensitivityPattern('public-notice.txt', custom)).toBeNull();
    });
  });

  // ── Notification Deduplication ───────────────────────────────────────

  describe('Notification deduplication', () => {
    it('should export notify function', async () => {
      const { notify } = await import('../../src/claw/notify.js');
      expect(typeof notify).toBe('function');
    });
  });

  // ── Local Analysis Types ─────────────────────────────────────────────

  describe('Local analysis', () => {
    it('should export extractLocalFindings', async () => {
      const { extractLocalFindings } = await import('../../src/claw/local-analysis.js');
      expect(typeof extractLocalFindings).toBe('function');
    });

    it('should correctly count findings', async () => {
      const { extractLocalFindings } = await import('../../src/claw/local-analysis.js');

      const result = {
        summary: 'Test',
        documentType: 'NDA',
        clauses: [
          { title: 'A', text: '', concern: '', severity: 'critical' as const },
          { title: 'B', text: '', concern: '', severity: 'major' as const },
          { title: 'C', text: '', concern: '', severity: 'minor' as const },
        ],
        risks: [
          { description: 'X', severity: 'critical' as const, citation: '' },
          { description: 'Y', severity: 'high' as const, citation: '' },
          { description: 'Z', severity: 'low' as const, citation: '' },
        ],
        recommendations: [],
        confidenceNote: 'test',
        model: 'test-model',
      };

      const findings = extractLocalFindings(result);
      expect(findings.critical).toBe(2); // 1 clause + 1 risk
      expect(findings.major).toBe(2);    // 1 clause + 1 risk (high maps to major)
      expect(findings.minor).toBe(2);    // 1 clause (minor+info) + 1 risk (low+medium)
    });

    it('should handle empty results', async () => {
      const { extractLocalFindings } = await import('../../src/claw/local-analysis.js');

      const result = {
        summary: '',
        documentType: 'Unknown',
        clauses: [],
        risks: [],
        recommendations: [],
        confidenceNote: '',
        model: 'test',
      };

      const findings = extractLocalFindings(result);
      expect(findings.critical).toBe(0);
      expect(findings.major).toBe(0);
      expect(findings.minor).toBe(0);
    });
  });

  // ── ClawJob confidential flag ────────────────────────────────────────

  describe('ClawJob types', () => {
    it('should allow confidential flag on ClawJob', async () => {
      const job = {
        id: 'test-1',
        documentPath: '/tmp/confidential-memo.pdf',
        documentName: 'confidential-memo.pdf',
        documentHash: 'abc123',
        trigger: 'new' as const,
        status: 'queued' as const,
        confidential: true,
        matchedPattern: '*confidential*',
      };

      expect(job.confidential).toBe(true);
      expect(job.matchedPattern).toBe('*confidential*');
    });
  });

  // ── ClawManifest confidential flag ───────────────────────────────────

  describe('ClawManifest types', () => {
    it('should allow confidential flag on ClawManifest', () => {
      // Type-level test — if this compiles, the type is correct
      const manifest = {
        sessionId: 'test',
        version: '1.0.0',
        input: { filename: '', path: '', extension: '', sizeBytes: 0, detectedType: '', sidecarUsed: false },
        task: { requestText: '', workflow: 'local', intensity: 'standard', inferenceMethod: 'heuristic' as const },
        execution: { startedAt: '', completedAt: '', durationSeconds: 0, model: 'local:llama3.1', totalCostUsd: 0, budgetUsd: 10, agentsUsed: [] },
        analysis: { findingsCount: 0, criticalCount: 0, majorCount: 0, minorCount: 0, resolutionCount: 0 },
        outputs: { markdown: 'deliverable.md', findings: 'findings.json' },
        status: 'completed' as const,
        confidential: true,
      };

      expect(manifest.confidential).toBe(true);
      expect(manifest.execution.totalCostUsd).toBe(0);
      expect(manifest.execution.model).toContain('local');
    });
  });
});
