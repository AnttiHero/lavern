/**
 * Mistral Document Assembler — Produces deliverables via Mistral AI.
 *
 * Parallel to `assembleDocument()` in `src/assembly/document-assembler.ts`.
 * Same logic (structural validation + LLM quality gate + retry loop),
 * but uses Mistral chat completions instead of the Anthropic SDK.
 *
 * The quality gate also runs on Mistral (small model, fast + cheap).
 */

import { getAssemblySystemPrompt, buildAssemblyContext } from '../assembly/assembly-prompts.js';
import { buildFindingsReport } from '../assembly/findings-report.js';
import { validateDeliverable } from '../assembly/validate-deliverable.js';
import { extractCounselDocument, looksLikeStatusPackage } from '../assembly/extract-counsel.js';
import { extractTabulateResult } from '../assembly/extract-tabulate.js';
import { convertTabulateToMarkdown } from '../assembly/tabulate-format-converter.js';
import { stripProcessText } from '../assembly/document-assembler.js';
import { eventTimestamp } from '../events/event-bus.js';
import { config } from '../config.js';
import { getOpenAICompatibleSettings, openAICompatibleChat } from './openai-compatible.js';
import type { SessionState } from '../session/session-state.js';
import type { LegalRequest } from '../types/index.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('OPENAI-COMPAT-ASSEMBLY');

/** Maximum number of assembly attempts. */
const MAX_ASSEMBLY_ATTEMPTS = 3;

/** Retry addendum for attempt 2. */
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

/** Retry addendum for attempt 3. */
const RETRY_ADDENDUM_3 = `

## FINAL ATTEMPT — YOU HAVE FAILED TWICE

Previous rejection reasons: {{REASONS}}

You are about to be rejected permanently. Your output is reviewed by BOTH an automated validator AND a quality reviewer.

STRUCTURAL RULES:
1. Must start with "#" (markdown heading) — NO preamble
2. Must be at least 500 characters long
3. Must have at least 3 markdown headings (##)
4. Must have at least 2 sections with 150+ characters each
5. Must NOT contain process language ("I'll", "Let me", etc.)

SUBSTANCE RULES:
6. Must SPECIFICALLY address the client's original request
7. Must reference SPECIFIC provisions, clauses, or issues
8. Must contain ACTIONABLE, specific analysis
9. A paying client must feel they received real value

Produce the FULL, SUBSTANTIVE document now.`;

// ── LLM Quality Gate (Mistral) ──────────────────────────────────────────

interface QualityGateResult {
  pass: boolean;
  critique?: string;
  cost: number;
  gateUnavailable?: boolean;
}

