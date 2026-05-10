/**
 * Read the flight-recorder JSONL logs from `evals/jv/runs/` and produce a
 * structured scoring summary: precedent injection, template vocabulary,
 * hallucination signals, Watchman accuracy.
 *
 * Run: npx tsx scripts/eval-score.ts
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RUNS_DIR = path.resolve(__dirname, '..', 'evals', 'jv', 'runs');
const EVAL_DIR = path.resolve(__dirname, '..', 'evals', 'jv');

interface DocSignals {
  filename: string;
  watchman: {
    documentType: string; route: string; jurisdiction: string;
    confidence: number; method: string; rationale: string;
  } | null;
  prompts: Array<{
    callId: number;
    hasPrecedentBlock: boolean;
    precedentIds: string[];
    jvVocabHits: string[];  // operator, cash call, reserved matter, dilution, deadlock
    ndaVocabHits: string[]; // confidentiality, carve-out, residual
    saasVocabHits: string[];
    isPerClause: boolean;
    isSynthesis: boolean;
  }>;
  responses: Array<{
    callId: number;
    contentLen: number;
    parsed: Record<string, unknown> | null;
    concernCount: number;
    severities: string[];
  }>;
  reader: {
    riskCount: number;
    unanchoredStripped: number;
    precedentsConsulted: string[];
    summary: string;
    risks: Array<{ description: string; severity: string; citation: string }>;
  } | null;
}

function parseLine(line: string): Record<string, unknown> | null {
  try { return JSON.parse(line); } catch { return null; }
}

function scoreDoc(jsonlPath: string): DocSignals {
  const filename = path.basename(jsonlPath, '.jsonl');
  const signals: DocSignals = {
    filename, watchman: null, prompts: [], responses: [], reader: null,
  };

  const lines = fs.readFileSync(jsonlPath, 'utf8').split('\n').filter(Boolean);
  for (const line of lines) {
    const entry = parseLine(line);
    if (!entry) continue;

    if (entry.kind === 'watchman-result') {
      signals.watchman = {
        documentType: String(entry.documentType ?? ''),
        route: String(entry.route ?? ''),
        jurisdiction: String(entry.jurisdiction ?? ''),
        confidence: Number(entry.confidence ?? 0),
        method: String(entry.method ?? ''),
        rationale: String(entry.rationale ?? ''),
      };
    }

    if (entry.kind === 'prompt') {
      const user = String(entry.user ?? '');
      const system = String(entry.system ?? '');
      const hasPrecedentBlock = user.includes('PRIOR FIRM POSITIONS');
      const precedentIds = (user.match(/PREC-[a-z0-9]+/g) ?? []);
      const lower = user.toLowerCase() + ' ' + system.toLowerCase();
      const jvVocab = ['operator', 'non-operator', 'cash call', 'reserved matter', 'dilution', 'deadlock', 'sole risk', 'cure period'];
      const ndaVocab = ['confidential information', 'carve-out', 'residual', 'permitted disclosure'];
      const saasVocab = ['service level', 'uptime', 'dpa', 'subprocessor', 'data ownership'];
      signals.prompts.push({
        callId: Number(entry.callId ?? 0),
        hasPrecedentBlock,
        precedentIds,
        jvVocabHits: jvVocab.filter(v => lower.includes(v)),
        ndaVocabHits: ndaVocab.filter(v => lower.includes(v)),
        saasVocabHits: saasVocab.filter(v => lower.includes(v)),
        isPerClause: user.includes('=== CLAUSE'),
        isSynthesis: system.includes('synthesi') || user.includes('topRisks'),
      });
    }

    if (entry.kind === 'response') {
      const content = String(entry.content ?? '');
      let parsed: Record<string, unknown> | null = null;
      try { parsed = JSON.parse(content); }
      catch {
        const obj = content.match(/\{[\s\S]*\}/);
        if (obj) try { parsed = JSON.parse(obj[0]); } catch { /* */ }
      }
      const concerns = parsed && Array.isArray(parsed.concerns) ? parsed.concerns : [];
      const severities = concerns.map(c => String((c as Record<string, unknown>).severity ?? ''));
      signals.responses.push({
        callId: Number(entry.callId ?? 0),
        contentLen: content.length,
        parsed,
        concernCount: concerns.length,
        severities,
      });
    }

    if (entry.kind === 'reader-result') {
      signals.reader = {
        riskCount: Array.isArray(entry.risks) ? entry.risks.length : 0,
        unanchoredStripped: Number(entry.unanchoredStripped ?? 0),
        precedentsConsulted: Array.isArray(entry.precedentsConsulted)
          ? entry.precedentsConsulted.map(String) : [],
        summary: String(entry.summary ?? ''),
        risks: Array.isArray(entry.risks) ? (entry.risks as Array<Record<string, unknown>>).map(r => ({
          description: String(r.description ?? ''),
          severity: String(r.severity ?? ''),
          citation: String(r.citation ?? ''),
        })) : [],
      };
    }
  }

  return signals;
}

