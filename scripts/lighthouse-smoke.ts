/**
 * Lighthouse end-to-end smoke test.
 *
 * Exercises the three personas against a live local Ollama:
 *   1. Watchman — triages a JV-like doc and a meeting-agenda doc
 *   2. Reader   — analyzeLocally on a tiny JV doc with precedent injection
 *   3. Curator  — runs surface + re-read + consolidation passes
 *
 * Run: LAVERN_LOCAL_ANALYSIS_MODEL=gemma2:2b npx tsx scripts/lighthouse-smoke.ts
 */
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';

import { watchmanTriage } from '../src/claw/watchman.js';
import { analyzeLocally } from '../src/claw/local-analysis.js';
import { runCurator } from '../src/claw/curator.js';
import { DocumentRegistry } from '../src/claw/registry.js';
import { PrecedentBoard } from '../src/claw/precedent-board.js';
import type { ClawProfile } from '../src/claw/types.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lighthouse-smoke-'));
console.log(`tmp dir: ${tmp}`);

const profile: ClawProfile = {
  company: 'Acme Holdings',
  jurisdiction: 'NSW',
  industry: 'mining',
  size: 'mid',
  concerns: ['penalty clauses', 'IP indemnity', 'governing law'],
  preferences: { style: 'plain-language', intensity: 'standard', riskAppetite: 'conservative' },
  watchPaths: [tmp],
  budget: { totalUsd: 100, perDocumentMaxUsd: 5 },
  processing: 'local',
  createdAt: new Date().toISOString(),
};

// ── Fixtures ──────────────────────────────────────────────────────────────
const JV_TEXT = `JOINT VENTURE AGREEMENT

This Joint Venture Agreement ("Agreement") is entered into between
Acme Holdings Pty Ltd ("Acme") and Bellrock Mineral Holdings Pty Ltd
("Bellrock"), each a "Party" and together the "Parties".

Governing law: New South Wales, Australia.

1. Contributions
   Acme shall contribute AUD 5,000,000 in cash on or before the
   Commencement Date. Bellrock shall contribute the East Tenement
   mining lease at an agreed value of AUD 5,000,000.

2. Penalty for Late Contribution
   If Acme fails to deposit the contribution within thirty (30) days of
   the Commencement Date, Acme shall pay liquidated damages of AUD
   500,000 per week of delay, up to a maximum of AUD 5,000,000. The
   Parties acknowledge this amount is a genuine pre-estimate of loss.

3. Termination
   Either Party may terminate this Agreement on 90 days' written notice
   if the joint venture fails to achieve commercial production within
   eighteen (18) months of the Commencement Date.
`;

const AGENDA_TEXT = `Acme Holdings — Internal Meeting Agenda
Date: 2026-05-12 · Room: Bondi
Attendees: A. Singh, M. Tran, P. Dube

1. Q2 budget review
2. Hiring update
3. Office snacks vote (urgent)
4. AOB
`;

const NDA_TEXT = `MUTUAL NON-DISCLOSURE AGREEMENT

Between Acme Holdings Pty Ltd and Bellrock Mineral Holdings Pty Ltd.
Term: 3 years from Effective Date. Governing law: NSW.

1. Confidential Information
   Means any non-public information disclosed by one Party to the other,
   whether marked confidential or not, that a reasonable person would
   understand to be confidential.

2. Obligations
   The Receiving Party shall: (a) use Confidential Information solely for
   the Purpose; (b) protect it with at least the same care as its own
   confidential information; (c) limit disclosure to employees with a
   need-to-know who are bound by equivalent obligations.

3. Penalty
   Breach of this clause carries liquidated damages of AUD 250,000 per
   incident, payable within 7 days of demand.
`;

// ── Helpers ───────────────────────────────────────────────────────────────
function banner(s: string) {
  console.log('\n' + '─'.repeat(72));
  console.log(s);
  console.log('─'.repeat(72));
}

