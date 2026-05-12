/**
 * Local Gemma 4 26B end-to-end test against the Bellrock JV docs.
 *
 * Pipeline:
 *   1. Parse the JV Agreement DOCX → markdown
 *   2. Build the same 10-question prompt used in cloud Counsel
 *   3. Send to local Gemma 4 26B via the local provider's chat API
 *   4. Convert response to DOCX, write to Desktop
 *
 * No cloud API calls. Demonstrates the on-device pipeline end-to-end.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseDocument } from '../src/documents/parser.js';
import { localChat, checkLocalReady } from '../src/providers/local.js';
import { convertToDocx } from '../src/assembly/format-converter.js';
import { config } from '../src/config.js';

// load .env
for (const line of readFileSync('.env', 'utf8').split('\n')) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}

const QUESTIONS = `
**Q1.** A $9.8M tenement acquisition is proposed. Hartogen says cl 6.5 simple majority applies (it's under the $10M cl 6.6(c) reserved threshold). Cobaridge wants to invoke cl 6.6(b) "change to scope of the JV or Project". Who is right and what's the strongest argument either way?

**Q2.** A Cash Call is missed by Cobaridge by 1 day (paid day 11 instead of day 10). Hartogen invokes cl 9.3 dilution. Is this a penalty under *Andrews v ANZ* (2012) and *Paciocco v ANZ* (2016)? Any equitable relief?

**Q3.** Hartogen has charged $2.1M of "internal costs" (Perth HO executive remuneration + group insurance) under cl 8.4. Cobaridge believes this duplicates the cl 8.4 management fee (3%/2%). What are Cobaridge's audit and dispute rights and recovery prospects?

**Q4.** Hartogen invokes cl 13 Sole Risk for further Bellrock feasibility work, claiming the 200% premium recoverable from Cobaridge's production share. Cobaridge says cl 13 was meant for new discoveries, not the known resource. Who has the better construction argument?

**Q5.** A Singapore consortium will acquire 100% of Hartogen. Does this trigger cl 16 change of control? FATA implications? What's Cobaridge's pre-emptive right under cl 16.7?

**Q6.** A 50/50 deadlock arises on the Year 3 Programme & Budget. Cl 6.7 expert determination is the fallback but expert appointment is itself disputed. What's the path forward?

**Q7.** Hartogen unilaterally released drill assays to ASX. Cobaridge wasn't consulted. Cl 17 confidentiality + JORC disclosure obligations. Cobaridge's remedies?

**Q8.** Cl 18.7 excludes fiduciary duties between participants. Is this enforceable? Effect on Hartogen's freedom of action as Operator + 60% participant?

**Q9.** A $30M loss occurs from Hartogen's gross negligence as Operator. Cl 18.2/18.3 cap liability at $24M. Will an NSW court read down the cap? Removal of Operator under cl 8.6(d)?

**Q10.** What strategic action sequence should the Cobaridge Board take ahead of the 5 December 2026 Board meeting?
`.trim();

async function main() {
  // 1. Pre-flight check
  console.log('[1/4] Checking local Gemma readiness…');
  const err = await checkLocalReady(config.local.defaultModel);
  if (err) {
    console.error('FAIL: ' + err);
    process.exit(1);
  }
  console.log(`      OK — ${config.local.defaultModel} loaded.`);

  // 2. Parse JV Agreement
  console.log('[2/4] Parsing Bellrock_JV_Agreement.docx…');
  const jvBytes = readFileSync(join(homedir(), 'Desktop/Bellrock_JV_Agreement.docx'));
  const parsed = await parseDocument(jvBytes, 'Bellrock_JV_Agreement.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  console.log(`      OK — ${parsed.fullText.length} chars extracted.`);

  // 3. Build the prompt
  const system = `You are senior Australian legal counsel advising Cobaridge Resources Limited (40% participant, NON-OPERATOR) on its unincorporated joint venture with Hartogen Metals Limited (60%, Operator) for the Bellrock Copper-Gold Project, Cobar Superbasin, NSW. JV Agreement dated 14 March 2025. Governing law: NSW. Audience: Cobaridge Board + General Counsel Michelle Tran. Deadline: 5 December 2026 Board meeting.

The full text of the JV Agreement is provided below. Read the clauses directly. Quote verbatim where you cite them.

YOUR TASK: Produce a single, structured written advice answering each of the ten questions Q1–Q10 in numbered order, preceded by a SHORT EXECUTIVE SUMMARY identifying the THREE questions on which Cobaridge's exposure is most significant.

For EACH question:
1. Quote the operative clause text (clause number + verbatim words).
2. State Cobaridge's position and Hartogen's strongest counter-argument.
3. Apply NSW/Australian law where relevant — cite cases and legislation.
4. Identify ambiguities and what facts are needed if fact-dependent.
5. Give a CONCRETE recommendation (action item).

Use markdown formatting. Be precise, professional, and direct.

==== JV AGREEMENT (full text) ====

${parsed.fullText}

==== END JV AGREEMENT ====`;

  const user = `Here are the ten interpretive questions Michelle Tran needs answered before the 5 December 2026 Board meeting:

${QUESTIONS}

Produce the structured written advice now. Begin with the EXECUTIVE SUMMARY identifying your top-three exposure rankings, then Q1 through Q10.`;

  console.log(`[3/4] Sending to Gemma 4 26B (system=${system.length} chars, user=${user.length} chars)…`);
  console.log(`      this may take 5–15 minutes on local hardware…`);
  const t0 = Date.now();

  const result = await localChat({
    model: config.local.defaultModel,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: 0.2,
    maxTokens: 16_000,
    timeoutMs: 30 * 60 * 1000,  // 30-min ceiling
  });

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const text = result.message.content || '';
  console.log(`      OK — ${text.length} chars produced in ${elapsed}s, finish=${result.finishReason}`);
  console.log(`      tokens in=${result.usage?.prompt_tokens ?? '?'} out=${result.usage?.completion_tokens ?? '?'}`);

  // 4. Save
  console.log('[4/4] Writing artefacts to Desktop…');
  const desktop = join(homedir(), 'Desktop');
  const today = '2026-04-26';
  const baseName = `Lavern-Counsel-Local-Gemma4-${today}`;

  writeFileSync(join(desktop, `${baseName}.md`), text);
  const docx = await convertToDocx(text, 'Cobaridge JV — Counsel (Local · Gemma 4 26B)', 'traditional');
  writeFileSync(join(desktop, `${baseName}.docx`), docx);

  console.log(`\n      → ${baseName}.docx (${docx.length} bytes)`);
  console.log(`      → ${baseName}.md (${text.length} chars)`);
  console.log(`\n      Cost: $${result.cost.toFixed(4)} (on-device)`);
  console.log(`      Wall time: ${elapsed}s`);
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
