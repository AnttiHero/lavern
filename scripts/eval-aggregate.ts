/**
 * Cross-doc aggregate analyser for the v3 10-doc eval.
 *
 * Reads `evals/jv/runs/*.jsonl` and produces a single summary table with
 * the key signals: chunk counts, precedent injection rate, profile-leak
 * detection in summaries, Watchman jurisdiction profile-leak.
 *
 * Run: npx tsx scripts/eval-aggregate.ts
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RUNS_DIR = path.resolve(__dirname, '..', 'evals', 'jv', 'runs');
const EVAL_DIR = path.resolve(__dirname, '..', 'evals', 'jv');

// Profile fields the eval set as "Acme Holdings / mining / NSW / investment"
const PROFILE_LEAK_TOKENS = [
  'acme holdings', 'acme', 'mining', 'new south wales', 'nsw',
  'exploration', 'australia',
];

interface DocRow {
  filename: string;
  charCount: number;
  watchman: { type: string; route: string; juris: string; conf: number } | null;
  watchmanJurisLeakedNSW: boolean;
  clauseCount: number;
  perClausePrompts: number;
  promptsWithPrecedentBlock: number;
  distinctPrecedentIds: number;
  riskCount: number;
  unanchoredStripped: number;
  precedentsConsulted: number;
  summary: string;
  summaryHasProfileLeak: boolean;
  summaryProfileLeakTokens: string[];
  summaryHasPlaceholders: boolean;
  totalMs: number;
}

function parseLine(line: string): Record<string, unknown> | null {
  try { return JSON.parse(line); } catch { return null; }
}

function analyseDoc(jsonlPath: string): DocRow {
  const filename = path.basename(jsonlPath, '.jsonl');
  const lines = fs.readFileSync(jsonlPath, 'utf8').split('\n').filter(Boolean);

  let charCount = 0;
  let totalMs = 0;
  let watchman: DocRow['watchman'] = null;
  const perClausePrompts: Array<{ hasBlock: boolean; precIds: string[] }> = [];
  let reader: { riskCount: number; unanchoredStripped: number; precedentsConsulted: number; summary: string; clauseCount: number } | null = null;

  for (const line of lines) {
    const e = parseLine(line);
    if (!e) continue;

    if (e.kind === 'doc-start') charCount = Number(e.charCount ?? 0);
    if (e.kind === 'doc-end') totalMs = Number(e.totalMs ?? 0);

    if (e.kind === 'watchman-result') {
      watchman = {
        type: String(e.documentType ?? ''),
        route: String(e.route ?? ''),
        juris: String(e.jurisdiction ?? ''),
        conf: Number(e.confidence ?? 0),
      };
    }

    if (e.kind === 'prompt') {
      const user = String(e.user ?? '');
      if (user.includes('=== CLAUSE')) {
        const hasBlock = user.includes('PRIOR FIRM POSITIONS');
        const precIds = user.match(/PREC-[a-z0-9]+/g) ?? [];
        perClausePrompts.push({ hasBlock, precIds });
      }
    }

    if (e.kind === 'reader-result') {
      reader = {
        riskCount: Array.isArray(e.risks) ? e.risks.length : 0,
        unanchoredStripped: Number(e.unanchoredStripped ?? 0),
        precedentsConsulted: Array.isArray(e.precedentsConsulted) ? e.precedentsConsulted.length : 0,
        summary: String(e.summary ?? ''),
        clauseCount: Array.isArray(e.clauses) ? e.clauses.length : 0,
      };
    }
  }

  const summary = reader?.summary ?? '';
  const summaryLower = summary.toLowerCase();
  const profileLeakTokens = PROFILE_LEAK_TOKENS.filter(t => summaryLower.includes(t));
  const placeholderRegex = /\[(?:other|the |a |another )?(?:party|venture|purpose|jurisdiction|date|amount|insert|placeholder|tbd|unknown)[^\]]*\]/i;

  const allPrecIds = new Set<string>();
  perClausePrompts.forEach(p => p.precIds.forEach(id => allPrecIds.add(id)));

  return {
    filename,
    charCount,
    watchman,
    watchmanJurisLeakedNSW: watchman ? /\bnsw\b/i.test(watchman.juris) : false,
    clauseCount: reader?.clauseCount ?? 0,
    perClausePrompts: perClausePrompts.length,
    promptsWithPrecedentBlock: perClausePrompts.filter(p => p.hasBlock).length,
    distinctPrecedentIds: allPrecIds.size,
    riskCount: reader?.riskCount ?? 0,
    unanchoredStripped: reader?.unanchoredStripped ?? 0,
    precedentsConsulted: reader?.precedentsConsulted ?? 0,
    summary,
    summaryHasProfileLeak: profileLeakTokens.length > 0,
    summaryProfileLeakTokens: profileLeakTokens,
    summaryHasPlaceholders: placeholderRegex.test(summary),
    totalMs,
  };
}

const files = fs.readdirSync(RUNS_DIR).filter(f => f.endsWith('.jsonl')).sort();
const rows = files.map(f => analyseDoc(path.join(RUNS_DIR, f)));

// ── Per-doc table ───────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(120));
console.log('v3 EVAL — per-doc table');
console.log('═'.repeat(120));
console.log('Doc'.padEnd(30) + ' | ' +
            'WChars'.padStart(7) + ' | ' +
            'Type'.padStart(5) + ' | ' +
            'Juris'.padEnd(22) + ' | ' +
            'Clauses'.padStart(7) + ' | ' +
            'PrecBlk'.padStart(7) + ' | ' +
            'Risks'.padStart(5) + ' | ' +
            'Leak'.padStart(4) + ' | ' +
            'Plchd'.padStart(5) + ' | ' +
            'Time'.padStart(5));
console.log('─'.repeat(120));
for (const r of rows) {
  const slug = r.filename.slice(0, 28);
  const juris = (r.watchman?.juris ?? '').slice(0, 22);
  console.log(
    slug.padEnd(30) + ' | ' +
    String(r.charCount).padStart(7) + ' | ' +
    String(r.watchman?.type ?? '').padStart(5) + ' | ' +
    juris.padEnd(22) + ' | ' +
    String(r.clauseCount).padStart(7) + ' | ' +
    `${r.promptsWithPrecedentBlock}/${r.perClausePrompts}`.padStart(7) + ' | ' +
    String(r.riskCount).padStart(5) + ' | ' +
    (r.summaryHasProfileLeak ? 'YES'.padStart(4) : '-'.padStart(4)) + ' | ' +
    (r.summaryHasPlaceholders ? 'YES'.padStart(5) : '-'.padStart(5)) + ' | ' +
    `${(r.totalMs/1000).toFixed(0)}s`.padStart(5)
  );
}

// ── Aggregate ────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(80));
console.log('AGGREGATE — v3 across all docs');
console.log('═'.repeat(80));
const n = rows.length;
const chunkSum = rows.reduce((a, r) => a + r.clauseCount, 0);
const promptSum = rows.reduce((a, r) => a + r.perClausePrompts, 0);
const blockSum = rows.reduce((a, r) => a + r.promptsWithPrecedentBlock, 0);
const docsWithBlock = rows.filter(r => r.promptsWithPrecedentBlock > 0).length;
const docsWithLeak = rows.filter(r => r.summaryHasProfileLeak).length;
const docsWithPlaceholder = rows.filter(r => r.summaryHasPlaceholders).length;
const docsWithJurisNSWLeak = rows.filter(r => r.watchmanJurisLeakedNSW).length;
const riskSum = rows.reduce((a, r) => a + r.riskCount, 0);
const timeSum = rows.reduce((a, r) => a + r.totalMs, 0);

console.log(`Documents:                ${n}`);
console.log(`Total clauses chunked:    ${chunkSum} (avg ${(chunkSum/n).toFixed(1)}/doc)`);
console.log(`Total per-clause prompts: ${promptSum}`);
console.log(`Prompts w/ precedent blk: ${blockSum}/${promptSum} = ${(blockSum/Math.max(1,promptSum)*100).toFixed(0)}%`);
console.log(`Docs w/ ≥1 precedent inj: ${docsWithBlock}/${n}`);
console.log(`Docs w/ profile leak:     ${docsWithLeak}/${n}  ← lower is better`);
console.log(`Docs w/ placeholders:     ${docsWithPlaceholder}/${n}  ← lower is better`);
console.log(`Watchman NSW-leaked:      ${docsWithJurisNSWLeak}/${n}  ← lower is better`);
console.log(`Total risks emitted:      ${riskSum} (avg ${(riskSum/n).toFixed(1)}/doc)`);
console.log(`Total wall-clock:         ${(timeSum/1000).toFixed(0)}s (${(timeSum/60000).toFixed(1)} min)`);

// ── Per-doc full summaries (read-only, for human review) ─────────────────
console.log('\n' + '═'.repeat(80));
console.log('SUMMARIES — for human read-through');
console.log('═'.repeat(80));
for (const r of rows) {
  console.log(`\n── ${r.filename} ──`);
  console.log(`Watchman: ${r.watchman?.type}/${r.watchman?.route} · juris="${r.watchman?.juris}" · conf=${r.watchman?.conf?.toFixed(2)}`);
  console.log(`Clauses: ${r.clauseCount} · Precedent injection: ${r.promptsWithPrecedentBlock}/${r.perClausePrompts} (distinct prec ids: ${r.distinctPrecedentIds})`);
  if (r.summaryHasProfileLeak) console.log(`⚠ Profile leak: ${r.summaryProfileLeakTokens.join(', ')}`);
  if (r.summaryHasPlaceholders) console.log(`⚠ Has placeholder brackets`);
  console.log(`Summary: ${r.summary.slice(0, 350)}`);
}

// Save the structured output
fs.writeFileSync(path.join(EVAL_DIR, '_score-v3.json'), JSON.stringify({ rows, aggregate: { n, chunkSum, promptSum, blockSum, docsWithBlock, docsWithLeak, docsWithPlaceholder, docsWithJurisNSWLeak, riskSum, timeSum } }, null, 2));
console.log(`\n→ Structured signals saved to evals/jv/_score-v3.json`);

// Curator (if available)
const curatorPath = path.join(RUNS_DIR, '_curator.json');
if (fs.existsSync(curatorPath)) {
  const cur = JSON.parse(fs.readFileSync(curatorPath, 'utf8'));
  console.log('\n── Curator decision ──');
  console.log(`surface: ${cur.decision.surface ? `${cur.decision.surface.severity} · ${cur.decision.surface.title}` : '(none)'}`);
  if (cur.decision.surface) console.log(`         ${cur.decision.surface.message}`);
  console.log(`reReadQueue: ${cur.decision.reReadQueue.length}`);
  console.log(`promoteToConfirmed: ${cur.decision.promoteToConfirmed.length}`);
  console.log(`Board status: ${JSON.stringify(cur.boardSummary)}`);
}
