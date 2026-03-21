/**
 * Unit Tests — Precedent Board (src/claw/precedent-board.ts)
 *
 * Tests institutional memory: indexing, dedup, search, reinforcement,
 * decay, compaction, and summary.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { PrecedentBoard, resetPrecedentBoard } from '../../src/claw/precedent-board.js';
import type { Finding } from '../../src/types/debate.js';

// ── Helpers ──────────────────────────────────────────────────────────────

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'prec-test-'));
}

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'F-001',
    agentRole: 'contract-reviewer',
    findingType: 'contract-risk',
    content: 'Unlimited liability exposure in Section 4.2',
    severity: 'RED',
    evidence: ['Section 4.2: "Company shall indemnify and hold harmless..."'],
    confidence: 0.95,
    timestamp: new Date().toISOString(),
    resolved: false,
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('PrecedentBoard', () => {
  let dir: string;
  let board: PrecedentBoard;

  beforeEach(() => {
    resetPrecedentBoard();
    dir = tmpDir();
    board = new PrecedentBoard(dir);
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  // ── indexFindings ──────────────────────────────────────────────────────

  describe('indexFindings', () => {
    it('creates entries from RED/YELLOW findings with high confidence', () => {
      const findings = [
        makeFinding({ id: 'F-001', severity: 'RED', confidence: 0.95 }),
        makeFinding({ id: 'F-002', severity: 'YELLOW', confidence: 0.8, findingType: 'contract-deviation', evidence: ['Section 5: ...'] }),
      ];

      const count = board.indexFindings('hash1', 'NDA', 'US', findings);
      expect(count).toBe(2);

      const summary = board.summary;
      expect(summary.active).toBe(2);
      expect(summary.total).toBe(2);
    });

    it('skips GREEN findings', () => {
      const findings = [
        makeFinding({ severity: 'GREEN', confidence: 0.95 }),
      ];

      const count = board.indexFindings('hash1', 'NDA', 'US', findings);
      expect(count).toBe(0);
      expect(board.summary.total).toBe(0);
    });

    it('skips findings with low confidence', () => {
      const findings = [
        makeFinding({ severity: 'RED', confidence: 0.5 }),
      ];

      const count = board.indexFindings('hash1', 'NDA', 'US', findings);
      expect(count).toBe(0);
    });

    it('deduplicates: same evidence text reinforces existing entry', () => {
      const finding = makeFinding();

      board.indexFindings('hash1', 'NDA', 'US', [finding]);
      expect(board.summary.total).toBe(1);

      // Same finding type + evidence → should reinforce, not create new
      board.indexFindings('hash2', 'NDA', 'US', [finding]);
      expect(board.summary.total).toBe(1);

      // Check timesUsed was bumped
      const entries = Object.values(board.getState().entries);
      expect(entries[0].timesUsed).toBe(2);
    });

    it('persists to disk', () => {
      board.indexFindings('hash1', 'NDA', 'US', [makeFinding()]);

      // Load fresh from disk
      const board2 = new PrecedentBoard(dir);
      expect(board2.summary.total).toBe(1);
    });

    it('stores correct metadata', () => {
      board.indexFindings('hash1', 'NDA', 'Delaware', [makeFinding()]);

      const entry = Object.values(board.getState().entries)[0];
      expect(entry.documentType).toBe('NDA');
      expect(entry.jurisdiction).toBe('Delaware');
      expect(entry.patternName).toBe('Contract Risk Pattern');
      expect(entry.tags?.documentType).toBe('NDA');
      expect(entry.tags?.jurisdiction).toBe('Delaware');
      expect(entry.qualityScore).toBe(0.95);
      expect(entry.deprecated).toBe(false);
      expect(entry.outcomes).toHaveLength(1);
    });
  });

  // ── search ────────────────────────────────────────────────────────────

  describe('search', () => {
    beforeEach(() => {
      // Seed board with varied precedents
      board.indexFindings('h1', 'NDA', 'US', [
        makeFinding({ findingType: 'contract-risk', evidence: ['NDA clause A'] }),
      ]);
      board.indexFindings('h2', 'ToS', 'EU', [
        makeFinding({ findingType: 'dark-pattern', evidence: ['Dark pattern in Section 3'] }),
      ]);
      board.indexFindings('h3', 'Contract', 'US', [
        makeFinding({ findingType: 'contract-deviation', evidence: ['Deviation from standard'] }),
      ]);
    });

    it('returns all non-deprecated entries when no filters', () => {
      const results = board.search({});
      expect(results).toHaveLength(3);
    });

    it('filters by jurisdiction', () => {
      const results = board.search({ jurisdiction: 'EU' });
      expect(results).toHaveLength(1);
      expect(results[0].entry.tags?.jurisdiction).toBe('EU');
    });

    it('filters by documentType', () => {
      const results = board.search({ documentType: 'NDA' });
      expect(results).toHaveLength(1);
    });

    it('filters by text query', () => {
      const results = board.search({ textQuery: 'dark pattern' });
      expect(results).toHaveLength(1);
      expect(results[0].entry.patternName).toBe('Dark Pattern Pattern');
    });

    it('filters by findingType', () => {
      const results = board.search({ findingType: 'contract-risk' });
      expect(results).toHaveLength(1);
    });

    it('returns results sorted by relevance score', () => {
      // Reinforce the first entry to boost its score
      const firstId = Object.values(board.getState().entries)[0].id;
      board.reinforce(firstId, 'session-x', 0.5);
      board.reinforce(firstId, 'session-y', 0.5);

      const results = board.search({});
      expect(results[0].entry.id).toBe(firstId);
      expect(results[0].relevanceScore).toBeGreaterThan(results[1].relevanceScore);
    });

    it('respects limit parameter', () => {
      const results = board.search({ limit: 1 });
      expect(results).toHaveLength(1);
    });

    it('increments timesQueried on returned entries', () => {
      board.search({});
      const entry = Object.values(board.getState().entries)[0];
      expect(entry.timesQueried).toBe(1);
    });
  });

  // ── reinforce ─────────────────────────────────────────────────────────

  describe('reinforce', () => {
    it('bumps timesUsed and adds outcome', () => {
      board.indexFindings('h1', 'NDA', 'US', [makeFinding()]);
      const id = Object.values(board.getState().entries)[0].id;

      board.reinforce(id, 'session-2', 0.2);

      const entry = board.getState().entries[id];
      expect(entry.timesUsed).toBe(2);
      expect(entry.outcomes).toHaveLength(2);
    });

    it('updates effectivenessScore via EMA', () => {
      board.indexFindings('h1', 'NDA', 'US', [makeFinding()]);
      const id = Object.values(board.getState().entries)[0].id;
      const before = board.getState().entries[id].effectivenessScore;

      board.reinforce(id, 'session-2', 0.5);

      const after = board.getState().entries[id].effectivenessScore;
      expect(after).toBeGreaterThan(before);
    });

    it('caps outcomes array at configured max', () => {
      board.indexFindings('h1', 'NDA', 'US', [makeFinding()]);
      const id = Object.values(board.getState().entries)[0].id;

      // Add many outcomes (default max is 50)
      for (let i = 0; i < 60; i++) {
        board.reinforce(id, `session-${i}`, 0.01);
      }

      const entry = board.getState().entries[id];
      expect(entry.outcomes.length).toBeLessThanOrEqual(50);
    });

    it('is a no-op for unknown precedent id', () => {
      board.reinforce('nonexistent', 'session-1', 0.1);
      // Should not throw
    });
  });

  // ── decay ─────────────────────────────────────────────────────────────

  describe('decay', () => {
    it('deprecates entries unreinforced for 180+ days', () => {
      board.indexFindings('h1', 'NDA', 'US', [makeFinding()]);
      const id = Object.values(board.getState().entries)[0].id;

      // Backdate the entry and outcomes
      const old = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString();
      board.getState().entries[id].addedAt = old;
      board.getState().entries[id].outcomes[0].timestamp = old;
      board.getState().lastDecay = old;

      board.decay();

      expect(board.getState().entries[id].deprecated).toBe(true);
      expect(board.getState().entries[id].deprecationReason).toContain('Unreinforced');
    });

    it('reduces effectiveness for entries inactive > 30 days', () => {
      board.indexFindings('h1', 'NDA', 'US', [makeFinding()]);
      const id = Object.values(board.getState().entries)[0].id;
      const before = board.getState().entries[id].effectivenessScore;

      // Backdate
      const old = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
      board.getState().entries[id].addedAt = old;
      board.getState().entries[id].outcomes[0].timestamp = old;
      board.getState().lastDecay = old;

      board.decay();

      const after = board.getState().entries[id].effectivenessScore;
      expect(after).toBeLessThan(before);
      expect(board.getState().entries[id].deprecated).toBe(false);
    });

    it('skips if last decay was less than 1 day ago', () => {
      board.indexFindings('h1', 'NDA', 'US', [makeFinding()]);
      const id = Object.values(board.getState().entries)[0].id;
      const before = board.getState().entries[id].effectivenessScore;

      // lastDecay is now (just created) — decay should skip
      board.decay();

      expect(board.getState().entries[id].effectivenessScore).toBe(before);
    });
  });

  // ── compact ───────────────────────────────────────────────────────────

  describe('compact', () => {
    it('moves deprecated entries to archive', () => {
      board.indexFindings('h1', 'NDA', 'US', [makeFinding()]);
      const id = Object.values(board.getState().entries)[0].id;
      board.getState().entries[id].deprecated = true;

      board.compact();

      expect(board.getState().entries[id]).toBeUndefined();
      expect(board.summary.total).toBe(0);

      // Archive should contain the entry
      const archivePath = path.join(dir, 'precedents-archive.json');
      const archive = JSON.parse(fs.readFileSync(archivePath, 'utf-8'));
      expect(archive).toHaveLength(1);
      expect(archive[0].id).toBe(id);
    });

    it('moves old entries past threshold to archive', () => {
      board.indexFindings('h1', 'NDA', 'US', [makeFinding()]);
      const id = Object.values(board.getState().entries)[0].id;

      // Backdate past the archive threshold
      board.getState().entries[id].addedAt = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();

      board.compact(90);

      expect(board.getState().entries[id]).toBeUndefined();
    });

    it('keeps active recent entries', () => {
      board.indexFindings('h1', 'NDA', 'US', [makeFinding()]);

      board.compact();

      expect(board.summary.total).toBe(1);
    });
  });

  // ── summary ───────────────────────────────────────────────────────────

  describe('summary', () => {
    it('returns correct counts', () => {
      board.indexFindings('h1', 'NDA', 'US', [
        makeFinding({ evidence: ['evidence A'] }),
      ]);
      board.indexFindings('h2', 'ToS', 'EU', [
        makeFinding({ findingType: 'dark-pattern', evidence: ['evidence B'] }),
      ]);

      // Deprecate one
      const ids = Object.keys(board.getState().entries);
      board.getState().entries[ids[0]].deprecated = true;

      const s = board.summary;
      expect(s.total).toBe(2);
      expect(s.active).toBe(1);
      expect(s.deprecated).toBe(1);
    });

    it('returns top patterns sorted by usage', () => {
      board.indexFindings('h1', 'NDA', 'US', [
        makeFinding({ evidence: ['ev 1'] }),
      ]);
      board.indexFindings('h2', 'ToS', 'EU', [
        makeFinding({ findingType: 'dark-pattern', evidence: ['ev 2'] }),
      ]);

      // Reinforce the first one more
      const firstId = Object.keys(board.getState().entries)[0];
      board.reinforce(firstId, 's2', 0.1);
      board.reinforce(firstId, 's3', 0.1);

      const s = board.summary;
      expect(s.topPatterns[0]).toBe('Contract Risk Pattern');
    });
  });

  // ── hardening: edge cases ─────────────────────────────────────────────

  describe('hardening', () => {
    it('indexFindings with empty array returns 0', () => {
      expect(board.indexFindings('h1', 'NDA', 'US', [])).toBe(0);
      expect(board.summary.total).toBe(0);
    });

    it('indexFindings skips findings with empty evidence', () => {
      const finding = makeFinding({ evidence: [] });
      expect(board.indexFindings('h1', 'NDA', 'US', [finding])).toBe(0);
    });

    it('indexFindings skips findings with empty string evidence', () => {
      const finding = makeFinding({ evidence: [''] });
      expect(board.indexFindings('h1', 'NDA', 'US', [finding])).toBe(0);
    });

    it('dedup distinguishes different evidence texts', () => {
      const f1 = makeFinding({ evidence: ['Section 4.2: unlimited liability'] });
      const f2 = makeFinding({ evidence: ['Section 7.1: non-compete clause'] });

      board.indexFindings('h1', 'NDA', 'US', [f1]);
      board.indexFindings('h2', 'NDA', 'US', [f2]);

      expect(board.summary.total).toBe(2);
    });

    it('reinforce clamps effectiveness to [0, 1]', () => {
      board.indexFindings('h1', 'NDA', 'US', [makeFinding()]);
      const id = Object.values(board.getState().entries)[0].id;

      // Push effectiveness very high
      for (let i = 0; i < 100; i++) {
        board.reinforce(id, `s${i}`, 1.0);
      }
      expect(board.getState().entries[id].effectivenessScore).toBeLessThanOrEqual(1);

      // Push effectiveness negative
      for (let i = 0; i < 200; i++) {
        board.reinforce(id, `sn${i}`, -1.0);
      }
      expect(board.getState().entries[id].effectivenessScore).toBeGreaterThanOrEqual(0);
    });

    it('decay handles entries with invalid dates', () => {
      board.indexFindings('h1', 'NDA', 'US', [makeFinding()]);
      const id = Object.values(board.getState().entries)[0].id;

      // Corrupt the date
      board.getState().entries[id].addedAt = 'not-a-date';
      board.getState().entries[id].outcomes[0].timestamp = 'also-broken';
      board.getState().lastDecay = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

      // Should not throw
      expect(() => board.decay()).not.toThrow();
    });

    it('search on empty board returns empty array', () => {
      const results = board.search({ textQuery: 'anything' });
      expect(results).toEqual([]);
    });

    it('search with all deprecated entries returns empty', () => {
      board.indexFindings('h1', 'NDA', 'US', [makeFinding()]);
      const id = Object.values(board.getState().entries)[0].id;
      board.getState().entries[id].deprecated = true;

      const results = board.search({});
      expect(results).toEqual([]);
    });

    it('compact on empty board is a no-op', () => {
      expect(() => board.compact()).not.toThrow();
      expect(board.summary.total).toBe(0);
    });

    it('outcomes array never exceeds configured max', () => {
      board.indexFindings('h1', 'NDA', 'US', [makeFinding()]);
      const id = Object.values(board.getState().entries)[0].id;

      // Reinforce 60 times (max is 50)
      for (let i = 0; i < 60; i++) {
        board.reinforce(id, `s${i}`, 0.01);
      }

      // Should be exactly at max, not above
      expect(board.getState().entries[id].outcomes.length).toBe(50);
    });
  });
});
