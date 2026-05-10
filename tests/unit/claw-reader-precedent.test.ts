/**
 * Unit Tests — Reader / Precedent Injection (src/claw/local-analysis.ts)
 *
 * Lighthouse Phase 2: per-clause prompts include a precedent-context block
 * sourced from the precedent-board.ts state. This test mocks the local
 * Ollama endpoint and asserts:
 *
 *   1. The precedent block is present in the request body when a board is
 *      passed and a Watchman result scopes the search.
 *   2. The block uses [CONFIRMED] vs [TENTATIVE] tags as documented.
 *   3. The pattern name + description from the precedent reach the prompt.
 *   4. precedentsConsulted appears in the result when the model echoes a
 *      precedent ID, OR when the board returned matches.
 *   5. No precedent block when the board is omitted (legacy path).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { analyzeLocally } from '../../src/claw/local-analysis.js';
import { PrecedentBoard } from '../../src/claw/precedent-board.js';
import type { ClawProfile, WatchmanResult } from '../../src/claw/types.js';
import type { PrecedentEntry } from '../../src/mcp/tools/memory-system.js';

// ── Helpers ──────────────────────────────────────────────────────────────

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'reader-prec-test-'));
}

function makeProfile(overrides: Partial<ClawProfile> = {}): ClawProfile {
  return {
    company: 'Acme Holdings',
    jurisdiction: 'NSW',
    industry: 'mining',
    size: 'mid',
    concerns: ['penalty clauses'],
    preferences: { style: 'plain-language', intensity: 'standard', riskAppetite: 'conservative' },
    watchPaths: ['/tmp/test'],
    budget: { totalUsd: 100, perDocumentMaxUsd: 5 },
    processing: 'local',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeWatchman(overrides: Partial<WatchmanResult> = {}): WatchmanResult {
  return {
    documentType: 'jv',
    jurisdiction: 'NSW',
    confidence: 0.95,
    urgency: 'routine',
    route: 'deep-read',
    readerTemplate: 'jv',
    rationale: 'JV agreement.',
    method: 'llm-local',
    costUsd: 0,
    ...overrides,
  };
}

/** Inject a precedent directly into board state (bypasses indexFindings'
 *  significance filter). */
function injectPrecedent(board: PrecedentBoard, overrides: Partial<PrecedentEntry>): PrecedentEntry {
  const id = overrides.id ?? `PREC-${Math.random().toString(36).slice(2, 10)}`;
  const now = new Date().toISOString();
  const entry: PrecedentEntry = {
    id,
    documentType: 'jv',
    jurisdiction: 'NSW',
    patternName: 'Penalty Clause Risk',
    description: 'Liquidated damages clauses of more than $100k/week have been challenged as unenforceable penalties under Australian law.',
    beforeSnippet: 'liquidated damages of AUD 500,000 per week',
    afterSnippet: '',
    qualityScore: 0.9,
    addedAt: now,
    timesUsed: 3,
    timesQueried: 0,
    effectivenessScore: 0.7,
    outcomes: [{ sessionId: 's1', timestamp: now, applied: true, scoreDelta: 0.1, verificationPassed: true }],
    deprecated: false,
    status: 'tentative',
    tags: { documentType: 'jv', jurisdiction: 'NSW', custom: ['penalty-clause-risk'] },
    ...overrides,
  };
  board.getState().entries[id] = entry;
  board.save();
  return entry;
}

// Build a tiny but well-formed JSON response matching the Reader's per-clause
// schema. We return one specific concern so the grounding pass keeps it.
function ollamaPerClauseResponse(extra: Record<string, unknown> = {}) {
  return {
    choices: [{
      message: {
        content: JSON.stringify({
          clauseRiskSummary: 'Penalty clause exposure.',
          operative_text: 'liquidated damages of AUD 500,000 per week of delay',
          concerns: [{
            text: 'Clause 2 specifies AUD 500,000/week — risk of unenforceability under NSW penalty doctrine.',
            severity: 'major',
            references: ['AUD 500,000', 'cl 2'],
          }],
          favoursWhom: 'non-operator',
          ...extra,
        }),
      },
    }],
  };
}

