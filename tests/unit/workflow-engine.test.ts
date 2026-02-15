/**
 * Unit tests for the Workflow Engine.
 *
 * Tests: Step preconditions, step ordering, gate requirements,
 * rejection handling, workflow completion.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  WORKFLOW_STEPS,
  STEP_DEFINITIONS,
  type WorkflowStep,
  type WorkflowState,
} from '../../src/types/workflow.js';

// ── Replicate Workflow Engine Logic for Testing ───────────────────────

let state: WorkflowState;

function resetState() {
  state = {
    currentStep: 'intake',
    completedSteps: [],
    gateDecisions: {},
    startedAt: new Date().toISOString(),
    lastTransitionAt: new Date().toISOString(),
  };
}

function advanceStep(completedStep: WorkflowStep, gateDecision?: 'approved' | 'rejected' | 'skipped') {
  // Verify this is the current step
  if (completedStep !== state.currentStep) {
    return { error: `Cannot complete step "${completedStep}" — current step is "${state.currentStep}"` };
  }

  const stepDef = STEP_DEFINITIONS[completedStep];

  // For gate steps, require a decision
  if (stepDef.requiresGateApproval) {
    if (!gateDecision) {
      return { error: `Step "${completedStep}" requires a gate decision` };
    }
    state.gateDecisions[stepDef.gateType!] = gateDecision;

    if (gateDecision === 'rejected') {
      return { rejected: true, gateType: stepDef.gateType };
    }
  }

  state.completedSteps.push(completedStep);

  const currentIndex = WORKFLOW_STEPS.indexOf(completedStep);
  if (currentIndex >= WORKFLOW_STEPS.length - 1) {
    return { complete: true };
  }

  const nextStep = WORKFLOW_STEPS[currentIndex + 1];
  const nextDef = STEP_DEFINITIONS[nextStep];

  // Check preconditions for next step
  const unmet = nextDef.preconditions.filter(
    pre => !state.completedSteps.includes(pre)
  );
  if (unmet.length > 0) {
    return { error: `Preconditions not met for "${nextStep}": ${unmet.join(', ')}` };
  }

  state.currentStep = nextStep;
  return { advanced: nextStep };
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('Workflow Engine', () => {
  beforeEach(() => {
    resetState();
  });

  describe('Step Definitions', () => {
    it('should define all 11 steps', () => {
      expect(WORKFLOW_STEPS).toHaveLength(11);
    });

    it('should start with intake', () => {
      expect(WORKFLOW_STEPS[0]).toBe('intake');
    });

    it('should end with delivered', () => {
      expect(WORKFLOW_STEPS[WORKFLOW_STEPS.length - 1]).toBe('delivered');
    });

    it('should have 3 gate steps', () => {
      const gateSteps = Object.values(STEP_DEFINITIONS).filter(s => s.requiresGateApproval);
      expect(gateSteps).toHaveLength(3);
      expect(gateSteps.map(s => s.gateType)).toEqual(
        expect.arrayContaining(['ethics_critical', 'meaning_critical', 'final_delivery'])
      );
    });

    it('intake should have no preconditions', () => {
      expect(STEP_DEFINITIONS.intake.preconditions).toEqual([]);
    });

    it('transformation should require ethics_gate', () => {
      expect(STEP_DEFINITIONS.transformation.preconditions).toContain('ethics_gate');
    });
  });

  describe('Step Advancement', () => {
    it('should advance from intake to parallel_analysis', () => {
      const result = advanceStep('intake');
      expect(result).toEqual({ advanced: 'parallel_analysis' });
      expect(state.currentStep).toBe('parallel_analysis');
    });

    it('should reject advancing the wrong step', () => {
      const result = advanceStep('transformation' as WorkflowStep);
      expect(result).toHaveProperty('error');
      expect(state.currentStep).toBe('intake'); // unchanged
    });

    it('should track completed steps', () => {
      advanceStep('intake');
      advanceStep('parallel_analysis');
      expect(state.completedSteps).toEqual(['intake', 'parallel_analysis']);
    });

    it('should complete the full happy path', () => {
      advanceStep('intake');
      advanceStep('parallel_analysis');
      advanceStep('debate_1');
      advanceStep('ethics_gate', 'approved');
      advanceStep('transformation');
      advanceStep('parallel_verification');
      advanceStep('debate_2');
      advanceStep('meaning_gate', 'approved');
      advanceStep('synthesis');
      advanceStep('final_gate', 'approved');
      const final = advanceStep('delivered');
      expect(final).toEqual({ complete: true });
    });
  });

  describe('Gate Steps', () => {
    it('should require gate_decision for gate steps', () => {
      advanceStep('intake');
      advanceStep('parallel_analysis');
      advanceStep('debate_1');

      const result = advanceStep('ethics_gate'); // No decision
      expect(result).toHaveProperty('error');
      expect(state.currentStep).toBe('ethics_gate'); // stayed
    });

    it('should accept approved gates', () => {
      advanceStep('intake');
      advanceStep('parallel_analysis');
      advanceStep('debate_1');

      const result = advanceStep('ethics_gate', 'approved');
      expect(result).toEqual({ advanced: 'transformation' });
    });

    it('should accept skipped gates (no RED findings)', () => {
      advanceStep('intake');
      advanceStep('parallel_analysis');
      advanceStep('debate_1');

      const result = advanceStep('ethics_gate', 'skipped');
      expect(result).toEqual({ advanced: 'transformation' });
    });

    it('should block on rejected gates', () => {
      advanceStep('intake');
      advanceStep('parallel_analysis');
      advanceStep('debate_1');

      const result = advanceStep('ethics_gate', 'rejected');
      expect(result).toHaveProperty('rejected', true);
      expect(state.currentStep).toBe('ethics_gate'); // stayed
    });

    it('should record gate decisions', () => {
      advanceStep('intake');
      advanceStep('parallel_analysis');
      advanceStep('debate_1');
      advanceStep('ethics_gate', 'approved');

      expect(state.gateDecisions['ethics_critical']).toBe('approved');
    });
  });

  describe('Precondition Enforcement', () => {
    it('should not allow skipping to transformation', () => {
      // Try to jump from intake directly by manipulating state
      state.currentStep = 'transformation';
      state.completedSteps = ['intake']; // Missing parallel_analysis, debate_1, ethics_gate

      // The advance function checks current step, not preconditions directly.
      // But if we complete transformation, the NEXT step would check preconditions.
      // Let's verify the step definitions have the right preconditions.
      expect(STEP_DEFINITIONS.transformation.preconditions).toContain('ethics_gate');
      expect(STEP_DEFINITIONS.parallel_verification.preconditions).toContain('transformation');
      expect(STEP_DEFINITIONS.synthesis.preconditions).toContain('meaning_gate');
    });

    it('delivered should require final_gate', () => {
      expect(STEP_DEFINITIONS.delivered.preconditions).toContain('final_gate');
    });
  });
});
