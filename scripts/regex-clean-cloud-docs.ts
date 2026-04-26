/**
 * Deterministic cleanup of Review / FullForce raw transcripts.
 * No LLM dependency — pure regex/structural stripping.
 *
 * Strategy:
 *   1. Strip JSON envelopes (subagent results, evaluator metadata).
 *   2. Strip orchestrator workflow chatter ("## Step N: INTAKE", "I'll dispatch…", "Now…").
 *   3. Strip pipeline metadata ("Verification Report:", "Final spend:", "Evaluator gate passed").
 *   4. Demote `## Step N: TITLE` headings to plain text or strip entirely.
 *   5. Locate the longest contiguous block that *looks like* a memo and emit it.
 */
import Database from 'better-sqlite3';
import { writeFileSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { convertToDocx } from '../src/assembly/format-converter.js';

// load .env (for any future use)
for (const line of readFileSync('.env', 'utf8').split('\n')) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}

function clean(raw: string): string {
  let t = raw;

  // 1. Strip JSON envelopes — subagent results
  for (let pass = 0; pass < 8; pass++) {
    const before = t.length;
    t = t.replace(/\{[^{}]{0,200}"(?:totalDurationMs|totalTokens|totalToolUseCount|agentId|cache_creation_input_tokens|cache_read_input_tokens|service_tier|inference_geo|ephemeral_5m_input_tokens|status":"completed)[^{}]{0,80000}\}/g, '');
    t = t.replace(/\{"status":"completed","prompt":"[\s\S]{0,80000}?"\}\}?/g, '');
    t = t.replace(/\{"agentId":"[a-z0-9]+","content":\[[\s\S]{0,80000}?\]\}/g, '');
    if (t.length === before) break;
  }

  // 1b. Strip leading numeric-prefixed JSON-like envelopes ("13:{...}")
  t = t.replace(/^\d+:\{[\s\S]*?(?=\n\d+:|\n##|\n#|\nREVIEW|\nMEMORANDUM|\nEXECUTIVE|\nCOBARIDGE|$)/gm, '');

  // 2. Decode HTML entities
  if (/&(?:quot|apos|amp|lt|gt|#39);/.test(t)) {
    t = t.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#39;/g, "'")
         .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  }

  // 3. Decode literal escape sequences
  if (/\\[ntr"]/.test(t)) {
    t = t.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\r/g, '\r').replace(/\\"/g, '"');
  }

  // 4. Strip orchestrator narration lines (very aggressive)
  const NOISE = [
    /^I['']ll\s+(?:run|dispatch|now|next|start|produce|re-?dispatch|advance|hand|query|finalize|wrap|close)[^\n]*$/gim,
    /^I['']ve\s+(?:already|now|completed|received)[^\n]*$/gim,
    /^Let me\s+(?:now|next|start|dispatch|query|advance|hand|finalize)[^\n]*$/gim,
    /^Now (?:advancing|dispatching|requesting|running|retrieving|finalising|finalizing|querying|opening|closing|handing)[^\n]*$/gim,
    /^Then\s+(?:I|advancing|dispatching)[^\n]*$/gim,
    /^Specialist analysis complete\.?[^\n]*$/gim,
    /^The (?:evaluator|plain-language|specialist|orchestrator) (?:sub-?agent|will|has|should)[^\n]*$/gim,
    /^Dispatching (?:the|a|to|now)[^\n]*$/gim,
    /^Handoff (?:to|complete|recorded)[^\n]*$/gim,
    /^Session\s+complete[^\n]*$/gim,
    /^Workflow complete\.?[^\n]*$/gim,
    /^Workflow Status:[^\n]*$/gim,
    /^All \d+ (?:debates|findings|workflow steps?) (?:resolved|completed)\.?[^\n]*$/gim,
    /^\d+\/\d+ workflow steps completed[^\n]*$/gim,
    /^Resolving all .* findings[^\n]*$/gim,
    /^Final summary for the user[^\n]*$/gim,
    /^Two RED findings on the debate board[^\n]*$/gim,
    /^Coherence audit tool returned[^\n]*$/gim,
    /^Human gate (?:approved|pending)[^\n]*$/gim,
    /^Closing out the workflow[^\n]*$/gim,
    /^Acknowledged\.?\s*Budget:[^\n]*$/gim,
    /^The (?:Counsel|Review|Full-Force|Full-Bench) workflow is complete[^\n]*$/gim,
    /^Final spend:\s*\$[^\n]*$/gim,
    /^Pipeline (?:summary|integrity):[^\n]*$/gim,
    /^Evaluator gate (?:passed|failed)[^\n]*$/gim,
    /^Self-verification V?-?\d+\s+(?:PASSED|FAILED)[^\n]*$/gim,
    /^Decomposition Rationale:[^\n]*$/gim,
    /^Verification Report:[^\n]*$/gim,
    /^Budget:\s*\$\d[^\n]*$/gim,
    /^Three resolutions flagged for human escalation[^\n]*$/gim,
    /^Confidence:\s*\d+%\.?\s*$/gim,
    /^Submitting (?:intake|specialist|evaluator)[^\n]*$/gim,
    /^No prior memory[^\n]*$/gim,
    /^First run\.?[^\n]*$/gim,
    /^Querying (?:memory|knowledge base)[^\n]*$/gim,
    /^Step \d+ (?:complete|begun)\.?[^\n]*$/gim,
    /^OK\.?\s*$/gim,
    /^Good\.?\s*$/gim,
    /^Right\.?\s*$/gim,
    /^Done\.?\s*$/gim,
  ];
  for (const re of NOISE) t = t.replace(re, '');

  // 5. Strip multi-line metadata blocks
  t = t.replace(
    /^(?:Verification Report|Pipeline (?:summary|integrity)|Workflow Status|Decomposition Rationale)[^\n]{0,200}\n(?:[\s\-•*]*(?:Self-verification|Evaluator gate|All \d+|Three resolutions|Human gate|\d+\/\d+|PASSED|FAILED|criteria|workflow steps)[^\n]{0,400}\n?){1,12}/gim,
    '',
  );

  // 5b. Inline-attached "## Step N:" markers (no leading newline) — strip to next \n
  t = t.replace(/##\s*Step\s+\d+\s*[:\-—–][^\n]*/gi, '\n');
  t = t.replace(/(?:Dispatching all (?:three|four|five) workstreams in parallel\.?|All (?:three|four|five) workstreams complete\.?\s*Let me (?:check|advance)[^.]*\.)/gi, '');

  // 6. Remove "## Step N: TITLE" / "## STEP N — TITLE" / "## INTAKE" workflow markers
  // (keep their content — just demote/strip the workflow label)
  t = t.replace(/^#{1,4}\s*Step\s+\d+\s*[:\-—–][^\n]*$/gim, '');
  t = t.replace(/^#{1,4}\s*(?:INTAKE|TRIAGE|SPECIALIST ANALYSIS|EVALUATION|EVALUATOR|ASSEMBLY|HUMAN GATE|DELIVERY)\s*$/gim, '');

  // 7. Hard-stop at end-of-deliverable markers (everything after = transcript wrap-up)
  const STOPS = [
    /\*\*End of (?:Advice|Memo|Brief|Report)\*\*/i,
    /^---\s*\n[\s\S]*?\b(?:End of (?:Advice|Memo)|Workflow complete|Final spend|Pipeline integrity)\b/m,
  ];
  for (const re of STOPS) {
    const m = t.match(re);
    if (m && m.index !== undefined && m.index > 2000) {
      t = t.substring(0, m.index);
      break;
    }
  }

  // 8. Collapse runs of blank lines
  t = t.replace(/\n{3,}/g, '\n\n');

  // 8a. Strip API error leakage that snuck in from cloud failures
  t = t.replace(/Credit balance is too low[\s\S]*$/i, '');
  t = t.replace(/Your credit balance is too low[\s\S]*$/i, '');
  t = t.replace(/Anthropic\s+(?:API|usage)[\s\S]*?(?=\n\n|$)/g, '');

  // 8b. Strip orphan envelope tails ("],"totalDurationMs":..."} blobs)
  t = t.replace(/\],"totalDurationMs"[\s\S]{0,4000}?\}\}\s*/g, '');
  t = t.replace(/^[\s\S]{0,200}"totalDurationMs"[\s\S]{0,4000}?\}\}\s*/gm, '');

  // 8c. Strip orchestrator self-prompts (visible "# YOUR TASK" / "Post key findings" / "Submit findings" sections)
  t = t.replace(/^#+\s*YOUR TASK[\s\S]*?(?=\n##\s+(?:Executive|MEMORANDUM|EXECUTIVE|Cobaridge|Q1|Question 1|Re:|Step\s+\d|.*?Workstream|Memorandum)|\nMEMORANDUM|\nCOBARIDGE|\nRe:\s+|\n##\s+\d+\.|$)/gim, '');
  t = t.replace(/^#+\s*THE TEN QUESTIONS[^\n]*\n/gim, '');
  t = t.replace(/^Post (?:key |all )?findings to[^\n]*$/gim, '');
  t = t.replace(/^Use finding_type[^\n]*$/gim, '');
  t = t.replace(/^Severity:\s*RED[^\n]*$/gim, '');
  t = t.replace(/^For EACH of the[^\n]*$/gim, '');
  t = t.replace(/^Produce a single, structured[^\n]*$/gim, '');

  // 9. Trim leading garbage before first real heading or "MEMORANDUM"/"Re:"
  const headingIdx = t.search(/(?:^|\n)(?:#\s+\S|##\s+(?:Executive|MEMORANDUM|Cobaridge|REVIEW|Re:|Q\d|Question|EXECUTIVE|\d+\.\s)|MEMORANDUM OF ADVICE|COBARIDGE BOARD BRIEFING|Re:\s+|\*\*Q1)/);
  if (headingIdx > 0) t = t.substring(headingIdx);

  return t.trim();
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
    const row = db.prepare('SELECT final_output, cost_usd FROM session_archive WHERE id = ?').get(t.id) as any;
    if (!row?.final_output) { console.log(`MISSING ${t.label}`); continue; }

    const cleaned = clean(row.final_output);
    writeFileSync(join(desktop, `${t.short}-${today}.md`), cleaned);
    const buf = await convertToDocx(cleaned, t.title, 'traditional');
    writeFileSync(join(desktop, `${t.short}-${today}.docx`), buf);
    console.log(`${t.label.padEnd(10)} raw=${row.final_output.length.toString().padStart(6)} → clean=${cleaned.length.toString().padStart(6)} cost=$${row.cost_usd.toFixed(2)} → ${t.short}-${today}.docx`);
  }

  db.close();
}

main().catch(err => { console.error(err); process.exit(1); });
