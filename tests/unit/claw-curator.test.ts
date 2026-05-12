/**
 * Unit Tests — Curator (src/claw/curator.ts)
 *
 * Lighthouse persona 3: cross-document intelligence. Runs on heartbeat, not
 * per-document. Three passes:
 *   1. Surface decision (LLM or heuristic) — what to ping the user about
 *   2. Re-read queue — which docs look stale given recent precedent updates
 *   3. Consolidation — which precedents to promote tentative→confirmed
 *
 * Coverage targets:
 *   - Surface decision: quiet folder → silent; criticals → heuristic surface;
 *     portfolio pattern → heuristic surface; LLM-on path with mocked output
 *   - Re-read queue: empty inputs, staleness detection, 1-hour buffer, sort+cap
 *   - Consolidation: threshold, consistent outcomes → promote, mixed → drift,
 *     skips already-confirmed and deprecated entries
 *   - Soft-fail: a thrown error in one pass doesn't break the others
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runCurator, CONFIRM_THRESHOLD } from '../../src/claw/curator.js';
import { DocumentRegistry } from '../../src/claw/registry.js';
import { PrecedentBoard } from '../../src/claw/precedent-board.js';
import type { ClawProfile, DocumentEntry } from '../../src/claw/types.js';
import type { PrecedentEntry } from '../../src/mcp/tools/memory-system.js';

// ── Fixtures ─────────────────────────────────────────────────────────────

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'curator-test-'));
}

function makeProfile(overrides: Partial<ClawProfile> = {}): ClawProfile {
  return {
    company: 'Acme Holdings',
    jurisdiction: 'NSW',
    industry: 'mining',
    size: 'mid',
    concerns: ['penalty clauses', 'IP indemnity'],
    preferences: { style: 'plain-language', intensity: 'standard', riskAppetite: 'conservative' },
    watchPaths: ['/tmp/test'],
    budget: { totalUsd: 100, perDocumentMaxUsd: 5 },
    processing: 'local',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeDoc(overrides: Partial<DocumentEntry> = {}): DocumentEntry {
  const hash = overrides.hash ?? `hash-${Math.random().toString(36).slice(2, 10)}`;
  return {
    path: `/tmp/${hash}.docx`,
    name: `${hash}.docx`,
    type: 'JV',
    hash,
    sizeBytes: 5000,
    firstSeen: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    lastModified: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    lastReviewed: new Date().toISOString(),
    status: 'reviewed',
    findingsSummary: { critical: 0, major: 0, minor: 0 },
    costUsd: 0,
    ...overrides,
  };
}

/** Inject a fully-formed PrecedentEntry directly into the board state.
 *  We bypass `indexFindings` because we need fine control over `outcomes`,
 *  `timesUsed`, `status`, etc. for consolidation tests. */
function injectPrecedent(board: PrecedentBoard, overrides: Partial<PrecedentEntry>): PrecedentEntry {
  const id = overrides.id ?? `PREC-${Math.random().toString(36).slice(2, 10)}`;
  const now = new Date().toISOString();
  const entry: PrecedentEntry = {
    id,
    documentType: 'jv',
    jurisdiction: 'NSW',
    patternName: 'Penalty Clause Risk',
    description: 'Liquidated damages clause may be unenforceable as a penalty.',
    beforeSnippet: 'liquidated damages of AUD 500,000 per week',
    afterSnippet: '',
    qualityScore: 0.9,
    addedAt: now,
    timesUsed: 1,
    timesQueried: 0,
    effectivenessScore: 0.5,
    outcomes: [{ sessionId: 'sess-1', timestamp: now, applied: true, scoreDelta: 0.1, verificationPassed: true }],
    deprecated: false,
    status: 'tentative',
    ...overrides,
  };
  board.getState().entries[id] = entry;
  board.save();
  return entry;
}

// ── Setup ────────────────────────────────────────────────────────────────

let dir: string;
let registry: DocumentRegistry;
let board: PrecedentBoard;

beforeEach(() => {
  dir = tmpDir();
  registry = new DocumentRegistry(dir, 100);
  board = new PrecedentBoard(dir);
});

afterEach(() => {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  vi.restoreAllMocks();
});

// ── Surface decision ─────────────────────────────────────────────────────

