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
 * v18: Defense-in-depth validation.
 * v19: Hardened — 3 attempts with escalating prompts, reason-specific retry
 *   feedback, and comprehensive validation (placeholders, thin content,
 *   process contamination). The assembler now:
 *   1. Validates output against 8 structural checks
 *   2. Runs an LLM quality gate (Haiku reads the output and judges substance)
 *   3. Retries up to 3 times with escalating prompts + failure reason feedback
 *   4. NEVER returns session.finalOutput (the process log) — returns '' on failure
 *   5. Logs rejected output previews for debugging
 *
 * v20: LLM Quality Gate — after structural validation passes, a SECOND model
 *   (Haiku, fast & cheap) actually READS the assembled document and evaluates:
 *   - Does it address the client's actual request?
 *   - Is the content specific and substantive (not generic filler)?
 *   - Would a paying client be satisfied receiving this?
 *   If the quality gate fails, its specific critique feeds into the retry.
 *   This catches semantically empty documents that pass all regex checks.
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
import { extractCounselDocument } from './extract-counsel.js';
import { eventTimestamp } from '../events/event-bus.js';
import { config } from '../config.js';
import { ensureApiKey } from '../utils/ensure-api-key.js';
import type { SessionState } from '../session/session-state.js';
import type { LegalRequest } from '../types/index.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('ASSEMBLY');

// ── Token Pricing ────────────────────────────────────────────────────────
const PRICING: Record<string, { input: number; output: number }> = {
  'claude-opus-4-6': { input: 15.0, output: 75.0 },
  'claude-sonnet-4-5-20250929': { input: 3.0, output: 15.0 },
  'claude-haiku-3-5-20250929': { input: 0.8, output: 4.0 },
};

/**
 * Model used for the quality gate. Uses Sonnet for reliable semantic evaluation.
 */
const QUALITY_GATE_MODEL = 'claude-sonnet-4-5-20250929';

/** Maximum number of assembly attempts before giving up.
 *  5 attempts allows for both structural retries (escalating prompts) AND
 *  transient API errors (429/500/529) without exhausting too quickly. */
const MAX_ASSEMBLY_ATTEMPTS = 3;
const MAX_CONSECUTIVE_SAME_REASON = 2;

/** Addendum for attempt 2: stronger instructions after first failure. */
const RETRY_ADDENDUM_2 = `

## CRITICAL — YOUR PREVIOUS OUTPUT WAS REJECTED

Rejection reason: {{REASON}}

RULES (violations will cause rejection):
1. Your FIRST character MUST be "#" (a markdown heading).
2. Do NOT include ANY text like "I'll", "Let me", "Here is", "Based on", etc.
3. The output must be the COMPLETE document — not a summary, not a plan, not commentary.
4. The output must have clear section structure with multiple markdown headings.
5. ONLY output the deliverable. Nothing else.
6. Every section must have substantial content (at least a full paragraph).
7. The document must SPECIFICALLY address the client's request — not generic boilerplate.
8. Reference SPECIFIC clauses, issues, and provisions from the source document.
9. A quality reviewer will READ your output. If it is generic filler, it will be rejected.`;

/** Addendum for attempt 3: final attempt with explicit validation rules. */
const RETRY_ADDENDUM_3 = `

## FINAL ATTEMPT — YOU HAVE FAILED TWICE

Previous rejection reasons: {{REASONS}}

You are about to be rejected permanently. Your output is reviewed by BOTH an automated validator AND a quality reviewer who reads the entire document.

STRUCTURAL RULES (automated validator):
1. Must start with "#" (markdown heading) — NO preamble of any kind
2. Must be at least 500 characters long
3. Must have at least 3 markdown headings (##)
4. Must have at least 2 sections with 150+ characters of body text each
5. Must NOT contain process language ("I'll", "Let me", "Based on my analysis", etc.)

SUBSTANCE RULES (quality reviewer reads your output):
6. Must SPECIFICALLY address the client's original request — not generic analysis
7. Must reference SPECIFIC provisions, clauses, or issues from the source document
8. Must contain ACTIONABLE, specific analysis — not vague observations
9. A paying client who waited 10 minutes for this must feel they received real value

Produce the FULL, SUBSTANTIVE document now.`;

// ── LLM Quality Gate ─────────────────────────────────────────────────────