async function mistralQualityGate(
  assembledText: string,
  session: SessionState,
  request?: LegalRequest,
): Promise<QualityGateResult> {
  try {
    const provider = session.provider ?? config.provider;
    const settings = getOpenAICompatibleSettings(provider);
    const requestSummary = request?.requestText
      ?? session.matterRecord?.title
      ?? 'General legal analysis';

    const docNames = session.documents.map(d => d.name).join(', ');
    const workflowType = session.workflowTemplateId ?? 'unknown';
    const findingsCount = session.debate.findings.length;
    const resolutionsCount = session.debate.resolutions.length;

    const docExcerpt = assembledText.length > 6000
      ? assembledText.substring(0, 6000) + '\n\n[... document continues ...]'
      : assembledText;

    const prompt = `You are a quality gate for a legal document assembly system. A client paid money and waited for this document. Determine if the output is ACTUALLY GOOD.

## What the client requested
Request: ${requestSummary}
Documents provided: ${docNames || 'None specified'}
Workflow type: ${workflowType}
Analysis produced: ${findingsCount} findings, ${resolutionsCount} debate resolutions

## The assembled document (excerpt)
${docExcerpt}

## Your evaluation

Judge on: RELEVANCE, SUBSTANCE, COMPLETENESS, CLIENT VALUE, PLACEHOLDERS.

Respond with EXACTLY one of these two formats:
PASS
FAIL: [one sentence explaining why]`;

    const result = await openAICompatibleChat({
      provider: settings.provider,
      model: settings.routerModel,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      maxTokens: 200,
    });

    const responseText = (result.message.content ?? '').trim();
    logger.info('Quality gate response received', {
      provider: settings.provider,
      model: settings.routerModel,
      responseChars: responseText.length,
      finishReason: result.finishReason,
      cost: result.cost.toFixed(4),
    });

    if (responseText.startsWith('PASS')) {
      logger.info('Quality gate passed', { cost: result.cost.toFixed(4) });
      return { pass: true, cost: result.cost };
    }

    if (!responseText) {
      const critique = 'Quality gate returned an empty response';
      logger.warn('Quality gate unavailable', {
        critique,
        provider: settings.provider,
        model: settings.routerModel,
        finishReason: result.finishReason,
        cost: result.cost.toFixed(4),
      });
      return { pass: false, critique, cost: result.cost, gateUnavailable: true };
    }

    const critique = responseText.startsWith('FAIL:')
      ? responseText.substring(5).trim()
      : responseText.startsWith('FAIL')
        ? responseText.substring(4).replace(/^[\s:—-]+/, '').trim() || 'Document did not meet quality standards'
        : 'Quality gate returned ambiguous result: ' + responseText.substring(0, 200);

    const gateUnavailable = !responseText.startsWith('FAIL');
    logger.warn(gateUnavailable ? 'Quality gate unavailable' : 'Quality gate failed', {
      critique,
      provider: settings.provider,
      model: settings.routerModel,
      responseChars: responseText.length,
      finishReason: result.finishReason,
      cost: result.cost.toFixed(4),
    });
    return { pass: false, critique, cost: result.cost, gateUnavailable };
  } catch (error) {
    logger.error('Quality gate error (allowing document through)', { error });
    return { pass: true, critique: undefined, cost: 0 };
  }
}

// ── Main Assembly Function ──────────────────────────────────────────────

/**
 * Assemble the final deliverable using Mistral.
 *
 * Same retry logic and validation as the Anthropic version.
 * Returns assembled markdown or '' on failure.
 */