describe('Curator · surface-decision pass', () => {
  beforeEach(() => {
    // Default: no LLM available — Curator surface uses heuristic fallback.
    // We mock fetch to fail so the local-Ollama path returns undefined fast
    // even when env config points at a default model name.
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('test: network disabled'));
  });

  it('stays silent on a quiet folder (no recent reviews)', async () => {
    const decision = await runCurator({
      registry, precedentBoard: board, profile: makeProfile(),
      doSurface: true, doReReadQueue: false, doConsolidation: false,
    });
    expect(decision.surface).toBeUndefined();
  });

  it('stays silent when recent docs have zero critical findings AND no portfolio pattern', async () => {
    const state = registry.getState();
    state.documents['h1'] = makeDoc({ hash: 'h1', name: 'one.docx', type: 'NDA' });
    state.documents['h2'] = makeDoc({ hash: 'h2', name: 'two.docx', type: 'Lease' });

    const decision = await runCurator({
      registry, precedentBoard: board, profile: makeProfile(),
      doSurface: true, doReReadQueue: false, doConsolidation: false,
    });
    expect(decision.surface).toBeUndefined();
  });

  it('surfaces a critical-severity alert when LLM agrees ≥1 critical warrants attention', async () => {
    const state = registry.getState();
    state.documents['h1'] = makeDoc({
      hash: 'h1', name: 'jv.docx',
      findingsSummary: { critical: 2, major: 1, minor: 0 },
      status: 'flagged',
    });

    // The heuristic gate (totalCritical > 0) lets execution past the cheap exit;
    // the LLM is then called and we mock its response to confirm the wiring.
    vi.spyOn(globalThis, 'fetch').mockReset();
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(
      JSON.stringify({ choices: [{ message: { content: JSON.stringify({
        surface: true,
        title: '2 critical findings on bellrock_jv_v3.docx',
        message: 'Two critical findings on a JV agreement reviewed in the past 24h. Recommend immediate review of penalty + governing-law clauses.',
        severity: 'critical',
        rationale: 'Critical severity in 1 doc; client risk appetite is conservative.',
      }) } }] }),
      { status: 200 }
    ) as unknown as Response);

    const decision = await runCurator({
      registry, precedentBoard: board, profile: makeProfile(),
      doSurface: true, doReReadQueue: false, doConsolidation: false,
    });
    expect(decision.surface).toBeDefined();
    expect(decision.surface!.severity).toBe('critical');
  });

  it('passes the heuristic gate when ≥3 docs share a type (LLM then composes the surface)', async () => {
    const state = registry.getState();
    for (let i = 0; i < 4; i++) {
      state.documents[`h${i}`] = makeDoc({
        hash: `h${i}`, name: `vendor${i}.docx`, type: 'SaaS',
        // Zero criticals — surface is justified solely by pattern recurrence.
        findingsSummary: { critical: 0, major: 1, minor: 2 },
      });
    }

    vi.spyOn(globalThis, 'fetch').mockReset();
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(
      JSON.stringify({ choices: [{ message: { content: JSON.stringify({
        surface: true,
        title: 'Pattern across 4 SaaS agreements',
        message: '4 SaaS agreements reviewed in the past 24h share recurring concerns. Recommend portfolio-level review.',
        severity: 'warning',
        rationale: 'Pattern recurrence ≥3 documents of the same type.',
      }) } }] }),
      { status: 200 }
    ) as unknown as Response);

    const decision = await runCurator({
      registry, precedentBoard: board, profile: makeProfile(),
      doSurface: true, doReReadQueue: false, doConsolidation: false,
    });
    expect(decision.surface).toBeDefined();
    expect(decision.surface!.severity).toBe('warning');
    expect(decision.surface!.message.toLowerCase()).toContain('saas');
  });

  it('ignores documents whose lastReviewed is outside the lookback window', async () => {
    const state = registry.getState();
    // Old document — 48h ago, default lookback is 24h
    const old = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    state.documents['h1'] = makeDoc({
      hash: 'h1', name: 'old.docx', lastReviewed: old,
      findingsSummary: { critical: 5, major: 0, minor: 0 },
    });

    const decision = await runCurator({
      registry, precedentBoard: board, profile: makeProfile(),
      doSurface: true, doReReadQueue: false, doConsolidation: false,
    });
    expect(decision.surface).toBeUndefined();
  });

  it('uses the LLM-supplied surface when local Ollama responds with valid JSON', async () => {
    // Inject some criticals so the heuristic gate passes; then mock fetch to
    // serve a valid JSON response so the LLM path is taken.
    const state = registry.getState();
    state.documents['h1'] = makeDoc({
      hash: 'h1', name: 'jv.docx',
      findingsSummary: { critical: 1, major: 0, minor: 0 },
      status: 'flagged',
    });

    vi.spyOn(globalThis, 'fetch').mockReset();
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(
      JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              surface: true,
              title: 'Recurring penalty pattern across vendor docs',
              message: 'We see a recurring penalty-doctrine issue across 4 vendor agreements — recommend portfolio review.',
              severity: 'warning',
              rationale: 'Pattern recurrence + RED severity in 3+ docs.',
            }),
          },
        }],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    ) as unknown as Response);

    const decision = await runCurator({
      registry, precedentBoard: board, profile: makeProfile(),
      doSurface: true, doReReadQueue: false, doConsolidation: false,
    });
    expect(decision.surface).toBeDefined();
    expect(decision.surface!.severity).toBe('warning');
    expect(decision.surface!.title).toContain('penalty');
  });

  it('respects LLM "surface=false" decision (silence even with criticals)', async () => {
    const state = registry.getState();
    state.documents['h1'] = makeDoc({
      hash: 'h1', findingsSummary: { critical: 1, major: 0, minor: 0 }, status: 'flagged',
    });

    vi.spyOn(globalThis, 'fetch').mockReset();
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(
      JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              surface: false, title: '', message: '', severity: 'info',
              rationale: 'Single isolated critical, already alerted yesterday.',
            }),
          },
        }],
      }),
      { status: 200 }
    ) as unknown as Response);

    const decision = await runCurator({
      registry, precedentBoard: board, profile: makeProfile(),
      doSurface: true, doReReadQueue: false, doConsolidation: false,
    });
    expect(decision.surface).toBeUndefined();
  });
});

