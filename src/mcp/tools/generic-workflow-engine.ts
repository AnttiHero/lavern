/**
 * Generic Workflow Engine MCP Tools — Enforces any workflow template
 * as a state machine with preconditions and transition rules.
 *
 * v5: This is the generic counterpart to workflow-engine.ts.
 * The original workflow-engine.ts uses hardcoded WORKFLOW_STEPS and
 * STEP_DEFINITIONS. This version reads from a WorkflowTemplate and
 * GenericWorkflowState on the session.
 *
 * Tool names are the SAME as the original workflow engine
 * (get_current_step, advance_step, get_workflow_history) —
 * the MCP server decides which factory to use based on whether
 * the session is running a generic workflow or the legal-design pipeline.
 */

import { z } from 'zod';
import { tool } from '@anthropic-ai/claude-agent-sdk';
import type { WorkflowTemplate } from '../../types/workflow.js';
import type { SessionState } from '../../session/session-state.js';
import { eventTimestamp } from '../../events/event-bus.js';

export function createGenericWorkflowTools(
  session: SessionState,
  template: WorkflowTemplate,
) {
  // Initialize generic workflow state on session if not present
  if (!session.genericWorkflow) {
    const now = new Date().toISOString();
    session.genericWorkflow = {
      templateId: template.id,
      currentStep: template.steps[0],
      completedSteps: [],
      gateDecisions: {},
      evaluatorResults: [],
      revisionCount: 0,
      qualityChecks: [],
      stepIterationCounts: {},
      handoffs: [],
      startedAt: now,
      lastTransitionAt: now,
    };
  }

  const state = session.genericWorkflow;
  const steps = template.steps;
  const defs = template.stepDefinitions;

  const getCurrentStep = tool(
    'get_current_step',
    'Get the current workflow step and what needs to happen next.',
    {},
    async () => {
      const stepDef = defs[state.currentStep];
      const stepIndex = steps.indexOf(state.currentStep);
      const nextStep = stepIndex < steps.length - 1 ? steps[stepIndex + 1] : null;
      const nextDef = nextStep ? defs[nextStep] : null;

      return {
        content: [{
          type: 'text' as const,
          text: `## Workflow Status (${template.id})

**Current Step**: ${state.currentStep} (${stepIndex + 1}/${steps.length})
**Description**: ${stepDef?.description ?? '(no description)'}
**Completed Steps**: ${state.completedSteps.join(' \u2192 ') || '(none)'}
${nextStep ? `**Next Step**: ${nextStep} \u2014 ${nextDef?.description ?? ''}` : '**Status**: Final step reached'}
${stepDef?.requiresGateApproval ? `**Gate Required**: ${stepDef.gateType ?? 'approval'} (must invoke approval gate)` : ''}
${stepDef?.requiresEvaluatorGate ? `**Evaluator Gate**: Automated quality check required (max ${stepDef.maxRevisionLoops ?? 2} revision loops)` : ''}
**Gate Decisions**: ${JSON.stringify(state.gateDecisions)}
**Revision Count**: ${state.revisionCount}`,
        }],
      };
    },
    { annotations: { readOnly: true } },
  );

  const advanceStep = tool(
    'advance_step',
    'Advance to the next workflow step. Will FAIL if preconditions are not met. You must call this after completing each step to progress the workflow.',
    {
      completed_step: z.string()
        .describe('The step that was just completed'),
      gate_decision: z.enum(['approved', 'rejected', 'skipped']).optional()
        .describe('For gate steps: the human decision. Use "skipped" only if no findings require a gate.'),
      notes: z.string().optional()
        .describe('Optional notes about what happened in this step'),
    },
    async (args) => {
      const completedStep = args.completed_step;

      // Must complete the current step
      if (completedStep !== state.currentStep) {
        return {
          content: [{
            type: 'text' as const,
            text: `ERROR: Cannot complete step "${completedStep}" \u2014 current step is "${state.currentStep}". Steps must be completed in order.`,
          }],
        };
      }

      const stepDef = defs[completedStep];

      // Gate steps require a decision
      if (stepDef?.requiresGateApproval) {
        if (!args.gate_decision) {
          return {
            content: [{
              type: 'text' as const,
              text: `ERROR: Step "${completedStep}" is a gate step requiring a decision. Provide gate_decision: "approved", "rejected", or "skipped" (only if no findings require the gate).`,
            }],
          };
        }
        const gateKey = stepDef.gateType ?? completedStep;
        state.gateDecisions[gateKey] = args.gate_decision;

        if (args.gate_decision === 'rejected') {
          return {
            content: [{
              type: 'text' as const,
              text: `GATE REJECTED: ${gateKey}. The workflow does NOT advance. Address the rejection and try again.`,
            }],
          };
        }
      }

      // Record completion (guard against duplicate entries from retry after gate rejection)
      const previousStep = state.currentStep;
      if (!state.completedSteps.includes(completedStep)) {
        state.completedSteps.push(completedStep);
      }

      const currentIndex = steps.indexOf(completedStep);

      // Check if we're at the last step
      if (currentIndex >= steps.length - 1) {
        session.events.emitEvent({
          type: 'workflow_step',
          step: completedStep as import('../../types/workflow.js').WorkflowStep,
          previousStep: previousStep as import('../../types/workflow.js').WorkflowStep,
          timestamp: eventTimestamp(),
        });
        return {
          content: [{
            type: 'text' as const,
            text: `WORKFLOW COMPLETE (${template.id}): All steps finished.`,
          }],
        };
      }

      // Advance to next step
      const nextStep = steps[currentIndex + 1];
      const nextDef = defs[nextStep];

      // Check preconditions
      const unmetPreconditions = (nextDef?.preconditions ?? []).filter(
        (pre: string) => !state.completedSteps.includes(pre),
      );
      if (unmetPreconditions.length > 0) {
        return {
          content: [{
            type: 'text' as const,
            text: `ERROR: Cannot advance to "${nextStep}" \u2014 preconditions not met: ${unmetPreconditions.join(', ')}. Complete these steps first.`,
          }],
        };
      }

      state.currentStep = nextStep;
      state.lastTransitionAt = new Date().toISOString();

      session.events.emitEvent({
        type: 'workflow_step',
        step: nextStep as import('../../types/workflow.js').WorkflowStep,
        previousStep: previousStep as import('../../types/workflow.js').WorkflowStep,
        timestamp: eventTimestamp(),
      });

      return {
        content: [{
          type: 'text' as const,
          text: `ADVANCED: ${completedStep} \u2192 ${nextStep}
**Now**: ${nextDef?.description ?? ''}
${nextDef?.requiresGateApproval ? `\u26a0\ufe0f GATE STEP: Must invoke ${nextDef.gateType ?? 'approval'} gate before advancing.` : ''}
${nextDef?.requiresEvaluatorGate ? `\ud83d\udd0d EVALUATOR GATE: Automated quality check required.` : ''}
**Progress**: ${state.completedSteps.length}/${steps.length} steps completed`,
        }],
      };
    },
  );

  const getWorkflowHistory = tool(
    'get_workflow_history',
    'Get the full workflow history \u2014 all completed steps, gate decisions, and timing.',
    {},
    async () => {
      const history = state.completedSteps.map((step, i) => {
        const def = defs[step];
        const gateKey = def?.gateType ?? step;
        const gateInfo = def?.requiresGateApproval && state.gateDecisions[gateKey]
          ? ` [GATE: ${state.gateDecisions[gateKey]}]`
          : '';
        const evalInfo = def?.requiresEvaluatorGate
          ? ` [EVALUATOR: revision ${state.revisionCount}]`
          : '';
        return `${i + 1}. ${step}${gateInfo}${evalInfo}`;
      }).join('\n');

      return {
        content: [{
          type: 'text' as const,
          text: `## Workflow History (${template.id})

${history || '(no steps completed)'}

**Current**: ${state.currentStep}
**Started**: ${state.startedAt}
**Last Transition**: ${state.lastTransitionAt}
**Gate Decisions**: ${JSON.stringify(state.gateDecisions, null, 2)}
**Evaluator Results**: ${state.evaluatorResults.length} evaluations
**Revision Count**: ${state.revisionCount}`,
        }],
      };
    },
    { annotations: { readOnly: true } },
  );

  return [getCurrentStep, advanceStep, getWorkflowHistory];
}
