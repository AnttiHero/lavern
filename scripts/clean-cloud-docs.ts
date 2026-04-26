/**
 * Take the two messy transcripts (Review, FullForce), pass them through
 * Sonnet 4.5 with a strict "extract ONLY the client-facing memo" prompt,
 * and rewrite the DOCX on Desktop with the clean version.
 *
 * Counsel is already clean (used assembled_document) — skip it.
 */
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'node:fs';
// Inline minimal .env loader (avoid extra dep)
for (const line of readFileSync('.env', 'utf8').split('\n')) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}
import Database from 'better-sqlite3';
import { writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { convertToDocx } from '../src/assembly/format-converter.js';

const SYSTEM = `You are a senior legal editor. You receive a raw multi-agent workflow transcript that contains:
- Orchestrator narration ("I'll dispatch the specialist…", "Step 1: INTAKE", "Now advancing…")
- Subagent JSON envelopes with token counts, agentIds, and internal prompts
- Process metadata ("Verification Report:", "Pipeline integrity:", "Evaluator gate passed", "Final spend:")
- The actual client-facing legal memo, embedded somewhere in the middle

Your task: extract ONLY the client-facing memo. Reproduce its full text verbatim — do not summarise, do not shorten, do not paraphrase. Strip:
- All orchestrator narration and step markers ("Step 1: INTAKE", "Now dispatching…")
- All JSON envelopes, agent metadata, token counts, cost numbers
- All evaluator/pipeline/verification scaffolding
- "End of Memo" / "End of Advice" terminator markers (the memo ends naturally before them)
- Any preamble before the first proper memo heading (Executive Summary, Memorandum, Re:, etc.)

The output should read as a finished memo a partner would send to a client. Begin with the memo's first real heading. Use proper markdown (# / ## / ### / lists / **bold**).

If the input contains a Q1–Q10 numbered analysis, preserve every question's answer in full with all clause quotations and case citations intact.

Output the cleaned memo only — no preamble, no commentary, no XML tags.`;

const client = new Anthropic();

async function clean(raw: string, label: string): Promise<string> {
  console.log(`[${label}] sending ${raw.length} chars to Sonnet 4.5…`);
  const stream = await client.messages.stream({
    model: 'claude-sonnet-4-5',
    max_tokens: 32_000,
    system: SYSTEM,
    messages: [{ role: 'user', content: raw }],
  });
  let text = '';
  for await (const evt of stream) {
    if (evt.type === 'content_block_delta' && evt.delta.type === 'text_delta') {
      text += evt.delta.text;
    }
  }
  const final = await stream.finalMessage();
  console.log(`[${label}] cleaned to ${text.length} chars (in=${final.usage.input_tokens} out=${final.usage.output_tokens})`);
  return text;
}

async function main() {
  const db = new Database(join(process.cwd(), 'data/lavern.db'), { readonly: true });
  const desktop = join(homedir(), 'Desktop');
  const today = '2026-04-26';

  const targets = [
    { id: 'shem-1777242134995-3cd375b8e22550273941f2e2ca0bfdb1', label: 'Review',    short: 'Lavern-Review-Cloud-Opus47',    title: 'Cobaridge JV — Review (Cloud · Opus 4.7)' },
    { id: 'shem-1777242175393-c1193112f8a28d8ec8d18a606685357a', label: 'FullForce', short: 'Lavern-FullForce-Cloud-Opus47', title: 'Cobaridge JV — Full Force (Cloud · Opus 4.7)' },
  ];

  for (const t of targets) {
    const row = db.prepare('SELECT final_output FROM session_archive WHERE id = ?').get(t.id) as any;
    if (!row?.final_output) { console.log(`MISSING ${t.label}`); continue; }

    const cleaned = await clean(row.final_output, t.label);
    writeFileSync(join(desktop, `${t.short}-${today}.md`), cleaned);
    const buf = await convertToDocx(cleaned, t.title, 'traditional');
    writeFileSync(join(desktop, `${t.short}-${today}.docx`), buf);
    console.log(`[${t.label}] wrote DOCX (${buf.length} bytes)`);
  }

  db.close();
}

main().catch(err => { console.error(err); process.exit(1); });