// ── Re-read queue ────────────────────────────────────────────────────────

describe('Curator · re-read queue pass', () => {
  it('returns an empty queue when registry has no documents', async () => {
    const decision = await runCurator({
      registry, precedentBoard: board, profile: makeProfile(),
      doSurface: false, doReReadQueue: true, doConsolidation: false,
    });
    expect(decision.reReadQueue).toEqual([]);
  });

  it('returns an empty queue when board has no precedents', async () => {
    const state = registry.getState();
    state.documents['h1'] = makeDoc({ hash: 'h1', type: 'JV' });
    const decision = await runCurator({
      registry, precedentBoard: board, profile: makeProfile(),
      doSurface: false, doReReadQueue: true, doConsolidation: false,
    });
    expect(decision.reReadQueue).toEqual([]);
  });

  it('queues a reviewed doc when a precedent of matching type was indexed AFTER its review', async () => {
    const reviewedAt = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // 24h ago
    const precedentAdded = new Date().toISOString(); // now (post-review)

    const state = registry.getState();
    state.documents['h1'] = makeDoc({ hash: 'h1', type: 'JV', lastReviewed: reviewedAt });

    injectPrecedent(board, {
      id: 'PREC-A', documentType: 'JV', jurisdiction: 'NSW',
      addedAt: precedentAdded, timesUsed: 1,
      outcomes: [{ sessionId: 's', timestamp: precedentAdded, applied: true, scoreDelta: 0.1, verificationPassed: true }],
    });

    const decision = await runCurator({
      registry, precedentBoard: board, profile: makeProfile(),
      doSurface: false, doReReadQueue: true, doConsolidation: false,
    });
    expect(decision.reReadQueue).toContain('h1');
  });

  it('does NOT queue a doc when the precedent change is within the 1-hour buffer', async () => {
    // Doc reviewed 30 min ago, precedent indexed 20 min ago (within buffer)
    const reviewedAt = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const precedentAdded = new Date(Date.now() - 20 * 60 * 1000).toISOString();

    const state = registry.getState();
    state.documents['h1'] = makeDoc({ hash: 'h1', type: 'JV', lastReviewed: reviewedAt });

    injectPrecedent(board, {
      id: 'PREC-A', documentType: 'JV', jurisdiction: 'NSW',
      addedAt: precedentAdded, timesUsed: 1,
      outcomes: [{ sessionId: 's', timestamp: precedentAdded, applied: true, scoreDelta: 0.1, verificationPassed: true }],
    });

    const decision = await runCurator({
      registry, precedentBoard: board, profile: makeProfile(),
      doSurface: false, doReReadQueue: true, doConsolidation: false,
    });
    expect(decision.reReadQueue).not.toContain('h1');
  });

  it('does NOT queue docs with status other than reviewed/flagged', async () => {
    const reviewedAt = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const state = registry.getState();
    state.documents['hA'] = makeDoc({ hash: 'hA', status: 'new', lastReviewed: reviewedAt });
    state.documents['hB'] = makeDoc({ hash: 'hB', status: 'error', lastReviewed: reviewedAt });
    state.documents['hC'] = makeDoc({ hash: 'hC', status: 'skipped', lastReviewed: reviewedAt });

    const now = new Date().toISOString();
    injectPrecedent(board, {
      id: 'PREC-A', documentType: 'JV', addedAt: now, timesUsed: 1,
      outcomes: [{ sessionId: 's', timestamp: now, applied: true, scoreDelta: 0.1, verificationPassed: true }],
    });

    const decision = await runCurator({
      registry, precedentBoard: board, profile: makeProfile(),
      doSurface: false, doReReadQueue: true, doConsolidation: false,
    });
    expect(decision.reReadQueue).toEqual([]);
  });

  it('skips deprecated precedents when computing per-type latest activity', async () => {
    const reviewedAt = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const state = registry.getState();
    state.documents['h1'] = makeDoc({ hash: 'h1', type: 'JV', lastReviewed: reviewedAt });

    // Newer precedent BUT deprecated → must be ignored
    const now = new Date().toISOString();
    injectPrecedent(board, {
      id: 'PREC-DEP', documentType: 'JV', addedAt: now, timesUsed: 1,
      outcomes: [{ sessionId: 's', timestamp: now, applied: true, scoreDelta: 0.1, verificationPassed: true }],
      deprecated: true,
    });

    const decision = await runCurator({
      registry, precedentBoard: board, profile: makeProfile(),
      doSurface: false, doReReadQueue: true, doConsolidation: false,
    });
    expect(decision.reReadQueue).toEqual([]);
  });

  it('matches document type case-insensitively against precedent type', async () => {
    const reviewedAt = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const state = registry.getState();
    state.documents['h1'] = makeDoc({ hash: 'h1', type: 'JV', lastReviewed: reviewedAt });

    const now = new Date().toISOString();
    // Precedent type lower-case; doc type upper-case — both lowered before comparison
    injectPrecedent(board, {
      id: 'PREC-A', documentType: 'jv', addedAt: now, timesUsed: 1,
      outcomes: [{ sessionId: 's', timestamp: now, applied: true, scoreDelta: 0.1, verificationPassed: true }],
    });

    const decision = await runCurator({
      registry, precedentBoard: board, profile: makeProfile(),
      doSurface: false, doReReadQueue: true, doConsolidation: false,
    });
    expect(decision.reReadQueue).toContain('h1');
  });

  it('returns at most maxQueueSize docs and sorts most-stale first', async () => {
    const state = registry.getState();
    // 25 stale docs, all type=JV
    for (let i = 0; i < 25; i++) {
      const reviewedAt = new Date(Date.now() - (1 + i) * 24 * 60 * 60 * 1000).toISOString();
      state.documents[`h${i}`] = makeDoc({
        hash: `h${i}`, type: 'JV', lastReviewed: reviewedAt, name: `doc${i}.docx`,
      });
    }
    const now = new Date().toISOString();
    injectPrecedent(board, {
      id: 'PREC-A', documentType: 'JV', addedAt: now, timesUsed: 1,
      outcomes: [{ sessionId: 's', timestamp: now, applied: true, scoreDelta: 0.1, verificationPassed: true }],
    });

    const decision = await runCurator({
      registry, precedentBoard: board, profile: makeProfile(),
      doSurface: false, doReReadQueue: true, doConsolidation: false,
    });
    // Default cap inside reReadQueuePass is 20
    expect(decision.reReadQueue.length).toBeLessThanOrEqual(20);
    // Most-stale (h24, reviewed 25d ago) should appear before less-stale (h0)
    const idx24 = decision.reReadQueue.indexOf('h24');
    const idx0 = decision.reReadQueue.indexOf('h0');
    if (idx0 >= 0 && idx24 >= 0) {
      expect(idx24).toBeLessThan(idx0);
    } else {
      expect(idx24).toBeGreaterThanOrEqual(0);
    }
  });
});