function report(signals: DocSignals[]) {
  console.log('\n' + '═'.repeat(80));
  console.log('LIGHTHOUSE EVAL SCORE — per-doc signals');
  console.log('═'.repeat(80));

  for (const d of signals) {
    console.log('\n── ' + d.filename + ' ──');
    if (d.watchman) {
      console.log(`Watchman: ${d.watchman.documentType} / ${d.watchman.route} · juris="${d.watchman.jurisdiction}" · conf=${d.watchman.confidence.toFixed(2)} · ${d.watchman.method}`);
      console.log(`Rationale: ${d.watchman.rationale.slice(0, 200)}`);
    }
    const perClausePrompts = d.prompts.filter(p => p.isPerClause);
    const withPrecedent = perClausePrompts.filter(p => p.hasPrecedentBlock);
    const allJvVocab = new Set<string>();
    perClausePrompts.forEach(p => p.jvVocabHits.forEach(v => allJvVocab.add(v)));

    console.log(`Per-clause prompts: ${perClausePrompts.length}`);
    console.log(`  with precedent block: ${withPrecedent.length}/${perClausePrompts.length}`);
    console.log(`  JV vocab in prompts: ${[...allJvVocab].join(', ') || '(none)'}`);

    const allPrecIds = new Set<string>();
    perClausePrompts.forEach(p => p.precedentIds.forEach(id => allPrecIds.add(id)));
    console.log(`  Distinct precedent IDs seen in prompts: ${allPrecIds.size}`);

    if (d.reader) {
      console.log(`Reader output:`);
      console.log(`  ${d.reader.riskCount} risks emitted`);
      console.log(`  ${d.reader.unanchoredStripped} unanchored stripped`);
      console.log(`  precedentsConsulted: ${d.reader.precedentsConsulted.length}`);
      console.log(`  Summary: ${d.reader.summary.slice(0, 300)}`);
      console.log(`  Risks:`);
      for (const r of d.reader.risks) {
        console.log(`    [${r.severity.padEnd(8)}] ${r.description.slice(0, 130)}${r.description.length > 130 ? '…' : ''} (${r.citation})`);
      }
    } else {
      console.log(`Reader: (no result — likely skipped or errored)`);
    }
  }

  // ── Cross-doc: did the board compound? ─────────────────────────────────
  console.log('\n' + '═'.repeat(80));
  console.log('CROSS-DOC: did precedent injection compound?');
  console.log('═'.repeat(80));
  for (const [i, d] of signals.entries()) {
    const perClausePrompts = d.prompts.filter(p => p.isPerClause);
    const withPrec = perClausePrompts.filter(p => p.hasPrecedentBlock).length;
    console.log(`  Doc ${i + 1} (${d.filename}): ${withPrec}/${perClausePrompts.length} per-clause prompts had a precedent block`);
  }
  console.log('Expected: 0/N on doc 1 (empty board), increasing on docs 2 + 3.');
}

const files = fs.readdirSync(RUNS_DIR).filter(f => f.endsWith('.jsonl')).sort();
const signals = files.map(f => scoreDoc(path.join(RUNS_DIR, f)));
report(signals);

// Also dump structured data so the report-writing step has clean numbers
fs.writeFileSync(path.join(EVAL_DIR, '_score.json'), JSON.stringify(signals, null, 2));
console.log(`\nStructured signals → ${path.join(EVAL_DIR, '_score.json')}`);

// Read curator output too
const curatorPath = path.join(RUNS_DIR, '_curator.json');
if (fs.existsSync(curatorPath)) {
  const cur = JSON.parse(fs.readFileSync(curatorPath, 'utf8'));
  console.log('\nCurator decision:');
  console.log(`  surface: ${cur.decision.surface ? `${cur.decision.surface.severity} · ${cur.decision.surface.title}` : '(none)'}`);
  if (cur.decision.surface) console.log(`           ${cur.decision.surface.message}`);
  console.log(`  reReadQueue: ${cur.decision.reReadQueue.length}`);
  console.log(`  promoteToConfirmed: ${cur.decision.promoteToConfirmed.length}`);
  console.log(`  driftDetected: ${cur.decision.driftDetected.length}`);
  console.log(`  Board status: ${JSON.stringify(cur.boardSummary)}`);
  console.log(`  Board entries: ${cur.boardEntryCount}`);
}