export async function assembleMistralDocument(
  session: SessionState,
  request?: LegalRequest,
): Promise<string> {
  const requestType = request?.type === 'legal_question' ? 'counsel_extraction'
    : request?.type
    ?? (session.workflowTemplateId === 'roundtable' ? 'document_redesign'
      : session.workflowTemplateId === 'review' ? 'contract_review'
      : session.workflowTemplateId === 'adversarial' ? 'legal_research'
      : session.workflowTemplateId === 'counsel' ? 'counsel_extraction'
      : 'general');

  session.events.emitEvent({
    type: 'tool_used',
    tool: 'document_assembly_start',
    agent: 'document-assembler',
    timestamp: eventTimestamp(),
  });

  logger.info('─'.repeat(60));
  logger.info('DOCUMENT ASSEMBLY — Producing final deliverable...');
  logger.info('─'.repeat(60));

  if (session.workflowTemplateId === 'tabulate' && session.finalOutput) {
    const tabulateResult = extractTabulateResult(session.finalOutput);
    if (tabulateResult) {
      session.tabulateResult = tabulateResult;
      const md = convertTabulateToMarkdown(tabulateResult);
      logger.info('Tabulate fast-path succeeded', {
        tables: tabulateResult.tables.length,
        rows: tabulateResult.tables.reduce((n, t) => n + t.rows.length, 0),
      });
      emitAssemblyComplete(session, 0);
      return md;
    }
    logger.warn('Tabulate fast-path: no valid JSON tabulate result in finalOutput — falling through to LLM assembly');
  }

  if (config.counselFastPathEnabled && session.finalOutput) {
    const extracted = extractCounselDocument(session.finalOutput);
    if (extracted) {
      const validation = validateDeliverable(extracted);
      const statusPackage = looksLikeStatusPackage(extracted);
      if (validation.valid || statusPackage) {
        logger.info('Deterministic extraction succeeded — skipping LLM assembly', {
          chars: extracted.length,
          statusPackage,
        });
        emitAssemblyComplete(session, 0);
        return extracted;
      }
      if (extracted.length > 5000) {
        logger.warn('Deterministic extraction produced substantial content but failed structural validation — accepting with warning', {
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
      logger.info('Deterministic extraction produced thin content — falling back to LLM assembly', {
        chars: extracted.length,
      });
    } else {
      logger.info('Deterministic extraction heuristics did not find a document — falling back to LLM assembly');
    }
  }

  const systemPrompt = getAssemblySystemPrompt(requestType);
  const baseContext = buildAssemblyContext(session, request);

  let totalAssemblyCost = 0;
  const rejectionReasons: string[] = [];
  const provider = session.provider ?? config.provider;
  const settings = getOpenAICompatibleSettings(provider);
  const model = settings.assemblyModel;
  let bestAttempt = '';
  let bestAttemptReason = '';
  let qualityGateUnavailableCount = 0;
  let qualityGateRejectionCount = 0;

  for (let attempt = 1; attempt <= MAX_ASSEMBLY_ATTEMPTS; attempt++) {
    try {
      let assemblyContext = baseContext;
      if (attempt === 2 && rejectionReasons.length > 0) {
        assemblyContext += RETRY_ADDENDUM_2.replace('{{REASON}}', rejectionReasons[0]);
      } else if (attempt === 3) {
        assemblyContext += RETRY_ADDENDUM_3.replace('{{REASONS}}', rejectionReasons.join('; '));
      }

      logger.info('Assembly attempt', { attempt, maxAttempts: MAX_ASSEMBLY_ATTEMPTS });

      const result = await openAICompatibleChat({
        provider: settings.provider,
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: assemblyContext },
        ],
        temperature: 0.1,
        maxTokens: 16384,
        timeoutMs: config.workflowLlmTimeoutMs,
      });

      let assembledText = (result.message.content ?? '').trim();
      totalAssemblyCost += result.cost;
      logger.info('Assembly attempt response received', {
        attempt,
        maxAttempts: MAX_ASSEMBLY_ATTEMPTS,
        provider: settings.provider,
        model,
        responseChars: assembledText.length,
        finishReason: result.finishReason,
        cost: result.cost.toFixed(4),
      });

      if (result.cost > 0) {
        session.updateCost(session.accumulatedCost + result.cost);
      }

      // Post-process: strip preamble
      assembledText = stripProcessText(assembledText);

      // Step 1: Structural validation
      const validation = validateDeliverable(assembledText);

      if (!validation.valid) {
        const reason = validation.reason ?? 'unknown';
        rejectionReasons.push(`structural: ${reason}`);

        // Don't log rejected output contents — see document-assembler.ts for rationale.
        logger.warn('Assembly attempt rejected (structural)', { attempt, maxAttempts: MAX_ASSEMBLY_ATTEMPTS, reason, chars: assembledText.length });
        if (config.logPreviews) {
          const preview = assembledText.substring(0, 500).replace(/\n/g, '\\n');
          logger.warn('Rejected output preview (debug only)', { preview });
        }

        if (attempt < MAX_ASSEMBLY_ATTEMPTS) {
          session.events.emitEvent({
            type: 'tool_used',
            tool: 'document_assembly_retry',
            agent: 'document-assembler',
            timestamp: eventTimestamp(),
          });
        }
        continue;
      }

      if (assembledText.length > bestAttempt.length) {
        bestAttempt = assembledText;
        bestAttemptReason = `structurally valid attempt ${attempt}`;
      }
      logger.info('Assembly attempt passed structural validation', {
        attempt,
        maxAttempts: MAX_ASSEMBLY_ATTEMPTS,
        chars: assembledText.length,
      });

      // Step 2: LLM Quality Gate
      const qualityGate = await mistralQualityGate(assembledText, session, request);
      totalAssemblyCost += qualityGate.cost;
      if (qualityGate.cost > 0) {
        session.updateCost(session.accumulatedCost + qualityGate.cost);
      }

      if (qualityGate.pass) {
        logger.info('Assembly complete', { attempt, chars: assembledText.length, cost: totalAssemblyCost.toFixed(2) });
        logger.info('─'.repeat(60));

        session.outputTier = 1;
        session.outputTierReason = 'Full deliverable produced';
        emitAssemblyComplete(session, totalAssemblyCost);
        return assembledText;
      }

      const critique = qualityGate.critique ?? 'Document did not pass quality review';
      if (qualityGate.gateUnavailable) {
        qualityGateUnavailableCount += 1;
        rejectionReasons.push(`quality_gate_unavailable: ${critique}`);
      } else {
        qualityGateRejectionCount += 1;
        rejectionReasons.push(`quality_gate: ${critique}`);
      }

      logger.warn('Assembly attempt rejected (quality gate)', { attempt, maxAttempts: MAX_ASSEMBLY_ATTEMPTS, critique });

      if (qualityGate.gateUnavailable && qualityGateUnavailableCount >= 2) {
        logger.warn('Quality gate unavailable repeatedly, returning structurally valid best attempt', {
          attempt,
          chars: assembledText.length,
          qualityGateUnavailableCount,
          bestAttemptReason,
        });
        session.outputTier = 2;
        session.outputTierReason = 'Best-effort deliverable produced because the quality gate did not return a usable verdict.';
        session.events.emitEvent({
          type: 'error',
          message: 'Document assembly completed with warnings: quality gate did not return a usable verdict. Please review the deliverable carefully.',
          source: 'document-assembler',
          timestamp: eventTimestamp(),
        });
        emitAssemblyComplete(session, totalAssemblyCost);
        return bestAttempt || assembledText;
      }

      if (attempt < MAX_ASSEMBLY_ATTEMPTS) {
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

      if (attempt >= MAX_ASSEMBLY_ATTEMPTS) break;
    }
  }

  if (bestAttempt) {
    logger.warn('Returning structurally valid best attempt after assembly retries', {
      chars: bestAttempt.length,
      bestAttemptReason,
      qualityGateUnavailableCount,
      qualityGateRejectionCount,
      rejectionReasons,
    });
    session.outputTier = 2;
    session.outputTierReason = 'Best-effort deliverable produced after assembly quality gate retries.';
    session.events.emitEvent({
      type: 'error',
      message: 'Document assembly completed with warnings. The deliverable passed structural checks but did not receive a clean quality-gate pass.',
      source: 'document-assembler',
      timestamp: eventTimestamp(),
    });
    emitAssemblyComplete(session, totalAssemblyCost);
    return bestAttempt;
  }

  // ── Last resort: deterministic findings report ─────────────────────
  // Same fallback as the Anthropic assembler: the debate board usually
  // still holds the engagement's real value (cited findings, resolutions,
  // clarification Q&A). Render it with zero LLM calls rather than
  // delivering nothing.
  const findingsReport = buildFindingsReport(session, request);
  if (findingsReport) {
    session.assemblyFallbackUsed = true;
    session.outputTier = 2;
    session.outputTierReason = 'LLM assembly failed — structured findings report delivered instead.';
    logger.warn('LLM assembly failed — returning deterministic findings report', {
      findings: session.debate.findings.length,
      chars: findingsReport.length,
    });
    session.events.emitEvent({
      type: 'error',
      message: 'The polished deliverable could not be assembled; delivering the structured findings report instead. All findings and citations are included.',
      source: 'document-assembler',
      timestamp: eventTimestamp(),
    });
    emitAssemblyComplete(session, totalAssemblyCost);
    return findingsReport;
  }

  logger.error('All assembly attempts failed, returning empty document', { attempts: MAX_ASSEMBLY_ATTEMPTS });

  session.events.emitEvent({
    type: 'error',
    message: `Document assembly failed after ${MAX_ASSEMBLY_ATTEMPTS} attempts (${settings.label}).`,
    source: 'document-assembler',
    timestamp: eventTimestamp(),
  });

  emitAssemblyComplete(session, totalAssemblyCost);
  return '';
}

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