// ── Consolidation pass ───────────────────────────────────────────────────

describe('Curator · consolidation pass', () => {
  it('returns empty arrays for an empty board', async () => {
    const decision = await runCurator({
      registry, precedentBoard: board, profile: makeProfile(),
      doSurface: false, doReReadQueue: false, doConsolidation: true,
    });
    expect(decision.promoteToConfirmed).toEqual([]);
    expect(decision.driftDetected).toEqual([]);
  });

  it('does not promote precedents below CONFIRM_THRESHOLD', async () => {
    const now = new Date().toISOString();
    injectPrecedent(board, {
      id: 'PREC-LOW', timesUsed: CONFIRM_THRESHOLD - 1,
      outcomes: Array.from({ length: CONFIRM_THRESHOLD - 1 }, (_, i) => ({
        sessionId: `s${i}`, timestamp: now, applied: true, scoreDelta: 0.1, verificationPassed: true,
      })),
    });

    const decision = await runCurator({
      registry, precedentBoard: board, profile: makeProfile(),
      doSurface: false, doReReadQueue: false, doConsolidation: true,
    });
    expect(decision.promoteToConfirmed).not.toContain('PREC-LOW');
  });

  it('PROMOTES precedents at threshold with consistent (applied + verified) outcomes', async () => {
    const now = new Date().toISOString();
    injectPrecedent(board, {
      id: 'PREC-WIN', timesUsed: CONFIRM_THRESHOLD,
      outcomes: Array.from({ length: CONFIRM_THRESHOLD }, (_, i) => ({
        sessionId: `s${i}`, timestamp: now, applied: true, scoreDelta: 0.1, verificationPassed: true,
      })),
    });

    const decision = await runCurator({
      registry, precedentBoard: board, profile: makeProfile(),
      doSurface: false, doReReadQueue: false, doConsolidation: true,
    });
    expect(decision.promoteToConfirmed).toContain('PREC-WIN');
    expect(decision.driftDetected).not.toContain('PREC-WIN');
  });

  it('flags DRIFT when ≥2 outcomes are inconsistent (not promoted)', async () => {
    const now = new Date().toISOString();
    const outcomes = Array.from({ length: CONFIRM_THRESHOLD }, (_, i) => ({
      sessionId: `s${i}`, timestamp: now, applied: true, scoreDelta: 0.1, verificationPassed: true,
    }));
    // Flip 2 outcomes to verificationPassed=false → drift trigger
    outcomes[0].verificationPassed = false;
    outcomes[1].applied = false;

    injectPrecedent(board, {
      id: 'PREC-DRIFT', timesUsed: CONFIRM_THRESHOLD, outcomes,
    });

    const decision = await runCurator({
      registry, precedentBoard: board, profile: makeProfile(),
      doSurface: false, doReReadQueue: false, doConsolidation: true,
    });
    expect(decision.driftDetected).toContain('PREC-DRIFT');
    expect(decision.promoteToConfirmed).not.toContain('PREC-DRIFT');
  });

  it('skips already-confirmed precedents', async () => {
    const now = new Date().toISOString();
    injectPrecedent(board, {
      id: 'PREC-DONE', timesUsed: CONFIRM_THRESHOLD * 2,
      status: 'confirmed',
      outcomes: Array.from({ length: CONFIRM_THRESHOLD * 2 }, (_, i) => ({
        sessionId: `s${i}`, timestamp: now, applied: true, scoreDelta: 0.1, verificationPassed: true,
      })),
    });

    const decision = await runCurator({
      registry, precedentBoard: board, profile: makeProfile(),
      doSurface: false, doReReadQueue: false, doConsolidation: true,
    });
    expect(decision.promoteToConfirmed).not.toContain('PREC-DONE');
  });

  it('skips deprecated precedents', async () => {
    const now = new Date().toISOString();
    injectPrecedent(board, {
      id: 'PREC-DEAD', timesUsed: CONFIRM_THRESHOLD,
      deprecated: true,
      outcomes: Array.from({ length: CONFIRM_THRESHOLD }, (_, i) => ({
        sessionId: `s${i}`, timestamp: now, applied: true, scoreDelta: 0.1, verificationPassed: true,
      })),
    });

    const decision = await runCurator({
      registry, precedentBoard: board, profile: makeProfile(),
      doSurface: false, doReReadQueue: false, doConsolidation: true,
    });
    expect(decision.promoteToConfirmed).not.toContain('PREC-DEAD');
    expect(decision.driftDetected).not.toContain('PREC-DEAD');
  });

  it('handles a mix of precedents in one pass (one promoted, one drift, one skipped)', async () => {
    const now = new Date().toISOString();

    // Winner — should promote
    injectPrecedent(board, {
      id: 'PREC-A', timesUsed: CONFIRM_THRESHOLD,
      outcomes: Array.from({ length: CONFIRM_THRESHOLD }, (_, i) => ({
        sessionId: `sA${i}`, timestamp: now, applied: true, scoreDelta: 0.1, verificationPassed: true,
      })),
    });

    // Drift — 2 negative outcomes
    const driftOutcomes = Array.from({ length: CONFIRM_THRESHOLD }, (_, i) => ({
      sessionId: `sB${i}`, timestamp: now, applied: true, scoreDelta: 0.1, verificationPassed: true,
    }));
    driftOutcomes[0].applied = false;
    driftOutcomes[3].verificationPassed = false;
    injectPrecedent(board, { id: 'PREC-B', timesUsed: CONFIRM_THRESHOLD, outcomes: driftOutcomes });

    // Below threshold — neither
    injectPrecedent(board, {
      id: 'PREC-C', timesUsed: 1,
      outcomes: [{ sessionId: 'sC0', timestamp: now, applied: true, scoreDelta: 0.1, verificationPassed: true }],
    });

    const decision = await runCurator({
      registry, precedentBoard: board, profile: makeProfile(),
      doSurface: false, doReReadQueue: false, doConsolidation: true,
    });
    expect(decision.promoteToConfirmed).toEqual(['PREC-A']);
    expect(decision.driftDetected).toEqual(['PREC-B']);
  });
});

