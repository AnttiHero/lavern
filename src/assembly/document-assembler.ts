/**
 * Document Assembler — Transforms multi-agent analysis into a professional deliverable.
 *
 * After the multi-agent pipeline completes (analysis, debate, verification, synthesis),
 * this module makes a single focused Claude call to produce the ACTUAL deliverable
 * document — the ToS, the reviewed contract, the research memo, etc.
 *
 * v16: Uses the Anthropic SDK directly (not the Agent SDK) for fast, reliable
 * single-turn API calls. The Agent SDK spawns a full Claude Code subprocess
 * which is overkill for document assembly.
 *
 * v18: Defense-in-depth validation. The assembler now:
 *   1. Validates its own output (rejects process dumps, too-short, no structure)
 *   2. Retries once with a stronger prompt if first attempt fails validation
 *   3. NEVER returns session.finalOutput (the process log) — returns '' on failure
 *   4. Logs validation failures for debugging
 *
 * This is the key differentiator over a single-shot prompt: the assembly call has
 * ALL the multi-agent intelligence (38+ findings, debate resolutions, ethics audit,
 * plain-language review) as context. A single prompt drafts blind. The assembly
 * drafts informed.
 *
 * The assembled document goes into session.assembledDocument (separate from
 * session.finalOutput which retains the process log for audit/debugging).
 */

import Anthropic from '@anthropic-ai/sdk';
import { getAssemblySystemPrompt, buildAssemblyContext } from './assembly-prompts.js';
import { validateDeliverable } from './validate-deliverable.js';
import { eventTimestamp } from '../events/event-bus.js';
import { config } from '../config.js';
import type { SessionState } from '../session/session-state.js';
import type { LegalRequest } from '../types/index.js';

// ── Token Pricing ────────────────────────────────────────────────────────
const PRICING: Record<string, { input: number; output: number }> = {
  'claude-opus-4-6': { input: 15.0, output: 75.0 },
  'claude-sonnet-4-5-20250929': { input: 3.0, output: 15.0 },
};

/** Maximum number of assembly attempts before giving up. */
const MAX_ASSEMBLY_ATTEMPTS = 2;

/** Addendum appended to the user prompt on retry after a failed validation. */
const RETRY_ADDENDUM = `

## CRITICAL — YOUR PREVIOUS OUTPUT WAS REJECTED

Your previous attempt was rejected because it contained process text, internal reasoning,
or did not meet the deliverable quality bar. This is your FINAL attempt.

RULES (violations will cause rejection):
1. Your FIRST character MUST be "#" (a markdown heading).
2. Do NOT include ANY text like "I'll", "Let me", "Here is", "Based on", etc.
3. The output must be the COMPLETE document — not a summary, not a plan, not commentary.
4. The output must have clear section structure with multiple markdown headings.
5. ONLY output the deliverable. Nothing else.`;

/**
 * Assemble the final deliverable document from structured analysis data.
 *
 * Makes a single Claude call with ALL the multi-agent findings as context.
 * Returns the assembled markdown document, or '' if assembly fails.
 *
 * IMPORTANT: This function NEVER returns session.finalOutput. If assembly
 * fails, it returns an empty string. The caller (executor.ts) and downstream
 * consumers (download endpoint, Claw delivery) must handle the empty case.
 */
