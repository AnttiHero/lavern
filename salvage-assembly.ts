/**
 * Salvage assembly — manually run document assembly for a completed session.
 * Usage: ANTHROPIC_API_KEY=... npx tsx /tmp/salvage-assembly.ts
 */

import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';

const sessionData = JSON.parse(fs.readFileSync('/tmp/session-data.json', 'utf-8'));

// Build the assembly context from session data
const parts: string[] = [];

// Original request (from server log)
parts.push('# ORIGINAL REQUEST');
parts.push(`Draft a complete Terms of Service for HeartConnect, a dating platform.
HeartConnect LLC, incorporated in Delaware, USA. Web + mobile app.
Freemium model with auto-renewing premium subscriptions.
Users: consumers 18+. Tone: user-friendly but legally precise.
Key areas: Privacy/data handling, auto-renewal terms, safety disclaimers,
mandatory arbitration, age restrictions, GDPR compliance for EU users.`);
parts.push('');

// Expert Findings
const findings = sessionData.findings || [];
if (findings.length > 0) {
  parts.push('# EXPERT ANALYSIS FINDINGS');
  parts.push(`${findings.length} findings from the multi-agent analysis panel:\n`);

  const severityOrder = ['RED', 'YELLOW', 'GREEN'];
  for (const severity of severityOrder) {
    const sevFindings = findings.filter((f: any) => f.severity === severity);
    if (sevFindings.length === 0) continue;
    parts.push(`## ${severity} Findings (${sevFindings.length})`);
    for (const f of sevFindings) {
      parts.push(`- **[${f.agent}]** ${f.content}`);
      if (f.evidence?.length > 0) {
        parts.push(`  Evidence: ${f.evidence.join('; ')}`);
      }
    }
    parts.push('');
  }
}

// Instructions
parts.push('# YOUR TASK');
parts.push('Using ALL of the expert analysis above, draft a COMPLETE Terms of Service for HeartConnect.');
parts.push('This must be the actual document — every section, every clause. Not a summary or outline.');
parts.push('Incorporate every finding: fix the RED issues, address the YELLOW concerns, maintain the GREEN strengths.');
parts.push('Use plain, user-friendly language. Include a Table of Contents.');

const assemblyContext = parts.join('\n');

const systemPrompt = `You are a senior legal professional producing a final deliverable document.

You have been given the results of a comprehensive multi-agent analysis — ethics audits, plain-language reviews, service design insights, client-perspective testing, and structured debates. Your job is to draft a complete, professional document that incorporates ALL of these insights.

## Rules

1. Produce ONLY the document itself. No preamble, no commentary, no "here is the document", no explanation of your process. Just the document.
2. The document must be complete — every section, every clause, every provision. Not a summary. Not an outline. The actual document.
3. Incorporate the expert findings DIRECTLY into the text.
4. Use Markdown formatting with proper heading hierarchy (# → ## → ###).
5. Include a Table of Contents at the top.
6. Use user-friendly, plain language as the default. Reserve legal precision for clauses that require it.
7. Where findings conflict, favor the user-protective interpretation.
8. Preserve ALL legal requirements from the brief.
9. Include placeholder brackets [like this] for information that wasn't provided.
10. If the analysis identified problematic provisions, draft BETTER alternatives.

## CRITICAL OUTPUT RULES

Your output will be delivered DIRECTLY to a client as-is. Every word you write becomes the deliverable.
Your FIRST character of output must be "#" for the document title.
ZERO preamble. ZERO commentary. ZERO process notes.`;

async function run() {
  const client = new Anthropic();

  console.log('Running salvage assembly...');
  console.log(`Context: ${assemblyContext.length} chars, ${findings.length} findings`);

  const response = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 16384,
    system: systemPrompt,
    messages: [{ role: 'user', content: assemblyContext }],
  });

  let text = '';
  for (const block of response.content) {
    if (block.type === 'text') text += block.text;
  }

  // Strip any preamble
  const trimmed = text.trim();
  const headingIdx = trimmed.search(/^#{1,6}\s/m);
  const clean = headingIdx > 0 ? trimmed.substring(headingIdx) : trimmed;

  // Save
  fs.writeFileSync('/tmp/salvaged-tos.md', clean);
  console.log(`\nAssembly complete: ${clean.length} chars`);
  console.log(`Saved to /tmp/salvaged-tos.md`);
  console.log(`\nFirst 300 chars:\n${clean.substring(0, 300)}`);

  const usage = response.usage;
  const cost = (usage.input_tokens * 15 / 1_000_000) + (usage.output_tokens * 75 / 1_000_000);
  console.log(`\nTokens: ${usage.input_tokens} in / ${usage.output_tokens} out, ~$${cost.toFixed(2)}`);
}

run().catch(err => {
  console.error('Assembly failed:', err.message);
  process.exit(1);
});
