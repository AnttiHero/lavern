/**
 * Unit Tests — Precedent Lifecycle (src/claw/precedent-board.ts, Phase 5)
 *
 * Lighthouse Phase 5: precedents have a 'tentative' | 'confirmed' | 'deprecated'
 * lifecycle. Curator's consolidation pass promotes tentative → confirmed when
 * the same pattern recurs ≥ CONFIRM_THRESHOLD times with consistent verdicts.
 * Reader prompts then weight confirmed precedents higher.
 *
 * Tests:
 *   - markConfirmed promotes tentative → confirmed and persists
 *   - markConfirmed is idempotent (returns false on re-confirm)
 *   - markConfirmed refuses to promote deprecated entries
 *   - markConfirmed refuses to promote unknown IDs
 *   - statusCounts correctly buckets tentative/confirmed/deprecated
 *   - Newly-indexed findings default to 'tentative'
 *   - statusUpdatedAt is set on confirmation
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { PrecedentBoard } from '../../src/claw/precedent-board.js';
import type { Finding } from '../../src/types/debate.js';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'prec-life-test-'));
}

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'F-001',
    agentRole: 'contract-reviewer',
    findingType: 'penalty-clause-risk',
    content: 'Liquidated damages of AUD 500,000 per week may be unenforceable.',
    severity: 'RED',
    evidence: ['liquidated damages of AUD 500,000 per week'],
    confidence: 0.92,
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

let dir: string;
let board: PrecedentBoard;

beforeEach(() => {
  dir = tmpDir();
  board = new PrecedentBoard(dir);
});

afterEach(() => {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
});

describe('PrecedentBoard · status lifecycle', () => {
  it('newly-indexed precedents default to "tentative"', () => {
    board.indexFindings('hash-1', 'jv', 'NSW', [makeFinding()]);
    const entries = Object.values(board.getState().entries);
    expect(entries.length).toBe(1);
    const status = (entries[0] as { status?: string }).status;
    // Either explicitly 'tentative' or undefined (legacy) — both treated as tentative
    expect(status === undefined || status === 'tentative').toBe(true);
  });

  it('markConfirmed promotes tentative → confirmed and returns true', () => {
    board.indexFindings('hash-1', 'jv', 'NSW', [makeFinding()]);
    const id = Object.keys(board.getState().entries)[0];
    expect(id).toBeDefined();

    const promoted = board.markConfirmed(id);
    expect(promoted).toBe(true);

    const entry = board.getState().entries[id];
    expect((entry as { status?: string }).status).toBe('confirmed');
    expect((entry as { statusUpdatedAt?: string }).statusUpdatedAt).toBeDefined();
  });

  it('markConfirmed is idempotent (returns false on re-confirm)', () => {
    board.indexFindings('hash-1', 'jv', 'NSW', [makeFinding()]);
    const id = Object.keys(board.getState().entries)[0];

    expect(board.markConfirmed(id)).toBe(true);
    // Second call: already confirmed → no-op
    expect(board.markConfirmed(id)).toBe(false);
  });

  it('markConfirmed refuses to promote deprecated entries', () => {
    board.indexFindings('hash-1', 'jv', 'NSW', [makeFinding()]);
    const id = Object.keys(board.getState().entries)[0];

    // Manually deprecate
    board.getState().entries[id].deprecated = true;
    board.save();

    const promoted = board.markConfirmed(id);
    expect(promoted).toBe(false);
  });

  it('markConfirmed returns false for unknown IDs', () => {
    expect(board.markConfirmed('PREC-does-not-exist')).toBe(false);
  });

  it('persists status across PrecedentBoard re-instantiation', () => {
    board.indexFindings('hash-1', 'jv', 'NSW', [makeFinding()]);
    const id = Object.keys(board.getState().entries)[0];
    board.markConfirmed(id);

    // Re-open the board from disk
    const board2 = new PrecedentBoard(dir);
    const entry = board2.getState().entries[id];
    expect((entry as { status?: string }).status).toBe('confirmed');
  });
});

describe('PrecedentBoard · statusCounts', () => {
  it('buckets entries correctly across statuses', () => {
    board.indexFindings('hash-A', 'jv', 'NSW', [makeFinding({ id: 'F-A', evidence: ['a-snippet'] })]);
    board.indexFindings('hash-B', 'jv', 'NSW', [makeFinding({ id: 'F-B', evidence: ['b-snippet'] })]);
    board.indexFindings('hash-C', 'jv', 'NSW', [makeFinding({ id: 'F-C', evidence: ['c-snippet'] })]);

    const ids = Object.keys(board.getState().entries);
    expect(ids.length).toBe(3);

    // Confirm one
    board.markConfirmed(ids[0]);
    // Deprecate one
    board.getState().entries[ids[1]].deprecated = true;
    board.save();
    // Leave the third tentative

    const counts = board.statusCounts();
    expect(counts.confirmed).toBe(1);
    expect(counts.deprecated).toBe(1);
    expect(counts.tentative).toBe(1);
  });

  it('returns zero-buckets for an empty board', () => {
    const counts = board.statusCounts();
    expect(counts).toEqual({ tentative: 0, confirmed: 0, deprecated: 0 });
  });

  it('treats legacy entries (no status field) as tentative', () => {
    board.indexFindings('hash-A', 'jv', 'NSW', [makeFinding({ evidence: ['legacy-snippet'] })]);
    const id = Object.keys(board.getState().entries)[0];
    // Strip the status field to simulate a legacy file
    delete (board.getState().entries[id] as { status?: string }).status;
    board.save();

    const counts = board.statusCounts();
    expect(counts.tentative).toBe(1);
    expect(counts.confirmed).toBe(0);
  });
});
