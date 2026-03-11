/**
 * Evaluator Gate MCP Tools — Automated quality checking for specialist deliverables.
 *
 * v5: Two tools that bracket the evaluator agent invocation:
 *
 * 1. `run_evaluator_gate` — Called by the orchestrator to REQUEST evaluation.
 *    Records the invocation and emits an event. The orchestrator then
 *    dispatches the evaluator subagent.
 *
 * 2. `record_evaluation_result` — Called after the evaluator subagent completes.
 *    Records pass/fail, score, failure reasons. Increments revision count.
 *    After maxRevisionLoops failures, returns escalation message.
 */

import { z } from 'zod';
import { tool } from '@anthropic-ai/claude-agent-sdk';
import type { SessionState } from '../../session/session-state.js';
import { boundedPush } from '../../session/session-state.js';
import type { EvaluatorResult } from '../../types/workflow.js';
import { eventTimestamp } from '../../events/event-bus.js';

export function createEvaluatorGateTools(session: SessionState) {

  const runEvaluatorGate = tool(
    'run_evaluator_gate',
    'Request an evaluator gate check on a specialist deliverable. Call this BEFORE dispatching the evaluator subagent. Records the invocation and emits an event.',
    {
      specialist_role: z.string()
        .describe('The role of the specialist whose work is being evaluated (e.g., "contract-reviewer")'),
      step: z.string()
        .describe('The current workflow step (e.g., "evaluator_gate")'),
    },
    async (args) => {
      const gw = session.genericWorkflow;
      const revisionNumber = gw ? gw.revisionCount + 1 : 1;

      // Emit event
      session.events.emitEvent({
        type: 'evaluator_gate_run',
        specialistRole: args.specialist_role,
        step: args.step,
        revisionNumber,
        timestamp: eventTimestamp(),
      });

      return {
        content: [{
          type: 'text' as const,
          text: `EVALUATOR GATE REQUESTED
**Specialist**: ${args.specialist_role}
**Step**: ${args.step}
**Revision**: ${revisionNumber}

Now dispatch the evaluator subagent to review the specialist's deliverable.
After the evaluator completes, call \`record_evaluation_result\` with the results.`,
        }],
      };
    },
  );

  const recordEvaluationResult = tool(
    'record_evaluation_result',
    'Record the result of an evaluator gate check. Call this AFTER the evaluator subagent has completed its review. Updates state with pass/fail and handles revision loops.',
    {
      step: z.string()
        .describe('The workflow step this evaluation is for'),
      passed: z.boolean()
        .describe('Whether the deliverable passed the evaluator gate'),
      score: z.number().min(0).max(1)
        .describe('Overall quality score from the evaluator (0.0 - 1.0)'),
      failure_reasons: z.array(z.string()).optional()
        .describe('Specific reasons for failure (required if passed is false)'),
      revision_suggestions: z.array(z.string()).optional()
        .describe('Concrete suggestions for improving the deliverable'),
    },
    async (args) => {
      const gw = session.genericWorkflow;

      // Create evaluator result
      const result: EvaluatorResult = {
        step: args.step,
        passed: args.passed,
        failureReasons: args.failure_reasons ?? [],
        score: args.score,
        revisionNumber: gw ? gw.revisionCount + 1 : 1,
        timestamp: eventTimestamp(),
      };

      // Record in session state
      if (gw) {
        boundedPush(gw.evaluatorResults, result);
        if (!args.passed) {
          gw.revisionCount++;
        }
      }

      // Emit event
      session.events.emitEvent({
        type: 'evaluator_gate_result',
        passed: args.passed,
        score: args.score,
        step: args.step,
        failureReasons: args.failure_reasons ?? [],
        timestamp: eventTimestamp(),
      });

      if (args.passed) {
        return {
          content: [{
            type: 'text' as const,
            text: `EVALUATOR GATE PASSED \u2705
**Score**: ${args.score.toFixed(2)}
**Step**: ${args.step}

The deliverable meets quality standards. Proceed to the next workflow step.`,
          }],
        };
      }

      // Failed — check revision limit
      const maxRevisions = 2; // Default; templates can override via step definition
      const currentRevisions = gw ? gw.revisionCount : 1;

      if (currentRevisions >= maxRevisions) {
        return {
          content: [{
            type: 'text' as const,
            text: `EVALUATOR GATE FAILED \u274c — ESCALATION REQUIRED \u26a0\ufe0f
**Score**: ${args.score.toFixed(2)}
**Step**: ${args.step}
**Revisions exhausted**: ${currentRevisions}/${maxRevisions}

The deliverable has failed the evaluator gate ${currentRevisions} times.
Maximum revision loops reached. This must be ESCALATED TO HUMAN REVIEW.

**Failure Reasons**:
${(args.failure_reasons ?? []).map((r, i) => `${i + 1}. ${r}`).join('\n')}

**Revision Suggestions**:
${(args.revision_suggestions ?? []).map((s, i) => `${i + 1}. ${s}`).join('\n')}

Invoke the approval gate to present these issues to the human for decision.`,
          }],
        };
      }

      return {
        content: [{
          type: 'text' as const,
          text: `EVALUATOR GATE FAILED \u274c — REVISION ${currentRevisions}/${maxRevisions}
**Score**: ${args.score.toFixed(2)}
**Step**: ${args.step}

The deliverable does not meet quality standards. Revise and re-submit.

**Failure Reasons**:
${(args.failure_reasons ?? []).map((r, i) => `${i + 1}. ${r}`).join('\n')}

**Revision Suggestions**:
${(args.revision_suggestions ?? []).map((s, i) => `${i + 1}. ${s}`).join('\n')}

Re-dispatch the specialist with the above feedback, then run the evaluator gate again.`,
        }],
      };
    },
  );

  return [runEvaluatorGate, recordEvaluationResult];
}
