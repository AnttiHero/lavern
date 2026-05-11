/**
 * Workflow Engine MCP Tool — Enforces the 10-step orchestration workflow.
 *
 * v3: Refactored to factory pattern — state lives in SessionState.
 * Events emitted on step transitions for visualization.
 *
 * The orchestrator MUST advance through steps in order. Each step has
 * preconditions that must be met. This is the programmatic enforcement
 * layer — even if the orchestrator prompt is ignored, the state machine
 * prevents skipping steps.
 */

import { z } from 'zod';
import { tool } from '@anthropic-ai/claude-agent-sdk';
import {
  WORKFLOW_STEPS,
  STEP_DEFINITIONS,
  type WorkflowStep,
} from '../../types/workflow.js';
import type { SessionState } from '../../session/session-state.js';
import { eventTimestamp } from '../../events/event-bus.js';

export function createWorkflowTools(session: SessionState) {
  const state = session.workflow;

  const getCurrentStep = tool(
    'get_current_step',
    'Get the current workflow step and what needs to happen next.',
    {},
    async () => {
      const stepDef = STEP_DEFINITIONS[state.currentStep];
      const stepIndex = WORKFLOW_STEPS.indexOf(state.currentStep);
      const nextStep = stepIndex < WORKFLOW_STEPS.length - 1 ? WORKFLOW_STEPS[stepIndex + 1] : null;
      const nextDef = nextStep ? STEP_DEFINITIONS[nextStep] : null;

      return {
        content: [{
          type: 'text' as const,
          text: `## Workflow Status

**Current Step**: ${state.currentStep} (${stepIndex + 1}/${WORKFLOW_STEPS.length})
**Description**: ${stepDef.description}
**Completed Steps**: ${state.completedSteps.join(' \u2192 ') || '(none)'}
${nextStep ? `**Next Step**: ${nextStep} \u2014 ${nextDef!.description}` : '**Status**: Final step reached'}
${stepDef.requiresGateApproval ? `**Gate Required**: ${stepDef.gateType} (must invoke approval gate)` : ''}
**Gate Decisions**: ${JSON.stringify(state.gateDecisions)}`
        }],
      };
    },
    { annotations: { readOnly: true } }
  );

  const advanceStep = tool(
    'advance_step',
    'Advance to the next workflow step. Will FAIL if preconditions are not met. You must call this after completing each step to progress the workflow.',
    {
      completed_step: z.enum(WORKFLOW_STEPS as unknown as [string, ...string[]])
        .describe('The step that was just completed'),
      gate_decision: z.enum(['approved', 'rejected', 'skipped']).optional()
        .describe('For gate steps: the human decision. Use "skipped" only if no RED/CRITICAL findings require a gate.'),
      notes: z.string().optional()
        .describe('Optional notes about what happened in this step'),
    },
    async (args) => {
      const completedStep = args.completed_step as WorkflowStep;

      if (completedStep !== state.currentStep) {
        return {
          content: [{
            type: 'text' as const,
            text: `ERROR: Cannot complete step "${completedStep}" \u2014 current step is "${state.currentStep}". Steps must be completed in order.`
          }],
        };
      }

      const stepDef = STEP_DEFINITIONS[completedStep];
      if (stepDef.requiresGateApproval) {
        if (!args.gate_decision) {
          return {
            content: [{
              type: 'text' as const,
              text: `ERROR: Step "${completedStep}" is a gate step requiring a decision. Provide gate_decision: "approved", "rejected", or "skipped" (only if no findings require the gate).`
            }],
          };
        }
        state.gateDecisions[stepDef.gateType!] = args.gate_decision;

        if (args.gate_decision === 'rejected') {
          return {
            content: [{
              type: 'text' as const,
              text: `GATE REJECTED: ${stepDef.gateType}. The workflow does NOT advance. The orchestrator must address the rejection (re-run relevant agents with modified approach) and then try advancing again.`
            }],
          };
        }
      }

      const previousStep = state.currentStep;
      if (!state.completedSteps.includes(completedStep)) {
        state.completedSteps.push(completedStep);
      }

      const currentIndex = WORKFLOW_STEPS.indexOf(completedStep);
      if (currentIndex >= WORKFLOW_STEPS.length - 1) {
        session.events.emitEvent({
          type: 'workflow_step',
          step: 'delivered',
          previousStep,
          timestamp: eventTimestamp(),
        });
        return {
          content: [{
            type: 'text' as const,
            text: `WORKFLOW COMPLETE: All steps finished. The document has been fully processed.`
          }],
        };
      }

      const nextStep = WORKFLOW_STEPS[currentIndex + 1];
      const nextDef = STEP_DEFINITIONS[nextStep];

      const unmetPreconditions = nextDef.preconditions.filter(
        pre => !state.completedSteps.includes(pre)
      );
      if (unmetPreconditions.length > 0) {
        return {
          content: [{
            type: 'text' as const,
            text: `ERROR: Cannot advance to "${nextStep}" \u2014 preconditions not met: ${unmetPreconditions.join(', ')}. Complete these steps first.`
          }],
        };
      }

      state.currentStep = nextStep;
      state.lastTransitionAt = new Date().toISOString();

      session.events.emitEvent({
        type: 'workflow_step',
        step: nextStep,
        previousStep,
        timestamp: eventTimestamp(),
      });

      return {
        content: [{
          type: 'text' as const,
          text: `ADVANCED: ${completedStep} \u2192 ${nextStep}
**Now**: ${nextDef.description}
${nextDef.requiresGateApproval ? `\u26a0\ufe0f GATE STEP: Must invoke ${nextDef.gateType} approval gate before advancing.` : ''}
**Progress**: ${state.completedSteps.length}/${WORKFLOW_STEPS.length} steps completed`
        }],
      };
    }
  );

  const getWorkflowHistory = tool(
    'get_workflow_history',
    'Get the full workflow history \u2014 all completed steps, gate decisions, and timing.',
    {},
    async () => {
      const history = state.completedSteps.map((step, i) => {
        const def = STEP_DEFINITIONS[step];
        const gateInfo = def.requiresGateApproval && state.gateDecisions[def.gateType!]
          ? ` [GATE: ${state.gateDecisions[def.gateType!]}]`
          : '';
        return `${i + 1}. ${step}${gateInfo}`;
      }).join('\n');

      return {
        content: [{
          type: 'text' as const,
          text: `## Workflow History

${history || '(no steps completed)'}

**Current**: ${state.currentStep}
**Started**: ${state.startedAt}
**Last Transition**: ${state.lastTransitionAt}
**Gate Decisions**: ${JSON.stringify(state.gateDecisions, null, 2)}`
        }],
      };
    },
    { annotations: { readOnly: true } }
  );

  return [getCurrentStep, advanceStep, getWorkflowHistory];
}