/**
 * LLM-based semantic quality gate. A fast model (Haiku) reads the assembled
 * document and judges whether it's actually good — not just structurally
 * valid, but substantive, relevant, and something a paying client would
 * accept.
 *
 * This catches the failure mode that regex can never catch: a document
 * with correct heading structure and sufficient length, but containing
 * generic filler that doesn't address the client's actual request.
 *
 * Returns { pass: true } or { pass: false, critique: string }.
 * Cost: ~$0.002 per call (Haiku, ~3k input tokens, ~100 output tokens).
 */
async function llmQualityGate(
  assembledText: string,
  session: SessionState,
  request?: LegalRequest,
): Promise<{ pass: boolean; critique?: string; cost: number; apiError?: boolean }> {
  try {
    ensureApiKey(); // Load from .env if not in process.env
    const client = new Anthropic();

    // Build a concise summary of what was expected
    const requestSummary = request?.requestText
      ?? session.matterRecord?.title
      ?? 'General legal analysis';

    const docNames = session.documents.map(d => d.name).join(', ');
    const workflowType = session.workflowTemplateId ?? 'unknown';
    const findingsCount = session.debate.findings.length;
    const resolutionsCount = session.debate.resolutions.length;

    // Truncate document to first 6000 chars for the quality gate
    // (enough to judge substance without blowing up token costs)
    const docExcerpt = assembledText.length > 6000
      ? assembledText.substring(0, 6000) + '\n\n[... document continues ...]'
      : assembledText;

    const prompt = `You are a quality gate for a legal document assembly system. A client paid money and waited for this document. Your job is to determine if the output is ACTUALLY GOOD or if it's garbage that would embarrass us.

## What the client requested
Request: ${requestSummary}
Documents provided: ${docNames || 'None specified'}
Workflow type: ${workflowType}
Analysis produced: ${findingsCount} findings, ${resolutionsCount} debate resolutions

## The assembled document (excerpt)
${docExcerpt}

## Your evaluation

Judge this document on these criteria:
1. RELEVANCE — Does it actually address the client's request? If they asked for a contract review, is this a contract review? If they uploaded a specific document, does the output reference specifics from that document?
2. SUBSTANCE — Does it contain specific, actionable analysis? Or is it generic boilerplate that could apply to any document? Look for specific clause references, specific risk assessments, specific recommendations.
3. COMPLETENESS — Does it cover the key issues you'd expect? A contract review should cover liability, termination, IP, indemnification, etc. A research memo should have analysis and conclusions.
4. CLIENT VALUE — Would a paying client be satisfied receiving this? Or would they feel ripped off?
5. PLACEHOLDERS — Does it contain garbage placeholders like [TBD], [PLACEHOLDER], [TODO], [SECTION TITLE], or [Analysis goes here]? That's a FAIL. But template fields like [Insert Date], [Company Name], [Effective Date] in a drafted document (policy, contract, terms of service) are EXPECTED and fine — that's a PASS.
6. VERIFICATION — Was the analysis verified? If the context includes "NO VERIFICATION" warning, apply stricter standards: demand specific evidence citations and flag any vague or unsupported claims.

Respond with EXACTLY one of these two formats (no other text):
PASS
FAIL: [one sentence explaining why this document is not good enough]`;

    const response = await client.messages.create({
      model: QUALITY_GATE_MODEL,
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    }, { timeout: 30_000 }); // 30s timeout for quality gate (short, fast call)

    // Extract response text
    let responseText = '';
    for (const block of response.content) {
      if (block.type === 'text') responseText += block.text;
    }
    responseText = responseText.trim();

    // Calculate cost
    const pricing = PRICING[QUALITY_GATE_MODEL] ?? PRICING['claude-haiku-3-5-20250929'];
    const inputTokens = response.usage?.input_tokens ?? 0;
    const outputTokens = response.usage?.output_tokens ?? 0;
    const gateCost = (inputTokens * pricing.input / 1_000_000) +
      (outputTokens * pricing.output / 1_000_000);

    // Parse response
    if (responseText.startsWith('PASS')) {
      logger.info('Quality gate passed', { cost: gateCost.toFixed(4) });
      return { pass: true, cost: gateCost };
    }

    // Extract critique
    const critique = responseText.startsWith('FAIL:')
      ? responseText.substring(5).trim()
      : responseText.startsWith('FAIL')
        ? responseText.substring(4).replace(/^[\s:—-]+/, '').trim() || 'Document did not meet quality standards'
        : 'Quality gate returned ambiguous result: ' + responseText.substring(0, 200);

    logger.warn('Quality gate failed', { critique, cost: gateCost.toFixed(4) });
    return { pass: false, critique, cost: gateCost };
  } catch (error) {
    // Quality gate API error — fail-closed on first failure (trigger retry),
    // allow pass-through after 2+ consecutive failures (avoid exhausting all
    // retries on a genuinely-down API). The caller tracks gateFailureCount.
    logger.error('Quality gate API error', { error });
    return { pass: false, critique: 'Quality gate unavailable — document needs re-evaluation', cost: 0, apiError: true };
  }
}

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
  // Map workflow template to assembly prompt type.
  // For counsel workflows, the specialist already produced the document —
  // the assembly step extracts and cleans it (not reformats as a memo/report).
  const requestType = request?.type === 'legal_question' ? 'counsel_extraction'
    : request?.type
    ?? (session.workflowTemplateId === 'roundtable' ? 'document_redesign'
      : session.workflowTemplateId === 'review' ? 'contract_review'
      : session.workflowTemplateId === 'adversarial' ? 'legal_research'
      : session.workflowTemplateId === 'counsel' ? 'counsel_extraction'
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

  logger.info('─'.repeat(60));
  logger.info('DOCUMENT ASSEMBLY — Producing final deliverable...');
  logger.info('─'.repeat(60));

  // ── Counsel fast-path: deterministic extraction (zero LLM calls) ──
  //
  // For counsel workflows, the specialist has already drafted the complete
  // deliverable in session.finalOutput. Running a second Claude call to
  // "extract" it is wasteful and prone to retry stalls. Try to extract it
  // directly; fall back to the LLM loop only if extraction fails.
  if (requestType === 'counsel_extraction' && session.finalOutput) {
    const extracted = extractCounselDocument(session.finalOutput);
    if (extracted) {
      const validation = validateDeliverable(extracted);
      if (validation.valid) {
        logger.info('Counsel extraction (deterministic) succeeded — skipping LLM assembly', {
          chars: extracted.length,
        });
        emitAssemblyComplete(session, 0);
        return extracted;
      }
      // Extracted content exists but failed validation — if it's substantial,
      // accept it anyway rather than pay for an LLM retry loop.
      if (extracted.length > 5000) {
        logger.warn('Counsel extraction produced substantial content but failed structural validation — accepting with warning', {
          chars: extracted.length,
          reason: validation.reason,
        });
        session.events.emitEvent({
          type: 'error',
          message: 'Document assembly completed with warnings. Please review carefully.',
          source: 'document-assembler',
          timestamp: eventTimestamp(),
        });
        emitAssemblyComplete(session, 0);
        return extracted;
      }
      logger.info('Counsel extraction produced thin content — falling back to LLM assembly', {
        chars: extracted.length,
      });
    } else {
      logger.info('Counsel extraction heuristics did not find a document — falling back to LLM assembly');
    }
  }

  let totalAssemblyCost = 0;
  const rejectionReasons: string[] = [];
  let bestAttempt = ''; // Track the best output even if it failed validation
  let gateFailureCount = 0; // Track consecutive quality gate API failures
  let lastStructuralReason: string | null = null;
  let consecutiveSameReason = 0;
  ensureApiKey(); // Load from .env if not in process.env
  const client = new Anthropic();

  for (let attempt = 1; attempt <= MAX_ASSEMBLY_ATTEMPTS; attempt++) {
    try {
      const model = config.defaultModel;

      // Build context with escalating retry addendums — ALL retries get feedback
      let assemblyContext = baseContext;
      if (attempt === 2 && rejectionReasons.length > 0) {
        assemblyContext += RETRY_ADDENDUM_2.replace('{{REASON}}', rejectionReasons[rejectionReasons.length - 1]);
      } else if (attempt >= 3 && rejectionReasons.length > 0) {
        assemblyContext += RETRY_ADDENDUM_3.replace('{{REASONS}}', rejectionReasons.join('; '));
      }

      logger.info('Assembly attempt', { attempt, maxAttempts: MAX_ASSEMBLY_ATTEMPTS });

      const response = await client.messages.create({
        model,
        max_tokens: 16384,
        system: systemPrompt,
        messages: [{ role: 'user', content: assemblyContext }],
      }, { timeout: 120_000 }); // 2-minute timeout for assembly (long-form generation)

      // Extract text from response
      let assembledText = '';
      for (const block of response.content) {
        if (block.type === 'text') {
          assembledText += block.text;
        }
      }

      // Post-process: strip any preamble that leaked through despite instructions
      assembledText = stripProcessText(assembledText);

      // Track the longest output as fallback (better than nothing)
      if (assembledText.length > bestAttempt.length) {
        bestAttempt = assembledText;
      }

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

      // Step 1: Structural validation (fast, no API call).
      // Catches mechanical failures only — placeholder judgment is the quality gate's job.
      const validation = validateDeliverable(assembledText);

      if (!validation.valid) {
        // Structural validation failed — log and retry
        const reason = validation.reason ?? 'unknown';
        rejectionReasons.push(`structural: ${reason}`);

        const preview = assembledText.substring(0, 500).replace(/\n/g, '\\n');
        logger.warn('Assembly attempt rejected (structural)', { attempt, maxAttempts: MAX_ASSEMBLY_ATTEMPTS, reason, chars: assembledText.length });
        logger.warn('Rejected output preview', { preview });

        // Early-exit: if the same structural reason has been hit repeatedly, the
        // LLM is generating stable-but-rejected output. More retries won't help;
        // skip to the best-attempt fallback below.
        if (reason === lastStructuralReason) {
          consecutiveSameReason++;
          if (consecutiveSameReason >= MAX_CONSECUTIVE_SAME_REASON) {
            logger.warn('Assembly aborting retry loop — same structural rejection reason repeated', {
              reason,
              consecutive: consecutiveSameReason,
              attempt,
            });
            break;
          }
        } else {
          lastStructuralReason = reason;
          consecutiveSameReason = 1;
        }

        if (attempt < MAX_ASSEMBLY_ATTEMPTS) {
          logger.info('Retrying with escalated instructions', { nextAttempt: attempt + 1 });
          session.events.emitEvent({
            type: 'tool_used',
            tool: 'document_assembly_retry',
            agent: 'document-assembler',
            timestamp: eventTimestamp(),
          });
        }
        continue;
      }

      // Step 2: LLM Quality Gate — a second model reads the document and
      // judges whether it's actually good (catches semantic garbage that
      // passes all regex/structural checks)
      const qualityGate = await llmQualityGate(assembledText, session, request);
      totalAssemblyCost += qualityGate.cost;
      if (qualityGate.cost > 0) {
        session.updateCost(session.accumulatedCost + qualityGate.cost);
      }

      // Handle quality gate API failures: fail-closed on first failure,
      // allow pass-through after 2+ consecutive failures to avoid exhausting
      // all retries on a genuinely-down API.
      if (qualityGate.apiError) {
        gateFailureCount++;
        if (gateFailureCount >= 2) {
          // API is genuinely down — accept structurally-valid doc
          logger.warn('Quality gate API down (2+ failures), accepting structurally-valid document');
          emitAssemblyComplete(session, totalAssemblyCost);
          return assembledText;
        }
        // First failure — treat as rejection to trigger retry
        rejectionReasons.push('quality_gate_api_error: Quality gate unavailable');
        if (attempt < MAX_ASSEMBLY_ATTEMPTS) {
          logger.info('Quality gate API error — retrying assembly', { nextAttempt: attempt + 1 });
          session.events.emitEvent({
            type: 'tool_used',
            tool: 'document_assembly_retry',
            agent: 'document-assembler',
            timestamp: eventTimestamp(),
          });
        }
        continue;
      }

      if (qualityGate.pass) {
        logger.info('Assembly complete', { attempt, chars: assembledText.length, inputTokens, outputTokens, cost: totalAssemblyCost.toFixed(2) });
        logger.info('─'.repeat(60));

        emitAssemblyComplete(session, totalAssemblyCost);
        return assembledText;
      }

      // Quality gate failed — the document looks right structurally but IS wrong semantically
      const critique = qualityGate.critique ?? 'Document did not pass quality review';
      rejectionReasons.push(`quality_gate: ${critique}`);

      logger.warn('Assembly attempt rejected (quality gate)', { attempt, maxAttempts: MAX_ASSEMBLY_ATTEMPTS, critique, chars: assembledText.length });

      if (attempt < MAX_ASSEMBLY_ATTEMPTS) {
        logger.info('Retrying with escalated instructions + quality feedback', { nextAttempt: attempt + 1 });
        session.events.emitEvent({
          type: 'tool_used',
          tool: 'document_assembly_retry',
          agent: 'document-assembler',
          timestamp: eventTimestamp(),
        });
      }
    } catch (error) {
      logger.error('Assembly attempt API error', { attempt, maxAttempts: MAX_ASSEMBLY_ATTEMPTS, error });
      rejectionReasons.push(`api_error: ${error instanceof Error ? error.message : String(error)}`);

      session.events.emitEvent({
        type: 'error',
        message: `Document assembly attempt ${attempt} failed: ${error instanceof Error ? error.message : String(error)}`,
        source: 'document-assembler',
        timestamp: eventTimestamp(),
      });

      // If this was the last attempt, fall through to the return below
      if (attempt >= MAX_ASSEMBLY_ATTEMPTS) break;

      // Exponential backoff for transient errors (429/500/502/503/529)
      const status = (error as Record<string, unknown>)?.status as number | undefined;
      const isTransient = status && [429, 500, 502, 503, 529].includes(status);
      const delayMs = isTransient
        ? Math.min(1000 * Math.pow(2, attempt), 8000) // 2s, 4s, 8s
        : 1000; // 1s for other errors
      logger.warn('Retrying after API error...', { delayMs, transient: isTransient, status });
      await new Promise(r => setTimeout(r, delayMs));
    }
  }

  // All attempts exhausted — re-validate bestAttempt before returning.
  // Only return it if it passes structural validation (acceptable degradation
  // if it only failed the quality gate). If it fails structural validation too,
  // return '' — the download endpoint returns 503 and the frontend shows the
  // "assembly did not complete" view with retry + JSON download.
  if (bestAttempt.length > 0) {
    const bestValidation = validateDeliverable(bestAttempt);
    if (bestValidation.valid) {
      logger.warn('Returning best attempt (passed structural validation, failed quality gate)', {
        attempts: MAX_ASSEMBLY_ATTEMPTS,
        chars: bestAttempt.length,
        reasons: rejectionReasons,
      });

      session.events.emitEvent({
        type: 'error',
        message: `Document assembly completed with warnings after ${MAX_ASSEMBLY_ATTEMPTS} attempts. Please review carefully.`,
        source: 'document-assembler',
        timestamp: eventTimestamp(),
      });

      emitAssemblyComplete(session, totalAssemblyCost);
      return bestAttempt;
    }

    // bestAttempt failed structural validation — return it anyway if it has
    // substantial content (>5000 chars). The empty_sections check is too strict
    // for complex legal documents (ToS, privacy policies) with nested headings
    // that have immediate sub-headings before prose content.
    if (bestAttempt.length > 5000) {
      logger.warn('Returning best attempt despite structural validation failure — content is substantial', {
        attempts: MAX_ASSEMBLY_ATTEMPTS,
        chars: bestAttempt.length,
        structuralReason: bestValidation.reason,
        reasons: rejectionReasons,
      });

      session.events.emitEvent({
        type: 'error',
        message: `Document assembly completed with warnings after ${MAX_ASSEMBLY_ATTEMPTS} attempts. Please review carefully.`,
        source: 'document-assembler',
        timestamp: eventTimestamp(),
      });

      emitAssemblyComplete(session, totalAssemblyCost);
      return bestAttempt;
    }

    logger.error('All assembly attempts failed — best attempt also fails structural validation', {
      attempts: MAX_ASSEMBLY_ATTEMPTS,
      bestAttemptChars: bestAttempt.length,
      structuralReason: bestValidation.reason,
      reasons: rejectionReasons,
    });
  } else {
    logger.error('All assembly attempts failed with no output', { attempts: MAX_ASSEMBLY_ATTEMPTS });
  }

  session.events.emitEvent({
    type: 'error',
    message: `Document assembly failed after ${MAX_ASSEMBLY_ATTEMPTS} attempts. The deliverable could not be produced. Your analysis findings and debate data are still available.`,
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
        logger.info('Stripped preamble', { chars: headingIndex });
      }
    }
  }

  return cleaned;
}
