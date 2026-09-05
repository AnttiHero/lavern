/**
 * Completion contract — the one place that decides whether an engagement
 * actually finished.
 *
 * Every executor (Anthropic SDK stream, local loop, Mistral loop) used to
 * treat "the loop ended" as "the review completed" and went straight to
 * assembly: a max-turn stop at intake produced a tier-1 deliverable with no
 * gate decision. Now each executor asks assessCompletion() first and only a
 * 'completed' outcome may assemble and deliver normally. Everything else is
 * an explicit terminal state, preserved as partial findings and labelled.
 */

import type { SessionState } from '../session/session-state.js';
import type { WorkflowTemplate } from '../types/workflow.js';
import type { StreamOutcome } from '../utils/stream-messages.js';

export type WorkflowOutcome = 'completed' | 'awaiting_approval' | 'interrupted' | 'failed' | 'budget_exhausted';

export interface CompletionAssessment {
  outcome: WorkflowOutcome;
  /** Plain-language reasons, shown to the client and kept in the audit. */
  reasons: string[];
}

export function assessCompletion(
  session: SessionState,
  template: WorkflowTemplate,
  stream?: StreamOutcome,
): CompletionAssessment {
  const reasons: string[] = [];

  if (session.isHalted()) {
    return { outcome: 'interrupted', reasons: [`Session halted: ${session.haltReason ?? 'cancelled'}`] };
  }
  if (stream?.outcome === 'failed') {
    return { outcome: 'failed', reasons: [`The orchestrator run failed (${stream.subtype ?? 'unknown'})${stream.errors ? `: ${String(Array.isArray(stream.errors) ? stream.errors.join('; ') : stream.errors)}` : ''}`] };
  }

  const gw = session.genericWorkflow;
  const finalStep = template.steps[template.steps.length - 1];
  const stateComplete = gw !== undefined
    && (gw.currentStep === finalStep || gw.completedSteps.includes(finalStep));

  if (session.budgetUsd > 0 && session.accumulatedCost >= session.budgetUsd && !stateComplete) {
    return { outcome: 'budget_exhausted', reasons: [`Budget exhausted at $${session.accumulatedCost.toFixed(2)} of $${session.budgetUsd.toFixed(2)} before the workflow finished (at step "${gw?.currentStep ?? 'intake'}").`] };
  }
  if (stream?.outcome === 'interrupted') {
    reasons.push(`The orchestrator stopped before finishing (${stream.subtype ?? 'interrupted'}) at step "${gw?.currentStep ?? 'intake'}".`);
    return { outcome: 'interrupted', reasons };
  }
  if (!gw) {
    return { outcome: 'failed', reasons: ['The workflow never started: no workflow state was recorded.'] };
  }
  if (gw.qualityEscalation && !gw.qualityEscalation.resolvedBy) {
    return { outcome: 'awaiting_approval', reasons: [`The evaluator failed step "${gw.qualityEscalation.step}" at ${gw.qualityEscalation.score.toFixed(2)} after ${gw.qualityEscalation.revisions}/${gw.qualityEscalation.maxRevisions} revisions and no human decision resolved it.`] };
  }

  // Every gated or evaluated step must have been completed through the engine
  // (advance_step enforces the human decision / evaluator evidence there).
  for (const step of template.steps) {
    const def = template.stepDefinitions[step];
    if (!def) continue;
    if ((def.requiresGateApproval || def.requiresEvaluatorGate) && !gw.completedSteps.includes(step)) {
      reasons.push(def.requiresGateApproval
        ? `Human gate "${def.gateType ?? step}" was never decided (step "${step}" not completed).`
        : `Evaluator step "${step}" was never completed.`);
    }
  }
  if (!stateComplete) {
    reasons.push(`The workflow ended at step "${gw.currentStep}", not "${finalStep}".`);
  }
  if (reasons.length > 0) {
    // Text came back, but the state machine did not finish: that is an
    // interruption (model stopped early), never a completion.
    return { outcome: 'interrupted', reasons };
  }
  return { outcome: 'completed', reasons: [] };
}

/** Record a non-completed outcome on the session as partial, labelled work. */
export function markIncomplete(session: SessionState, assessment: CompletionAssessment): void {
  session.outcome = assessment.outcome;
  session.outcomeReasons = assessment.reasons;
  session.outputTier = 4;
  const findings = session.debate.findings.length;
  session.outputTierReason = `Engagement ended as ${assessment.outcome.replace('_', ' ')}: ${assessment.reasons.join(' ')} ${findings > 0 ? `${findings} finding(s) preserved as PARTIAL work.` : 'No findings were produced.'} No deliverable was assembled.`;
}