function ollamaSynthesisResponse() {
  return {
    choices: [{
      message: {
        content: JSON.stringify({
          summary: 'Acme is exposed on a penalty clause that may be unenforceable in NSW.',
          documentType: 'JV',
          topRisks: [{
            description: 'AUD 500k/week penalty may be unenforceable.',
            severity: 'high',
            citation: 'cl 2',
          }],
          recommendations: ['Reduce penalty amount or restructure as genuine pre-estimate of loss.'],
        }),
      },
    }],
  };
}

// ── Test setup ───────────────────────────────────────────────────────────

let dir: string;
let board: PrecedentBoard;

beforeEach(() => {
  dir = tmpDir();
  board = new PrecedentBoard(dir);
});

afterEach(() => {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  vi.restoreAllMocks();
});

// ── Tests ────────────────────────────────────────────────────────────────

describe('Reader · precedent injection', () => {
  it('injects a precedent context block into per-clause prompts when board + watchman are provided', async () => {
    injectPrecedent(board, {
      id: 'PREC-PENALTY',
      patternName: 'Penalty Clause Risk',
      description: 'Liquidated damages clauses over $100k/week challenged as penalties.',
    });

    // The fixture has a single clause so the Reader makes 2 calls: 1 per-clause
    // + 1 synthesis. We capture every fetch call.
    const calls: Array<{ url: string; body: string }> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      const body = init?.body ? String(init.body) : '';
      calls.push({ url: String(url), body });
      // First call → per-clause; subsequent → synthesis. Both return valid JSON.
      const isFirst = calls.length === 1;
      return new Response(JSON.stringify(isFirst ? ollamaPerClauseResponse() : ollamaSynthesisResponse()), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      }) as unknown as Response;
    });

    const docText =
      `JOINT VENTURE AGREEMENT\n\n` +
      `2. Penalty for Late Contribution\n` +
      `If a Party fails to deposit the contribution within thirty (30) days of\n` +
      `the Commencement Date, that Party shall pay liquidated damages of AUD\n` +
      `500,000 per week of delay, up to a maximum of AUD 5,000,000.\n`.padEnd(800, ' ');

    const result = await analyzeLocally(
      docText, 'jv.docx', makeProfile(), undefined,
      { precedentBoard: board, watchman: makeWatchman() },
    );

    expect(calls.length).toBeGreaterThanOrEqual(1);
    // First call is the per-clause prompt — it must contain the precedent block
    const perClauseBody = calls[0].body;
    expect(perClauseBody).toContain('PRIOR FIRM POSITIONS');
    expect(perClauseBody).toContain('PREC-PENALTY');
    expect(perClauseBody).toContain('Penalty Clause Risk');
    expect(result).toBeDefined();
  });

  it('tags confirmed precedents [CONFIRMED] and tentative precedents [TENTATIVE] in the prompt', async () => {
    injectPrecedent(board, {
      id: 'PREC-OLD-CONFIRMED',
      patternName: 'Confirmed Penalty Pattern',
      description: 'Firm has consistently flagged penalty clauses over a settled threshold.',
      status: 'confirmed',
      timesUsed: 8,
    });
    injectPrecedent(board, {
      id: 'PREC-NEW-TENTATIVE',
      patternName: 'Emerging Indemnity Concern',
      description: 'A newer pattern flagged tentatively.',
      status: 'tentative',
      timesUsed: 2,
    });

    const calls: Array<{ body: string }> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      calls.push({ body: init?.body ? String(init.body) : '' });
      return new Response(JSON.stringify(calls.length === 1 ? ollamaPerClauseResponse() : ollamaSynthesisResponse()), {
        status: 200,
      }) as unknown as Response;
    });

    await analyzeLocally(
      'JOINT VENTURE AGREEMENT\n\n2. Penalty\n' + 'x'.repeat(800),
      'jv.docx',
      makeProfile(),
      undefined,
      { precedentBoard: board, watchman: makeWatchman() },
    );

    const body = calls[0].body;
    expect(body).toContain('[CONFIRMED]');
    expect(body).toContain('[TENTATIVE]');
    // Confirmed precedent should appear BEFORE the tentative one in the prompt
    const confirmedIdx = body.indexOf('PREC-OLD-CONFIRMED');
    const tentativeIdx = body.indexOf('PREC-NEW-TENTATIVE');
    expect(confirmedIdx).toBeGreaterThanOrEqual(0);
    expect(tentativeIdx).toBeGreaterThan(confirmedIdx);
  });

  it('omits the precedent block when no board is provided (legacy path)', async () => {
    const calls: Array<{ body: string }> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      calls.push({ body: init?.body ? String(init.body) : '' });
      return new Response(JSON.stringify(calls.length === 1 ? ollamaPerClauseResponse() : ollamaSynthesisResponse()), {
        status: 200,
      }) as unknown as Response;
    });

    await analyzeLocally(
      'JOINT VENTURE AGREEMENT\n\n2. Penalty\n' + 'x'.repeat(800),
      'jv.docx',
      makeProfile(),
      undefined,
      // No precedentBoard — legacy callers
    );

    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[0].body).not.toContain('PRIOR FIRM POSITIONS');
  });

  it('omits the precedent block when board returns zero matches', async () => {
    // Board exists but has no entries matching jv/NSW
    const calls: Array<{ body: string }> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      calls.push({ body: init?.body ? String(init.body) : '' });
      return new Response(JSON.stringify(calls.length === 1 ? ollamaPerClauseResponse() : ollamaSynthesisResponse()), {
        status: 200,
      }) as unknown as Response;
    });

    await analyzeLocally(
      'JOINT VENTURE AGREEMENT\n\n2. Penalty\n' + 'x'.repeat(800),
      'jv.docx',
      makeProfile(),
      undefined,
      { precedentBoard: board, watchman: makeWatchman() },
    );

    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[0].body).not.toContain('PRIOR FIRM POSITIONS');
  });

  it('records precedentsConsulted in the result when matches were loaded', async () => {
    const inserted = injectPrecedent(board, {
      id: 'PREC-TRACK',
      patternName: 'Penalty Clause Risk',
    });

    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response(JSON.stringify(ollamaPerClauseResponse()), { status: 200 }) as unknown as Response;
    });
    // Use mockImplementation so all calls (per-clause + synthesis) succeed.

    const result = await analyzeLocally(
      'JOINT VENTURE AGREEMENT\n\n2. Penalty\n' + 'x'.repeat(800),
      'jv.docx',
      makeProfile(),
      undefined,
      { precedentBoard: board, watchman: makeWatchman() },
    );

    // The result should include the precedent ID we seeded.
    expect(result.precedentsConsulted).toBeDefined();
    expect(result.precedentsConsulted!).toContain(inserted.id);
  });

  it('selects the document-type template based on Watchman documentType', async () => {
    // The Reader's per-clause system prompt is template-selected. By comparing
    // request bodies for jv vs nda, we prove the template differs.
    const ndaBoard = new PrecedentBoard(tmpDir());

    const calls: Array<{ body: string }> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      calls.push({ body: init?.body ? String(init.body) : '' });
      // First per-clause; subsequent synthesis
      return new Response(JSON.stringify(
        calls.length % 2 === 1 ? ollamaPerClauseResponse() : ollamaSynthesisResponse()
      ), { status: 200 }) as unknown as Response;
    });

    const docText = '1. Term\nThe term is three years.\n' + 'x'.repeat(800);

    await analyzeLocally(docText, 'doc.docx', makeProfile(), undefined,
      { precedentBoard: board, watchman: makeWatchman({ documentType: 'jv', readerTemplate: 'jv' }) });
    const jvBody = calls[calls.length - 2]?.body ?? calls[0].body;

    calls.length = 0;
    await analyzeLocally(docText, 'doc.docx', makeProfile(), undefined,
      { precedentBoard: ndaBoard, watchman: makeWatchman({ documentType: 'nda', readerTemplate: 'nda' }) });
    const ndaBody = calls[calls.length - 2]?.body ?? calls[0].body;

    // Different templates should produce different system prompts. We don't
    // assert the exact template content, just that the Reader is in fact
    // sending different prompts for the two document types.
    expect(jvBody).not.toBe(ndaBody);
  });
});