async function timeIt<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now();
  const r = await fn();
  console.log(`  ⏱  ${label}: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  return r;
}

// ── 1. Watchman ───────────────────────────────────────────────────────────
async function testWatchman() {
  banner('TEST 1 · Watchman triage (Ollama)');

  const w1 = await timeIt('JV doc', () => watchmanTriage({
    filename: 'bellrock_jv_v3.docx',
    documentText: JV_TEXT,
    profile,
    localOnly: true,
  }));
  console.log('  JV →', JSON.stringify({
    type: w1.documentType, route: w1.route, urg: w1.urgency,
    juris: w1.jurisdiction, conf: w1.confidence.toFixed(2),
    method: w1.method, template: w1.readerTemplate,
  }));

  const w2 = await timeIt('Agenda', () => watchmanTriage({
    filename: 'meeting_agenda_2026-05-12.md',
    documentText: AGENDA_TEXT,
    profile,
    localOnly: true,
  }));
  console.log('  Agenda →', JSON.stringify({
    type: w2.documentType, route: w2.route,
    method: w2.method, conf: w2.confidence.toFixed(2),
  }));

  const w3 = await timeIt('NDA doc', () => watchmanTriage({
    filename: 'mutual_nda.docx',
    documentText: NDA_TEXT,
    profile,
    localOnly: true,
  }));
  console.log('  NDA →', JSON.stringify({
    type: w3.documentType, route: w3.route,
    method: w3.method, conf: w3.confidence.toFixed(2),
  }));

  // Assertions (loose — local LLMs can be fuzzy)
  const checks: [string, boolean][] = [
    ['JV routed to deep-read or quick-scan', w1.route !== 'skip'],
    ['JV confidence > 0', w1.confidence > 0],
    ['Agenda routed to skip OR quick-scan', w2.route === 'skip' || w2.route === 'quick-scan'],
    ['Watchman never threw', true],
    ['Method is llm-local or heuristic (not cloud)', ['llm-local','heuristic'].includes(w1.method)],
  ];
  for (const [name, ok] of checks) console.log(`    ${ok ? '✅' : '❌'} ${name}`);
  return { w1, w2, w3 };
}

// ── 2. Reader ─────────────────────────────────────────────────────────────
async function testReader(watchmanResult: Awaited<ReturnType<typeof watchmanTriage>>, board: PrecedentBoard) {
  banner('TEST 2 · Reader (analyzeLocally) on JV with precedent context');

  // Seed a relevant precedent so we can verify it gets surfaced
  board.indexFindings('hash-prior-jv', 'jv', 'NSW', [{
    findingType: 'penalty-clause-risk',
    severity: 'RED',
    confidence: 0.92,
    content: 'Liquidated damages clauses of >$100k/week have been challenged as unenforceable penalties under Australian law where the amount is not a genuine pre-estimate of loss.',
    evidence: ['liquidated damages of AUD 500,000 per week of delay'],
  } as never]);
  console.log('  → seeded 1 precedent (penalty-clause-risk, JV, NSW)');

  const result = await timeIt('Reader full pass', () => analyzeLocally(
    JV_TEXT,
    'bellrock_jv_v3.docx',
    profile,
    (m) => console.log(`    [reader] ${m}`),
    { precedentBoard: board, watchman: watchmanResult },
  ));

  console.log('\n  Reader output:');
  console.log('    summary:', result.summary?.slice(0, 200));
  console.log('    risks:', result.risks?.length ?? 0);
  for (const r of (result.risks ?? []).slice(0, 5)) {
    console.log(`      • [${r.severity}] ${r.title} — ${(r.description ?? '').slice(0, 100)}`);
  }
  const checks: [string, boolean][] = [
    ['Reader returned a result', !!result],
    ['Reader produced ≥1 risk OR a summary', (result.risks?.length ?? 0) > 0 || !!result.summary],
  ];
  for (const [name, ok] of checks) console.log(`    ${ok ? '✅' : '❌'} ${name}`);
}

// ── 3. Curator ────────────────────────────────────────────────────────────
async function testCurator(registry: DocumentRegistry, board: PrecedentBoard) {
  banner('TEST 3 · Curator (surface + re-read queue + consolidation)');

  // Seed multiple precedent occurrences so consolidation has something to do
  for (let i = 0; i < 6; i++) {
    board.indexFindings(`hash-${i}`, 'jv', 'NSW', [{
      findingType: 'penalty-clause-risk',
      severity: 'RED',
      confidence: 0.9,
      content: `Recurring penalty pattern across vendor agreements (occurrence ${i}).`,
      evidence: [`liquidated damages clause v${i}`],
    } as never]);
  }
  console.log(`  → board now has ${Object.keys(board.getState().entries).length} entries`);

  const decision = await timeIt('Curator run', () => runCurator({
    registry,
    precedentBoard: board,
    profile,
    doSurface: true,
    doReReadQueue: true,
    doConsolidation: true,
  }));

  console.log('\n  Curator decision:');
  console.log('    surface:', decision.surface ? `${decision.surface.severity} · ${decision.surface.title}` : '(none)');
  console.log('    reReadQueue:', decision.reReadQueue.length, 'docs');
  console.log('    promoteToConfirmed:', decision.promoteToConfirmed.length, 'precedents');
  console.log('    driftDetected:', decision.driftDetected.length);
  console.log('    requestFrontierEscalation:', decision.requestFrontierEscalation.length);

  const checks: [string, boolean][] = [
    ['Curator returned a decision', !!decision],
    ['reReadQueue is an array', Array.isArray(decision.reReadQueue)],
    ['promoteToConfirmed is an array', Array.isArray(decision.promoteToConfirmed)],
    ['Curator never threw', true],
  ];
  for (const [name, ok] of checks) console.log(`    ${ok ? '✅' : '❌'} ${name}`);
}

// ── Main ──────────────────────────────────────────────────────────────────
(async () => {
  const registry = new DocumentRegistry(tmp, 100);
  const board = new PrecedentBoard(tmp);

  try {
    const { w1 } = await testWatchman();
    await testReader(w1, board);
    await testCurator(registry, board);
    banner('✅ Lighthouse smoke test complete');
  } catch (err) {
    console.error('\n❌ Smoke test failed:', err);
    process.exitCode = 1;
  } finally {
    // Cleanup
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
  }
})();