export async function assembleDocument(
  session: SessionState,
  request?: LegalRequest,
): Promise<string> {
  // Determine request type for prompt selection
  const requestType = request?.type
    ?? (session.workflowTemplateId === 'roundtable' ? 'document_redesign'
      : session.workflowTemplateId === 'review' ? 'contract_review'
      : session.workflowTemplateId === 'adversarial' ? 'legal_research'
      : 'general');

  const systemPrompt = getAssemblySystemPrompt(requestType);
  const baseContext = buildAssemblyContext(session, request);

  // Emit assembly start event
  session.events.emitEvent({
    type: 'tool_used',
    tool: 'document_assembly_start',
    agent: 'document-assembler',
    timestamp: eventTimestamp(),
  });

  console.log('\n' + '─'.repeat(60));
  console.log('DOCUMENT ASSEMBLY — Producing final deliverable...');
  console.log('─'.repeat(60));

  let totalAssemblyCost = 0;

  for (let attempt = 1; attempt <= MAX_ASSEMBLY_ATTEMPTS; attempt++) {
    try {
      const client = new Anthropic();
      const model = config.defaultModel;

      // On retry, append a stronger instruction
      const assemblyContext = attempt === 1
        ? baseContext
        : baseContext + RETRY_ADDENDUM;

      const response = await client.messages.create({
        model,
        max_tokens: 16384,
        system: systemPrompt,
        messages: [{ role: 'user', content: assemblyContext }],
      });

      // Extract text from response
      let assembledText = '';
      for (const block of response.content) {
        if (block.type === 'text') {
          assembledText += block.text;
        }
      }

      // Post-process: strip any preamble that leaked through despite instructions
      assembledText = stripProcessText(assembledText);

      // Calculate cost
      const pricing = PRICING[model] ?? PRICING['claude-opus-4-6'];
      const inputTokens = response.usage?.input_tokens ?? 0;
      const outputTokens = response.usage?.output_tokens ?? 0;
      const attemptCost = (inputTokens * pricing.input / 1_000_000) +
        (outputTokens * pricing.output / 1_000_000);
      totalAssemblyCost += attemptCost;

      // Update session cost
      if (attemptCost > 0) {
        session.updateCost(session.accumulatedCost + attemptCost);
      }

      // ── Validate the assembled output ──────────────────────────────
      const validation = validateDeliverable(assembledText);

      if (validation.valid) {
        console.log(`Assembly complete (attempt ${attempt}): ${assembledText.length} chars, ${inputTokens} in / ${outputTokens} out, ~$${totalAssemblyCost.toFixed(2)}`);
        console.log('─'.repeat(60));

        emitAssemblyComplete(session, totalAssemblyCost);
        return assembledText;
      }

      // Validation failed
      console.warn(`[ASSEMBLY] Attempt ${attempt}/${MAX_ASSEMBLY_ATTEMPTS} failed validation: ${validation.reason} (${assembledText.length} chars)`);

      if (attempt < MAX_ASSEMBLY_ATTEMPTS) {
        console.log('[ASSEMBLY] Retrying with stronger instructions...');
        session.events.emitEvent({
          type: 'tool_used',
          tool: 'document_assembly_retry',
          agent: 'document-assembler',
          timestamp: eventTimestamp(),
        });
      }
    } catch (error) {
      console.error(`[ASSEMBLY] Attempt ${attempt}/${MAX_ASSEMBLY_ATTEMPTS} API error:`, error);

      session.events.emitEvent({
        type: 'error',
        message: `Document assembly attempt ${attempt} failed: ${error instanceof Error ? error.message : String(error)}`,
        source: 'document-assembler',
        timestamp: eventTimestamp(),
      });

      // If this was the last attempt, fall through to the return below
      if (attempt >= MAX_ASSEMBLY_ATTEMPTS) break;

      console.log('[ASSEMBLY] Retrying after API error...');
    }
  }

  // All attempts exhausted — return empty string, NEVER return session.finalOutput
  console.error(`[ASSEMBLY] All ${MAX_ASSEMBLY_ATTEMPTS} attempts failed. Returning empty document.`);

  session.events.emitEvent({
    type: 'error',
    message: `Document assembly failed after ${MAX_ASSEMBLY_ATTEMPTS} attempts. The deliverable could not be produced.`,
    source: 'document-assembler',
    timestamp: eventTimestamp(),
  });

  emitAssemblyComplete(session, totalAssemblyCost);
  return '';
}

/**
 * Emit assembly-complete and cost-update events.
 */
function emitAssemblyComplete(session: SessionState, totalCost: number): void {
  session.events.emitEvent({
    type: 'tool_used',
    tool: 'document_assembly_complete',
    agent: 'document-assembler',
    timestamp: eventTimestamp(),
  });

  if (totalCost > 0) {
    session.events.emitEvent({
      type: 'cost_update',
      totalUsd: session.accumulatedCost,
      budgetUsd: session.budgetUsd,
      timestamp: eventTimestamp(),
    });
  }
}

/**
 * Strip process/thinking text that sometimes leaks into the output despite instructions.
 *
 * Detects common patterns:
 *   - Lines before the first markdown heading that look like planning/commentary
 *   - "I'll start by...", "Let me...", "Here is...", "Based on..." prefixes
 *   - Entire preamble paragraphs before the document body
 */
export function stripProcessText(text: string): string {
  let cleaned = text.trim();

  // If the text starts with a markdown heading, it's already clean
  if (cleaned.startsWith('#')) return cleaned;

  // Find the first markdown heading
  const headingMatch = cleaned.match(/^(#{1,6}\s)/m);
  if (headingMatch) {
    const headingIndex = cleaned.indexOf(headingMatch[0]);
    if (headingIndex > 0) {
      // Everything before the first heading is potential preamble
      const preamble = cleaned.substring(0, headingIndex).trim();
      // Check if the preamble looks like process text (not part of the document)
      const processPatterns = [
        /^(I'll|I will|Let me|Here is|Here's|Based on|Given|Considering|Looking at|After review)/im,
        /^(The analysis|The findings|The expert|The multi-agent|According to)/im,
        /^(Below is|What follows|The following|Please find)/im,
        /^(I've|I have|I need to|First,|Now,|OK|Okay|Sure|Certainly)/im,
      ];
      const isProcess = processPatterns.some(p => p.test(preamble));
      if (isProcess) {
        cleaned = cleaned.substring(headingIndex);
        console.log(`[ASSEMBLY] Stripped ${headingIndex} chars of preamble`);
      }
    }
  }

  return cleaned;
}