// ── Public runCurator ────────────────────────────────────────────────────

describe('Curator · runCurator() entry point', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('test: network disabled'));
  });

  it('returns a CuratorDecision with all required array fields', async () => {
    const decision = await runCurator({
      registry, precedentBoard: board, profile: makeProfile(),
    });
    expect(Array.isArray(decision.reReadQueue)).toBe(true);
    expect(Array.isArray(decision.promoteToConfirmed)).toBe(true);
    expect(Array.isArray(decision.driftDetected)).toBe(true);
    expect(Array.isArray(decision.requestFrontierEscalation)).toBe(true);
  });

  it('respects all-flags-off (returns empty decision)', async () => {
    const decision = await runCurator({
      registry, precedentBoard: board, profile: makeProfile(),
      doSurface: false, doReReadQueue: false, doConsolidation: false,
    });
    expect(decision.surface).toBeUndefined();
    expect(decision.reReadQueue).toEqual([]);
    expect(decision.promoteToConfirmed).toEqual([]);
    expect(decision.driftDetected).toEqual([]);
  });

  it('soft-fails: a thrown error in surface pass does not break re-read or consolidation', async () => {
    // Arrange: registry getState() throws when surface tries to read it
    const originalGetState = registry.getState.bind(registry);
    let firstCall = true;
    vi.spyOn(registry, 'getState').mockImplementation(() => {
      if (firstCall) {
        firstCall = false;
        throw new Error('synthetic registry failure');
      }
      return originalGetState();
    });

    const now = new Date().toISOString();
    injectPrecedent(board, {
      id: 'PREC-A', timesUsed: CONFIRM_THRESHOLD,
      outcomes: Array.from({ length: CONFIRM_THRESHOLD }, (_, i) => ({
        sessionId: `s${i}`, timestamp: now, applied: true, scoreDelta: 0.1, verificationPassed: true,
      })),
    });

    const decision = await runCurator({
      registry, precedentBoard: board, profile: makeProfile(),
    });
    // surface threw → undefined, but consolidation still ran successfully
    expect(decision.surface).toBeUndefined();
    expect(decision.promoteToConfirmed).toContain('PREC-A');
  });

  it('CONFIRM_THRESHOLD is the documented default (5) unless overridden by env', () => {
    // The smoke-test report depends on this being 5; document as a hard expectation.
    // Note: env override (LAVERN_CLAW_PRECEDENT_CONFIRM_THRESHOLD) would change this
    // at module load — we don't test that here because we'd have to re-import.
    if (process.env.LAVERN_CLAW_PRECEDENT_CONFIRM_THRESHOLD === undefined) {
      expect(CONFIRM_THRESHOLD).toBe(5);
    } else {
      expect(CONFIRM_THRESHOLD).toBe(Number(process.env.LAVERN_CLAW_PRECEDENT_CONFIRM_THRESHOLD));
    }
  });
});
