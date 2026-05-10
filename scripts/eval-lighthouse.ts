/**
 * Lighthouse end-to-end evaluation on real CUAD JV contracts.
 *
 * Flight-recorder approach: wraps global fetch to log every request +
 * response to evals/jv/runs/<doc>.jsonl. Then runs Watchman → Reader →
 * Curator on each contract in sequence, populating a shared precedent
 * board so docs 2 and 3 benefit from doc 1's findings.
 *
 * Run: LAVERN_LOCAL_ANALYSIS_MODEL=gemma2:2b npx tsx scripts/eval-lighthouse.ts
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { watchmanTriage } from '../src/claw/watchman.js';
import { analyzeLocally } from '../src/claw/local-analysis.js';
import { runCurator } from '../src/claw/curator.js';
import { DocumentRegistry } from '../src/claw/registry.js';
import { PrecedentBoard } from '../src/claw/precedent-board.js';
import type { ClawProfile } from '../src/claw/types.js';
import type { Finding } from '../src/types/debate.js';

const ROOT = path.resolve(__dirname, '..');
const EVAL_DIR = path.join(ROOT, 'evals', 'jv');
const RUNS_DIR = path.join(EVAL_DIR, 'runs');
fs.mkdirSync(RUNS_DIR, { recursive: true });

// ── Profile ───────────────────────────────────────────────────────────────
const profile: ClawProfile = {
  company: 'Acme Holdings',
  jurisdiction: 'NSW',
  industry: 'investment',
  size: 'mid',
  concerns: [
    'joint and several liability',
    'capital call mechanics',
    'governing law',
    'penalty / liquidated damages',
    'indemnification carve-outs',
  ],
  preferences: { style: 'plain-language', intensity: 'standard', riskAppetite: 'conservative' },
  watchPaths: [],
  budget: { totalUsd: 100, perDocumentMaxUsd: 5 },
  processing: 'local',
  createdAt: new Date().toISOString(),
};

// ── Persistent board across docs (the lighthouse claim under test) ────────
const boardDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-board-'));
const board = new PrecedentBoard(boardDir);
const registry = new DocumentRegistry(boardDir, 100);

// ── Flight recorder: intercept fetch ──────────────────────────────────────
let currentLogStream: fs.WriteStream | null = null;
let callCounter = 0;

/** Safe write — drops events when no stream is open (e.g., Curator pass after
 *  all per-doc logs are closed). The eval script's stream lifecycle is its
 *  problem, not the production pipeline's. */
function safeLog(obj: Record<string, unknown>): void {
  if (currentLogStream && !currentLogStream.writableEnded) {
    currentLogStream.write(JSON.stringify(obj) + '\n');
  }
}

const originalFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
  const callId = ++callCounter;
  const startedAt = Date.now();
  const body = init?.body ? String(init.body) : '';
  safeLog({ kind: 'request', callId, url: String(url), bodyLen: body.length });

  // Parse + log the actual prompt so we can grade content later
  try {
    const parsed = JSON.parse(body);
    if (parsed.messages) {
      safeLog({
        kind: 'prompt', callId,
        model: parsed.model,
        system: typeof parsed.messages?.[0]?.content === 'string'
          ? parsed.messages[0].content.slice(0, 500) : '',
        user: typeof parsed.messages?.[1]?.content === 'string'
          ? parsed.messages[1].content : '',
      });
    }
  } catch { /* not JSON */ }

  const resp = await originalFetch(url, init);
  const elapsedMs = Date.now() - startedAt;

  // Clone the response so we can both log AND return readable
  const respClone = resp.clone();
  try {
    const respJson = await respClone.json() as { choices?: Array<{ message?: { content: string } }> };
    const content = respJson.choices?.[0]?.message?.content ?? '';
    safeLog({
      kind: 'response', callId, elapsedMs, status: resp.status,
      contentLen: content.length,
      content,
    });
  } catch (err) {
    safeLog({
      kind: 'response-error', callId, elapsedMs, status: resp.status,
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return resp;
}) as typeof fetch;

// ── Per-document run ──────────────────────────────────────────────────────
async function runOne(filePath: string, docIndex: number, total: number) {
  const filename = path.basename(filePath);
  const stem = filename.replace(/\.txt$/, '');
  const text = fs.readFileSync(filePath, 'utf8');

  // Open the per-doc log
  const logPath = path.join(RUNS_DIR, `${stem}.jsonl`);
  currentLogStream = fs.createWriteStream(logPath, { flags: 'w' });
  currentLogStream.write(JSON.stringify({
    kind: 'doc-start', filename, charCount: text.length, docIndex, total,
  }) + '\n');

  const banner = `[${docIndex + 1}/${total}] ${filename} (${text.length} chars)`;
  console.log('\n' + '═'.repeat(72));
  console.log(banner);
  console.log('═'.repeat(72));

  const t0 = Date.now();

  // ── Watchman ────────────────────────────────────────────────────────────
  console.log('→ Watchman triage…');
  const wT0 = Date.now();
  const watchman = await watchmanTriage({
    filename,
    documentText: text,
    profile,
    localOnly: true,
  });
  const wMs = Date.now() - wT0;
  console.log(`  Watchman (${(wMs/1000).toFixed(1)}s): type=${watchman.documentType} route=${watchman.route} ` +
              `juris="${watchman.jurisdiction}" conf=${watchman.confidence.toFixed(2)} method=${watchman.method}`);
  console.log(`  Rationale: ${watchman.rationale.slice(0, 200)}`);
  safeLog({ kind: 'watchman-result', ...watchman, elapsedMs: wMs });

  if (watchman.route === 'skip') {
    console.log('  ⏭  Watchman routed to skip — exiting');
    safeLog({ kind: 'doc-end', skipped: true, totalMs: Date.now() - t0 });
    currentLogStream.end();
    return { watchman, reader: null, findings: 0 };
  }

  // ── Reader ──────────────────────────────────────────────────────────────
  console.log('→ Reader fan-out…');
  const rT0 = Date.now();
  let reader;
  try {
    reader = await analyzeLocally(
      text, filename, profile,
      (m) => console.log(`    ${m}`),
      { precedentBoard: board, watchman },
    );
  } catch (err) {
    console.log(`  ✗ Reader failed: ${err instanceof Error ? err.message : err}`);
    currentLogStream.write(JSON.stringify({
      kind: 'reader-error',
      error: err instanceof Error ? err.message : String(err),
    }) + '\n');
    safeLog({ kind: 'doc-end', totalMs: Date.now() - t0 });
    currentLogStream.end();
    return { watchman, reader: null, findings: 0 };
  }
  const rMs = Date.now() - rT0;
  console.log(`  Reader (${(rMs/1000).toFixed(1)}s): ${reader.clauses.length} clauses, ${reader.risks.length} risks`);
  console.log(`  Unanchored stripped: ${reader.unanchoredStripped ?? 0}`);
  console.log(`  Precedents consulted: ${reader.precedentsConsulted?.length ?? 0}`);
  console.log(`  Summary: ${(reader.summary ?? '').slice(0, 250)}`);
  console.log(`  Top risks:`);
  for (const r of reader.risks.slice(0, 8)) {
    console.log(`    [${r.severity}] ${r.description.slice(0, 120)}${r.description.length > 120 ? '…' : ''} (${r.citation})`);
  }
  safeLog({ kind: 'reader-result', ...reader, elapsedMs: rMs });

  // ── Index findings into the board for the next document ────────────────
  // Convert RiskItem[] → Finding[] roughly. The board needs `findingType`,
  // `evidence` array, `content`, `severity`, `confidence`. We synthesise
  // these from the Reader output so the next document's per-clause prompt
  // can see them in its precedent context.
  const findingsForBoard: Finding[] = reader.risks.map((r, i) => ({
    id: `eval-${stem}-${i}`,
    agentRole: 'reader',
    findingType: deriveFindingType(r.description),
    content: r.description,
    severity: (r.severity === 'critical' ? 'RED'
              : r.severity === 'high' ? 'RED'
              : r.severity === 'medium' ? 'YELLOW'
              : 'GREEN') as Finding['severity'],
    evidence: [r.description.slice(0, 200)],
    confidence: 0.8,
    timestamp: new Date().toISOString(),
  }));
  const indexed = board.indexFindings(`hash-${stem}`, watchman.documentType, watchman.jurisdiction || 'NSW', findingsForBoard);
  console.log(`  → ${indexed} new precedents indexed (board now has ${Object.keys(board.getState().entries).length})`);

  // Also feed the registry so the Curator has something to chew on
  registry.getState().documents[`hash-${stem}`] = {
    path: filePath, name: filename, type: watchman.documentType,
    hash: `hash-${stem}`, sizeBytes: text.length,
    firstSeen: new Date().toISOString(),
    lastModified: new Date().toISOString(),
    lastReviewed: new Date().toISOString(),
    status: 'reviewed',
    findingsSummary: {
      critical: reader.risks.filter(r => r.severity === 'critical').length,
      major: reader.risks.filter(r => r.severity === 'high').length,
      minor: reader.risks.filter(r => r.severity === 'medium' || r.severity === 'low').length,
    },
    costUsd: 0,
  };

  safeLog({ kind: 'doc-end', totalMs: Date.now() - t0 });
  currentLogStream.end();

  return { watchman, reader, findings: reader.risks.length };
}

function deriveFindingType(desc: string): string {
  const d = desc.toLowerCase();
  if (d.includes('penalty') || d.includes('liquidated')) return 'penalty-clause-risk';
  if (d.includes('joint and several') || d.includes('joint-and-several')) return 'joint-several-liability';
  if (d.includes('indemnif')) return 'indemnification-scope';
  if (d.includes('governing law') || d.includes('jurisdiction')) return 'governing-law-risk';
  if (d.includes('confidential')) return 'confidentiality-scope';
  if (d.includes('terminat')) return 'termination-risk';
  if (d.includes('capital') || d.includes('contribution')) return 'capital-call-risk';
  if (d.includes('deadlock') || d.includes('unanimous')) return 'deadlock-risk';
  if (d.includes('force majeure')) return 'force-majeure-scope';
  return 'general-risk';
}

// ── Curator pass at the end ────────────────────────────────────────────────
async function runCuratorEnd() {
  console.log('\n' + '═'.repeat(72));
  console.log('CURATOR — portfolio pass after all documents processed');
  console.log('═'.repeat(72));
  const t0 = Date.now();
  const decision = await runCurator({
    registry, precedentBoard: board, profile,
    doSurface: true, doReReadQueue: true, doConsolidation: true,
  });
  const elapsedMs = Date.now() - t0;
  console.log(`Curator (${(elapsedMs/1000).toFixed(1)}s)`);
  console.log(`  surface: ${decision.surface ? `${decision.surface.severity} · ${decision.surface.title}` : '(none)'}`);
  if (decision.surface) console.log(`           ${decision.surface.message}`);
  console.log(`  reReadQueue:        ${decision.reReadQueue.length} doc(s)`);
  console.log(`  promoteToConfirmed: ${decision.promoteToConfirmed.length} prec(s)`);
  console.log(`  driftDetected:      ${decision.driftDetected.length}`);

  // Write Curator decision to its own log
  fs.writeFileSync(path.join(RUNS_DIR, '_curator.json'), JSON.stringify({
    decision, elapsedMs,
    boardSummary: board.statusCounts(),
    boardEntryCount: Object.keys(board.getState().entries).length,
  }, null, 2));
}

// ── Main ──────────────────────────────────────────────────────────────────
(async () => {
  const docs = fs.readdirSync(EVAL_DIR)
    .filter(f => f.endsWith('.txt'))
    .map(f => path.join(EVAL_DIR, f))
    .sort();

  console.log(`Lighthouse eval — ${docs.length} JV documents`);
  console.log(`Local model: ${process.env.LAVERN_LOCAL_ANALYSIS_MODEL || process.env.LAVERN_LOCAL_DEFAULT_MODEL || 'default'}`);
  console.log(`Board dir:  ${boardDir}`);

  const summary: Array<{ filename: string; watchman: string; route: string; findings: number; ms: number }> = [];
  const grandT0 = Date.now();
  for (const [i, doc] of docs.entries()) {
    const t0 = Date.now();
    const result = await runOne(doc, i, docs.length);
    summary.push({
      filename: path.basename(doc),
      watchman: result.watchman.documentType,
      route: result.watchman.route,
      findings: result.findings,
      ms: Date.now() - t0,
    });
  }

  await runCuratorEnd();

  console.log('\n' + '═'.repeat(72));
  console.log('SUMMARY');
  console.log('═'.repeat(72));
  for (const s of summary) {
    console.log(`  ${s.filename.padEnd(40)} → ${s.watchman}/${s.route} · ${s.findings} risks · ${(s.ms/1000).toFixed(0)}s`);
  }
  console.log(`\nTotal: ${((Date.now() - grandT0) / 1000).toFixed(0)}s`);
  console.log(`\nLogs in ${RUNS_DIR}/`);
})();
