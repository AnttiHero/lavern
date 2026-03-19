/**
 * Integration Tests — Claw Mode Pipeline
 *
 * Exercises the core pipeline: registry → planner → delivery
 * WITHOUT making real API calls. The processor's dispatch() is
 * not called — we test the data flow between components.
 *
 * These tests use real temp directories and files, real DocumentRegistry
 * persistence, and real planner budget logic.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DocumentRegistry } from '../../src/claw/registry.js';
import { planWork, planSingleJob, matchesSensitivityPattern, DEFAULT_SENSITIVITY_PATTERNS } from '../../src/claw/planner.js';
import { ClawDelivery } from '../../src/claw/delivery.js';
import type { ClawConfig, ClawProfile } from '../../src/claw/types.js';
import type { IntensityLevel } from '../../src/types/engagement.js';
import type { DocumentStyle } from '../../src/assembly/format-converter.js';
import type { InferenceResult } from '../../src/claw/inference.js';
import type { SessionState } from '../../src/session/session-state.js';

// ── Helpers ──────────────────────────────────────────────────────────────

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'claw-pipeline-'));
}

function createTestFile(dir: string, name: string, content = '# Test\nSample content.'): string {
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

function createMockProfile(): ClawProfile {
  return {
    company: 'Test Corp',
    jurisdiction: 'US',
    industry: 'Technology',
    size: 'small',
    concerns: ['privacy', 'compliance'],
    preferences: {
      style: 'plain-language',
      intensity: 'standard' as IntensityLevel,
      riskAppetite: 'balanced',
    },
    watchPaths: [],
    budget: { totalUsd: 100, perDocumentMaxUsd: 50 },
    createdAt: new Date().toISOString(),
    // Empty array = no sensitivity patterns (avoids default patterns flagging test files)
    sensitivityPatterns: [],
  };
}

function createMockConfig(clawDir: string, overrides?: Partial<ClawConfig>): ClawConfig {
  return {
    dir: clawDir,
    profile: createMockProfile(),
    budget: 100,
    perDocBudget: 10,
    intensity: 'standard' as IntensityLevel,
    style: 'traditional' as DocumentStyle,
    formats: ['markdown'],
    scanIntervalMs: 5000,
    once: true,
    dryRun: false,
    debug: false,
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('Claw Mode Pipeline Integration', () => {
  let tempDir: string;
  let watchDir: string;
  let clawDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    watchDir = path.join(tempDir, 'watch');
    clawDir = path.join(tempDir, 'claw');
    fs.mkdirSync(watchDir);
    fs.mkdirSync(clawDir);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  // ── Registry → Planner ──────────────────────────────────────────────

  describe('Registry scan → Planner', () => {
    it('should discover new documents and plan jobs for them', () => {
      // Each file needs unique content to produce distinct SHA-256 hashes
      // (registry keys by hash — identical content would overwrite)
      createTestFile(watchDir, 'vendor-agreement.md', '# Vendor Agreement\nPayment terms apply.');
      createTestFile(watchDir, 'nda-template.md', '# NDA Template\nConfidentiality clause here.');

      const registry = new DocumentRegistry(clawDir, 100);
      const { newDocs, changedDocs } = registry.scan([watchDir]);

      expect(newDocs).toHaveLength(2);
      expect(changedDocs).toHaveLength(0);

      const config = createMockConfig(clawDir);
      const plan = planWork(registry, config);

      expect(plan.jobs).toHaveLength(2);
      expect(plan.jobs.every(j => j.trigger === 'new')).toBe(true);
      expect(plan.estimatedCostUsd).toBeGreaterThan(0);
    });

    it('should skip documents that exceed budget', () => {
      createTestFile(watchDir, 'contract-1.md', '# Contract One\nFirst party obligations.');
      createTestFile(watchDir, 'contract-2.md', '# Contract Two\nSecond party obligations.');

      // estimateCost returns ~$0.10 for tiny files.
      // $0.15 total budget fits exactly 1 doc ($0.10), leaving $0.05 for second.
      const registry = new DocumentRegistry(clawDir, 0.15);
      registry.scan([watchDir]);

      const config = createMockConfig(clawDir, { budget: 0.15, perDocBudget: 1 });
      const plan = planWork(registry, config);

      expect(plan.jobs).toHaveLength(1);
      expect(plan.skipped).toHaveLength(1);
      expect(plan.skipped[0].reason).toContain('budget');
    });

    it('should not re-plan already reviewed documents', () => {
      const docPath = createTestFile(watchDir, 'reviewed.md');

      const registry = new DocumentRegistry(clawDir, 100);
      registry.scan([watchDir]);

      // Mark as reviewed
      const doc = registry.getDocumentByPath(docPath);
      expect(doc).toBeDefined();
      registry.markReviewed(doc!.hash, 'session-1', { critical: 0, major: 0, minor: 0 }, 5);

      const config = createMockConfig(clawDir);
      const plan = planWork(registry, config);

      expect(plan.jobs).toHaveLength(0);
    });

    it('should detect changed documents after modification', () => {
      const docPath = createTestFile(watchDir, 'living-doc.md', 'Version 1');

      const registry = new DocumentRegistry(clawDir, 100);
      registry.scan([watchDir]);

      // Mark as reviewed
      const doc = registry.getDocumentByPath(docPath);
      registry.markReviewed(doc!.hash, 'session-1', { critical: 0, major: 0, minor: 0 }, 5);

      // Modify the file (changes the hash)
      fs.writeFileSync(docPath, 'Version 2 — significant changes', 'utf-8');
      const { changedDocs } = registry.scan([watchDir]);

      expect(changedDocs).toHaveLength(1);

      const config = createMockConfig(clawDir);
      const plan = planWork(registry, config);
      expect(plan.jobs.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Sensitivity Patterns in Pipeline ────────────────────────────────

  describe('Sensitivity patterns in pipeline', () => {
    it('should skip confidential documents when no local model is configured', () => {
      // When no local model is set (default), confidential docs are flagged
      // and skipped — they cannot be sent to the external API.
      createTestFile(watchDir, 'confidential-merger-draft.md', '# Merger Draft\nTarget acquisition details.');
      createTestFile(watchDir, 'regular-vendor-contract.md', '# Vendor Contract\nStandard service terms.');

      const registry = new DocumentRegistry(clawDir, 100);
      registry.scan([watchDir]);

      const config = createMockConfig(clawDir, {
        profile: {
          ...createMockProfile(),
          sensitivityPatterns: DEFAULT_SENSITIVITY_PATTERNS,
        },
      });

      const plan = planWork(registry, config);

      // Confidential doc should be skipped (flagged), not queued
      const confSkipped = plan.skipped.find(s => s.path.includes('confidential'));
      expect(confSkipped).toBeDefined();
      expect(confSkipped!.reason).toContain('sensitivity');

      // Regular doc should be planned normally
      const regJob = plan.jobs.find(j => j.documentName.includes('regular'));
      expect(regJob).toBeDefined();
      expect(regJob?.confidential).toBeUndefined();

      // Only 1 job (the regular doc)
      expect(plan.jobs).toHaveLength(1);
    });

    it('should detect sensitivity patterns on filenames', () => {
      // Direct test of the pattern matcher
      expect(matchesSensitivityPattern('confidential-memo.pdf', DEFAULT_SENSITIVITY_PATTERNS))
        .toBe('*confidential*');
      expect(matchesSensitivityPattern('merger-agreement.docx', DEFAULT_SENSITIVITY_PATTERNS))
        .toBe('*merger*');
      expect(matchesSensitivityPattern('regular-contract.pdf', DEFAULT_SENSITIVITY_PATTERNS))
        .toBeNull();
    });
  });

  // ── Single Job Planning ─────────────────────────────────────────────

  describe('planSingleJob', () => {
    it('should create a job for a valid document', () => {
      const docPath = createTestFile(watchDir, 'new-contract.md');
      const registry = new DocumentRegistry(clawDir, 100);
      const result = registry.indexFile(docPath);
      expect(result).toBe('new');

      const doc = registry.getDocumentByPath(docPath);
      const config = createMockConfig(clawDir);

      const job = planSingleJob(docPath, doc!.hash, 'new', registry, config);
      expect(job).not.toBeNull();
      expect(job!.documentPath).toBe(docPath);
      expect(job!.trigger).toBe('new');
    });

    it('should return null when budget is exhausted', () => {
      const docPath = createTestFile(watchDir, 'expensive.md');
      const registry = new DocumentRegistry(clawDir, 0.01); // Nearly no budget
      registry.indexFile(docPath);

      const doc = registry.getDocumentByPath(docPath);
      const config = createMockConfig(clawDir, { budget: 0.01, perDocBudget: 10 });

      const job = planSingleJob(docPath, doc!.hash, 'new', registry, config);
      expect(job).toBeNull();
    });
  });

  // ── Registry Persistence ────────────────────────────────────────────

  describe('Registry persistence', () => {
    it('should persist state.json and survive reload', () => {
      createTestFile(watchDir, 'persisted.md');

      const registry1 = new DocumentRegistry(clawDir, 100);
      registry1.scan([watchDir]);
      const doc = registry1.getDocumentByPath(path.join(watchDir, 'persisted.md'));
      registry1.markReviewed(doc!.hash, 'session-abc', { critical: 1, major: 2, minor: 3 }, 7.50);

      // Create new registry from same dir — should load persisted state
      const registry2 = new DocumentRegistry(clawDir, 100);
      const reloaded = registry2.getDocument(doc!.hash);

      expect(reloaded).toBeDefined();
      expect(reloaded!.status).toBe('flagged'); // critical > 0
      expect(reloaded!.lastReviewSession).toBe('session-abc');
      expect(reloaded!.findingsSummary).toEqual({ critical: 1, major: 2, minor: 3 });
      expect(reloaded!.costUsd).toBe(7.50);
    });

    it('should track confidential flag in persisted state', () => {
      createTestFile(watchDir, 'secret.md');

      const registry = new DocumentRegistry(clawDir, 100);
      registry.scan([watchDir]);
      const doc = registry.getDocumentByPath(path.join(watchDir, 'secret.md'));
      registry.markReviewed(doc!.hash, 'session-local', { critical: 0, major: 0, minor: 1 }, 0, true);

      // Reload
      const registry2 = new DocumentRegistry(clawDir, 100);
      const reloaded = registry2.getDocument(doc!.hash);

      expect(reloaded!.confidential).toBe(true);
      expect(reloaded!.costUsd).toBe(0);
    });

    it('should report correct summary with confidential/frontier split', () => {
      createTestFile(watchDir, 'local-doc.md', '# Local Document\nProcessed on-device.');
      createTestFile(watchDir, 'cloud-doc.md', '# Cloud Document\nProcessed via frontier model.');

      const registry = new DocumentRegistry(clawDir, 100);
      const { newDocs } = registry.scan([watchDir]);
      expect(newDocs).toHaveLength(2);

      // Get documents by their scanned paths (which may be resolved differently from createTestFile return)
      const allDocs = registry.getDocumentsByStatus('new');
      expect(allDocs).toHaveLength(2);

      // Mark first as confidential (local), second as frontier (cloud)
      registry.markReviewed(allDocs[0].hash, 'sess-1', { critical: 0, major: 0, minor: 0 }, 0, true);
      registry.markReviewed(allDocs[1].hash, 'sess-2', { critical: 0, major: 1, minor: 0 }, 5);

      const summary = registry.summary;
      expect(summary.confidential).toBe(1);
      expect(summary.frontier).toBe(1);
      expect(summary.total).toBe(2);
    });
  });

  // ── Delivery (Frontier) ──────────────────────────────────────────────

  describe('Delivery — frontier model output', () => {
    function makeValidDocument(): string {
      return [
        '# Terms of Service',
        '',
        '## Section 1: Definitions',
        '',
        'This agreement establishes the terms and conditions governing the use of services. ' +
        'All parties agree to the provisions set forth herein. The definitions in this section ' +
        'apply throughout the document unless otherwise noted. Payment terms are net 30 days.',
        '',
        '## Section 2: Obligations',
        '',
        'The provider shall deliver services in accordance with industry standards and best practices. ' +
        'Payment shall be made within the time period specified. Late payments incur interest.',
        '',
        '## Section 3: Termination',
        '',
        'Either party may terminate upon 30 days written notice. Material breach allows immediate termination.',
      ].join('\n');
    }

    function makeMockSession(assembledDocument: string): Partial<SessionState> {
      return {
        assembledDocument,
        finalOutput: "I'll start by reviewing the document. Let me check the clauses...",
        accumulatedCost: 1.50,
        subagentActivities: [{ agentRole: 'contract-reviewer', timestamp: new Date().toISOString(), activity: 'review' }] as any,
        workflowTemplateId: 'review',
        debate: { findings: [], challenges: [], responses: [], resolutions: [], rounds: [] } as any,
        workflow: { startedAt: new Date().toISOString() } as any,
      };
    }

    function makeMockInference(): InferenceResult {
      return {
        request: { type: 'contract_review', requestText: 'Review this contract' } as any,
        workflow: 'review',
        intensity: 'standard' as IntensityLevel,
        method: 'heuristic',
        reasoning: 'Detected contract file',
      };
    }

    it('should write valid deliverable when assembledDocument passes validation', async () => {
      const docPath = createTestFile(watchDir, 'contract.md', '# Contract\nContent.');
      const delivery = new ClawDelivery(clawDir);
      const config = createMockConfig(clawDir);
      const session = makeMockSession(makeValidDocument());
      const inference = makeMockInference();

      const result = await delivery.deliver(
        'test-frontier-valid',
        session as SessionState,
        inference,
        docPath,
        'hash456',
        config,
      );

      expect(fs.existsSync(path.join(result, 'manifest.json'))).toBe(true);
      expect(fs.existsSync(path.join(result, 'deliverable.md'))).toBe(true);

      const manifest = JSON.parse(fs.readFileSync(path.join(result, 'manifest.json'), 'utf-8'));
      expect(manifest.status).toBe('completed');

      const deliverable = fs.readFileSync(path.join(result, 'deliverable.md'), 'utf-8');
      expect(deliverable).toContain('Terms of Service');
      // Must NOT contain process dump content
      expect(deliverable).not.toContain("I'll start by");
    });

    it('should reject process dump in assembledDocument and mark as failed', async () => {
      const docPath = createTestFile(watchDir, 'contract2.md', '# Contract 2\nMore content.');
      const delivery = new ClawDelivery(clawDir);
      const config = createMockConfig(clawDir);
      // assembledDocument IS a process dump
      const session = makeMockSession("I'll start by reviewing the document. Let me check each clause carefully...");
      const inference = makeMockInference();

      const result = await delivery.deliver(
        'test-frontier-dump',
        session as SessionState,
        inference,
        docPath,
        'hash789',
        config,
      );

      const manifest = JSON.parse(fs.readFileSync(path.join(result, 'manifest.json'), 'utf-8'));
      expect(manifest.status).toBe('failed');

      // No deliverable.md should exist for a failed delivery
      expect(fs.existsSync(path.join(result, 'deliverable.md'))).toBe(false);
    });

    it('should mark as failed when assembledDocument is empty', async () => {
      const docPath = createTestFile(watchDir, 'contract3.md', '# Contract 3\nYet more content.');
      const delivery = new ClawDelivery(clawDir);
      const config = createMockConfig(clawDir);
      const session = makeMockSession('');
      const inference = makeMockInference();

      const result = await delivery.deliver(
        'test-frontier-empty',
        session as SessionState,
        inference,
        docPath,
        'hash000',
        config,
      );

      const manifest = JSON.parse(fs.readFileSync(path.join(result, 'manifest.json'), 'utf-8'));
      expect(manifest.status).toBe('failed');
      expect(fs.existsSync(path.join(result, 'deliverable.md'))).toBe(false);
    });
  });

  // ── Delivery (Local) ────────────────────────────────────────────────

  describe('Delivery — local analysis output', () => {
    it('should write delivery bundle for local analysis', async () => {
      const docPath = createTestFile(watchDir, 'confidential-nda.md', '# NDA\nSensitive content.');
      const delivery = new ClawDelivery(clawDir);
      const config = createMockConfig(clawDir);

      const result = await delivery.deliverLocal(
        'test-session-local',
        {
          summary: 'This NDA contains standard confidentiality provisions.',
          documentType: 'NDA',
          clauses: [
            { title: 'Confidentiality', text: 'All information disclosed...', concern: 'Broad scope', severity: 'major' },
          ],
          risks: [
            { description: 'No expiration date', severity: 'high', citation: 'Section 4' },
          ],
          recommendations: ['Add a 2-year expiration clause'],
          confidenceNote: 'Analyzed locally — verify with counsel',
          model: 'llama3.1:8b',
        },
        docPath,
        'hash123',
        config,
      );

      // Verify directory and files exist
      expect(fs.existsSync(result)).toBe(true);
      expect(fs.existsSync(path.join(result, 'manifest.json'))).toBe(true);
      expect(fs.existsSync(path.join(result, 'deliverable.md'))).toBe(true);
      expect(fs.existsSync(path.join(result, 'findings.json'))).toBe(true);
      expect(fs.existsSync(path.join(result, 'summary.txt'))).toBe(true);

      // Verify manifest content
      const manifest = JSON.parse(fs.readFileSync(path.join(result, 'manifest.json'), 'utf-8'));
      expect(manifest.confidential).toBe(true);
      expect(manifest.execution.totalCostUsd).toBe(0);
      expect(manifest.execution.model).toContain('local');
      expect(manifest.status).toBe('completed');

      // Verify deliverable has confidentiality stamp
      const deliverable = fs.readFileSync(path.join(result, 'deliverable.md'), 'utf-8');
      expect(deliverable).toContain('CONFIDENTIAL');
      expect(deliverable).toContain('On-Device');

      // Verify findings JSON
      const findings = JSON.parse(fs.readFileSync(path.join(result, 'findings.json'), 'utf-8'));
      expect(findings).toHaveLength(2); // 1 clause + 1 risk
    });
  });

  // ── Retry & Recovery ──────────────────────────────────────────────────

  describe('Retry and recovery operations', () => {
    it('should reset all error docs to new via retryFailed()', () => {
      createTestFile(watchDir, 'fail-doc-1.md', '# Fail 1\nContent alpha.');
      createTestFile(watchDir, 'fail-doc-2.md', '# Fail 2\nContent beta.');

      const registry = new DocumentRegistry(clawDir, 100);
      registry.scan([watchDir]);

      const allDocs = registry.getDocumentsByStatus('new');
      expect(allDocs).toHaveLength(2);

      // Mark both as error
      for (const doc of allDocs) {
        registry.markFailed(doc.hash, 'API timeout');
      }
      expect(registry.getDocumentsByStatus('error')).toHaveLength(2);

      // Retry all failed
      const count = registry.retryFailed();
      expect(count).toBe(2);
      expect(registry.getDocumentsByStatus('error')).toHaveLength(0);
      expect(registry.getDocumentsByStatus('new')).toHaveLength(2);

      // Verify error field is cleared
      for (const doc of registry.getDocumentsByStatus('new')) {
        expect(doc.error).toBeUndefined();
      }
    });

    it('should reset only the specified error doc when retryFailed(hash) is called', () => {
      createTestFile(watchDir, 'err-a.md', '# Error A\nFirst error doc.');
      createTestFile(watchDir, 'err-b.md', '# Error B\nSecond error doc.');

      const registry = new DocumentRegistry(clawDir, 100);
      registry.scan([watchDir]);

      const allDocs = registry.getDocumentsByStatus('new');
      expect(allDocs).toHaveLength(2);

      // Mark both as error
      for (const doc of allDocs) {
        registry.markFailed(doc.hash, 'Network error');
      }

      // Retry only the first by hash
      const targetHash = allDocs[0].hash;
      const count = registry.retryFailed(targetHash);

      expect(count).toBe(1);
      expect(registry.getDocument(targetHash)!.status).toBe('new');
      expect(registry.getDocument(allDocs[1].hash)!.status).toBe('error');
    });

    it('should reset stale docs to new via retryStale()', () => {
      const docPath = createTestFile(watchDir, 'stale-doc.md', 'Version 1');

      const registry = new DocumentRegistry(clawDir, 100);
      registry.scan([watchDir]);

      // Mark as reviewed first, then modify to make it stale
      const doc = registry.getDocumentByPath(docPath);
      registry.markReviewed(doc!.hash, 'sess-1', { critical: 0, major: 0, minor: 0 }, 1);

      // Modify file to trigger stale on rescan
      fs.writeFileSync(docPath, 'Version 2 — updated', 'utf-8');
      const { changedDocs } = registry.scan([watchDir]);
      expect(changedDocs).toHaveLength(1);

      const staleDocs = registry.getDocumentsByStatus('stale');
      expect(staleDocs).toHaveLength(1);

      // Retry stale
      const count = registry.retryStale();
      expect(count).toBe(1);
      expect(registry.getDocumentsByStatus('stale')).toHaveLength(0);
      expect(registry.getDocumentsByStatus('new')).toHaveLength(1);
    });

    it('should recover stuck processing documents on startup', () => {
      createTestFile(watchDir, 'stuck-doc.md', '# Stuck\nThis was processing when daemon crashed.');

      const registry1 = new DocumentRegistry(clawDir, 100);
      registry1.scan([watchDir]);

      // Simulate a doc that was mid-processing when daemon crashed
      const doc = registry1.getDocumentsByStatus('new')[0];
      registry1.updateStatus(doc.hash, 'processing');
      expect(registry1.getDocument(doc.hash)!.status).toBe('processing');

      // Simulate restart: create new registry from same dir
      const registry2 = new DocumentRegistry(clawDir, 100);
      const reloaded = registry2.getDocument(doc.hash);
      expect(reloaded!.status).toBe('processing');

      // Recover stuck documents
      const recovered = registry2.recoverStuckDocuments();
      expect(recovered).toBe(1);
      expect(registry2.getDocument(doc.hash)!.status).toBe('queued');
    });

    it('should compact old reviewed entries to archive', () => {
      createTestFile(watchDir, 'old-reviewed.md', '# Old Doc\nReviewed long ago.');
      createTestFile(watchDir, 'recent-reviewed.md', '# Recent Doc\nReviewed recently.');

      const registry = new DocumentRegistry(clawDir, 100);
      registry.scan([watchDir]);

      const allDocs = registry.getDocumentsByStatus('new');
      expect(allDocs).toHaveLength(2);

      // Mark both as reviewed
      for (const doc of allDocs) {
        registry.markReviewed(doc.hash, 'sess-compact', { critical: 0, major: 0, minor: 0 }, 1);
      }

      // Manually backdate the first doc's lastReviewed to 60 days ago
      const oldDoc = registry.getDocument(allDocs[0].hash)!;
      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
      oldDoc.lastReviewed = sixtyDaysAgo.toISOString();
      registry.save();

      // Compact with 30-day threshold
      const archived = registry.compact(30);

      expect(archived).toBe(1);
      // Old doc removed from active state
      expect(registry.getDocument(allDocs[0].hash)).toBeUndefined();
      // Recent doc still in active state
      expect(registry.getDocument(allDocs[1].hash)).toBeDefined();

      // Archive file should exist
      const archivePath = path.join(clawDir, 'state-archive.json');
      expect(fs.existsSync(archivePath)).toBe(true);
      const archive = JSON.parse(fs.readFileSync(archivePath, 'utf-8'));
      expect(archive[allDocs[0].hash]).toBeDefined();
    });
  });
});
