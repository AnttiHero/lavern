/**
 * Quality Check MCP Tools — Generalized iteration loops for any workflow step.
 *
 * v11: Extends the evaluator gate pattern to work at any step.
 * The orchestrator dispatches work, checks the result against a quality bar,
 * and if it's not good enough, re-dispatches with specific feedback.
 * Repeat until it clears or the iteration budget is exhausted.
 *
 * Two tools that bracket the quality check:
 *
 * 1. `run_quality_check` — Called by the orchestrator to REQUEST a quality check.
 *    Records the invocation and returns the current iteration count.
 *
 * 2. `record_quality_result` — Called after the quality check completes.
 *    Records pass/fail, score, failure reasons. Controls iteration limits.
 *    Returns guidance: iterate, proceed, or flag gaps.
 */

import { z } from 'zod';
import { tool } from '@anthropic-ai/claude-agent-sdk';
import type { SessionState } from '../../session/session-state.js';
import { boundedPush } from '../../session/session-state.js';
import type { QualityCheckResult } from '../../types/workflow.js';
import { eventTimestamp } from '../../events/event-bus.js';

const DEFAULT_MAX_ITERATIONS = 2;

export function createQualityCheckTools(session: SessionState) {

  const runQualityCheck = tool(
    'run_quality_check',
    'Request a quality check on work produced at the current step. Call this BEFORE performing the check (self-check, peer dispatch, or evaluator dispatch). Returns the current iteration count and budget.',
    {
      step: z.string()
        .describe('The current workflow step (e.g., "build", "synthesis", "decomposition")'),
      check_type: z.enum(['self', 'peer', 'evaluator'])
        .describe('Who performs the check: "self" (you re-evaluate), "peer" (another agent), "evaluator" (formal evaluator)'),
      checker_role: z.string().optional()
        .describe('Which agent performs the check (required for peer/evaluator, e.g., "client-proxy", "supervising-partner")'),
      deliverable_summary: z.string()
        .describe('Brief summary of what is being checked'),
      quality_criteria: z.array(z.string())
        .describe('What "good" looks like — specific criteria the deliverable must meet'),
    },
    async (args) => {
      const gw = session.genericWorkflow;
      if (!gw) {
        return {
          content: [{
            type: 'text' as const,
            text: 'ERROR: No active workflow. Quality checks require an active generic workflow.',
          }],
        };
      }

      // Get or initialize per-step iteration count
      const currentIteration = (gw.stepIterationCounts[args.step] ?? 0) + 1;
      gw.stepIterationCounts[args.step] = currentIteration;

      // Look up max iterations from template step definition
      const template = session.workflowTemplateId;
      // Default to 2 — templates can override via stepDefinitions
      const maxIterations = DEFAULT_MAX_ITERATIONS;

      session.events.emitEvent({
        type: 'quality_check_run',
        step: args.step,
        checkType: args.check_type,
        checkerRole: args.checker_role,
        iteration: currentIteration,
        timestamp: eventTimestamp(),
      });

      return {
        content: [{
          type: 'text' as const,
          text: `QUALITY CHECK REQUESTED
**Step**: ${args.step}
**Check type**: ${args.check_type}${args.checker_role ? ` (${args.checker_role})` : ''}
**Iteration**: ${currentIteration}/${maxIterations}
**Deliverable**: ${args.deliverable_summary}

**Quality criteria**:
${args.quality_criteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}

${args.check_type === 'self'
  ? 'Evaluate the deliverable against these criteria yourself. Then call `record_quality_result` with your assessment.'
  : `Dispatch **${args.checker_role}** to evaluate the deliverable against these criteria. After they complete, call \`record_quality_result\` with the results.`}`,
        }],
      };
    },
  );

  const recordQualityResult = tool(
    'record_quality_result',
    'Record the result of a quality check. Call this AFTER the check is complete (self-assessment done, or peer/evaluator agent has reported). Controls iteration: pass → proceed, fail within budget → revise, fail at limit → proceed with gaps flagged.',
    {
      step: z.string()
        .describe('The workflow step this check is for'),
      passed: z.boolean()
        .describe('Whether the deliverable meets quality criteria'),
      score: z.number().min(0).max(1)
        .describe('Quality score (0.0 - 1.0)'),
      failure_reasons: z.array(z.string()).optional()
        .describe('Specific reasons for failure — what is wrong, not just that something is wrong'),
      revision_guidance: z.array(z.string()).optional()
        .describe('Specific instructions for revision — "state assumptions explicitly" not "improve the analysis"'),
    },
    async (args) => {
      const gw = session.genericWorkflow;
      if (!gw) {
        return {
          content: [{
            type: 'text' as const,
            text: 'ERROR: No active workflow.',
          }],
        };
      }

      const currentIteration = gw.stepIterationCounts[args.step] ?? 1;

      // Record the result
      const result: QualityCheckResult = {
        step: args.step,
        checkType: 'self', // Will be set from the run_quality_check context
        iteration: currentIteration,
        passed: args.passed,
        score: args.score,
        failureReasons: args.failure_reasons ?? [],
        revisionGuidance: args.revision_guidance ?? [],
        timestamp: eventTimestamp(),
      };
      boundedPush(gw.qualityChecks, result);

      session.events.emitEvent({
        type: 'quality_check_result',
        step: args.step,
        passed: args.passed,
        score: args.score,
        iteration: currentIteration,
        failureReasons: args.failure_reasons ?? [],
        revisionGuidance: args.revision_guidance ?? [],
        timestamp: eventTimestamp(),
      });

      // Passed — proceed
      if (args.passed) {
        return {
          content: [{
            type: 'text' as const,
            text: `QUALITY CHECK PASSED \u2705 — Iteration ${currentIteration}
**Score**: ${args.score.toFixed(2)}
**Step**: ${args.step}

The deliverable meets quality criteria. Proceed to the next phase.`,
          }],
        };
      }

      // Failed — check iteration budget
      const maxIterations = DEFAULT_MAX_ITERATIONS;

      if (currentIteration >= maxIterations) {
        return {
          content: [{
            type: 'text' as const,
            text: `QUALITY CHECK FAILED \u274c — ITERATION BUDGET EXHAUSTED
**Score**: ${args.score.toFixed(2)}
**Step**: ${args.step}
**Iterations used**: ${currentIteration}/${maxIterations}

**Failure Reasons**:
${(args.failure_reasons ?? []).map((r, i) => `${i + 1}. ${r}`).join('\n')}

Iteration budget exhausted. Proceed with the best attempt available, but FLAG
the quality gaps explicitly in the deliverable. The reader deserves to know
what did not clear the bar. Do not hide the gaps — acknowledge them.`,
          }],
        };
      }

      // Failed within budget — revise
      return {
        content: [{
          type: 'text' as const,
          text: `QUALITY CHECK FAILED \u274c — REVISE (iteration ${currentIteration}/${maxIterations})
**Score**: ${args.score.toFixed(2)}
**Step**: ${args.step}

**What failed**:
${(args.failure_reasons ?? []).map((r, i) => `${i + 1}. ${r}`).join('\n')}

**Revision guidance**:
${(args.revision_guidance ?? []).map((g, i) => `${i + 1}. ${g}`).join('\n')}

Re-dispatch the specialist with the above feedback. Be SPECIFIC — "your assumptions
are implicit, state them explicitly" not "improve the analysis." Then run
\`run_quality_check\` again after revision.`,
        }],
      };
    },
  );

  return [runQualityCheck, recordQualityResult];
}
