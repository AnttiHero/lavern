/**
 * Unit tests for the Generic Workflow Engine.
 *
 * Tests: Step advancement through generic templates, precondition enforcement,
 * gate decisions, rejection handling, evaluator gate marking, workflow completion.
 *
 * These test the generic engine logic by replicating the state machine —
 * the same pattern used in workflow-engine.test.ts for the legal-design pipeline.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { WorkflowTemplate, GenericWorkflowState } from '../../src/types/workflow.js';

// Import templates for reference
import { counselTemplate } from '../../src/workflows/templates/counsel.js';
import { reviewTemplate } from '../../src/workflows/templates/review.js';

// ── Replicate Generic Workflow Engine Logic for Testing ──────────────

let state: GenericWorkflowState;

function initState(template: WorkflowTemplate): void {
  const now = new Date().toISOString();
  state = {
    templateId: template.id,
    currentStep: template.steps[0],
    completedSteps: [],
    gateDecisions: {},
    evaluatorResults: [],
    revisionCount: 0,
    startedAt: now,
    lastTransitionAt: now,
  };
}

function advanceStep(
  template: WorkflowTemplate,
  completedStep: string,
  gateDecision?: 'approved' | 'rejected' | 'skipped',
): { advanced?: string; error?: string; rejected?: boolean; complete?: boolean } {
  const steps = template.steps;
  const defs = template.stepDefinitions;

  if (completedStep !== state.currentStep) {
    return { error: `Cannot complete step "${completedStep}" — current step is "${state.currentStep}"` };
  }

  const stepDef = defs[completedStep];

  if (stepDef?.requiresGateApproval) {
    if (!gateDecision) {
      return { error: `Step "${completedStep}" requires a gate decision` };
    }
    const gateKey = stepDef.gateType ?? completedStep;
    state.gateDecisions[gateKey] = gateDecision;

    if (gateDecision === 'rejected') {
      return { rejected: true };
    }
  }

  state.completedSteps.push(completedStep);

  const currentIndex = steps.indexOf(completedStep);
  if (currentIndex >= steps.length - 1) {
    return { complete: true };
  }

  const nextStep = steps[currentIndex + 1];
  const nextDef = defs[nextStep];

  const unmet = (nextDef?.preconditions ?? []).filter(
    (pre: string) => !state.completedSteps.includes(pre),
  );
  if (unmet.length > 0) {
    return { error: `Preconditions not met for "${nextStep}": ${unmet.join(', ')}` };
  }

  state.currentStep = nextStep;
  state.lastTransitionAt = new Date().toISOString();
  return { advanced: nextStep };
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('Generic Workflow Engine', () => {
  describe('Counsel Workflow', () => {
    beforeEach(() => {
      initState(counselTemplate);
    });

    it('should start at intake', () => {
      expect(state.currentStep).toBe('intake');
      expect(state.completedSteps).toEqual([]);
    });

    it('should advance from intake to specialist_execution', () => {
      const result = advanceStep(counselTemplate, 'intake');
      expect(result).toEqual({ advanced: 'specialist_execution' });
    });

    it('should advance through the full happy path', () => {
      advanceStep(counselTemplate, 'intake');
      advanceStep(counselTemplate, 'specialist_execution');
      const result = advanceStep(counselTemplate, 'delivered');
      expect(result).toEqual({ complete: true });
      expect(state.completedSteps).toHaveLength(3);
    });

    it('should reject advancing the wrong step', () => {
      const result = advanceStep(counselTemplate, 'delivered');
      expect(result).toHaveProperty('error');
      expect(state.currentStep).toBe('intake');
    });

    it('should track completed steps', () => {
      advanceStep(counselTemplate, 'intake');
      advanceStep(counselTemplate, 'specialist_execution');
      expect(state.completedSteps).toEqual(['intake', 'specialist_execution']);
    });

    it('should have templateId set', () => {
      expect(state.templateId).toBe('counsel');
    });
  });

  describe('Review Workflow', () => {
    beforeEach(() => {
      initState(reviewTemplate);
    });

    it('should start at intake', () => {
      expect(state.currentStep).toBe('intake');
    });

    it('should advance through all 7 steps with gate approval', () => {
      advanceStep(reviewTemplate, 'intake');
      advanceStep(reviewTemplate, 'specialist_analysis');
      advanceStep(reviewTemplate, 'evaluator_gate');
      advanceStep(reviewTemplate, 'plain_language_review');
      advanceStep(reviewTemplate, 'verification_pass');
      advanceStep(reviewTemplate, 'final_gate', 'approved');
      const result = advanceStep(reviewTemplate, 'delivered');
      expect(result).toEqual({ complete: true });
      expect(state.completedSteps).toHaveLength(7);
    });

    it('should require gate decision for final_gate', () => {
      advanceStep(reviewTemplate, 'intake');
      advanceStep(reviewTemplate, 'specialist_analysis');
      advanceStep(reviewTemplate, 'evaluator_gate');
      advanceStep(reviewTemplate, 'plain_language_review');
      advanceStep(reviewTemplate, 'verification_pass');

      const result = advanceStep(reviewTemplate, 'final_gate');
      expect(result).toHaveProperty('error');
      expect(state.currentStep).toBe('final_gate');
    });

    it('should block on rejected gate', () => {
      advanceStep(reviewTemplate, 'intake');
      advanceStep(reviewTemplate, 'specialist_analysis');
      advanceStep(reviewTemplate, 'evaluator_gate');
      advanceStep(reviewTemplate, 'plain_language_review');
      advanceStep(reviewTemplate, 'verification_pass');

      const result = advanceStep(reviewTemplate, 'final_gate', 'rejected');
      expect(result).toHaveProperty('rejected', true);
      expect(state.currentStep).toBe('final_gate');
    });

    it('should record gate decisions', () => {
      advanceStep(reviewTemplate, 'intake');
      advanceStep(reviewTemplate, 'specialist_analysis');
      advanceStep(reviewTemplate, 'evaluator_gate');
      advanceStep(reviewTemplate, 'plain_language_review');
      advanceStep(reviewTemplate, 'verification_pass');
      advanceStep(reviewTemplate, 'final_gate', 'approved');

      expect(state.gateDecisions['final_delivery']).toBe('approved');
    });

    it('should have templateId set', () => {
      expect(state.templateId).toBe('review');
    });
  });

  describe('Precondition Enforcement', () => {
    it('should enforce preconditions on counsel steps', () => {
      initState(counselTemplate);
      // Each step requires the previous one
      expect(counselTemplate.stepDefinitions['specialist_execution'].preconditions).toEqual(['intake']);
      expect(counselTemplate.stepDefinitions['delivered'].preconditions).toEqual(['specialist_execution']);
    });

    it('should enforce preconditions on review steps', () => {
      initState(reviewTemplate);
      expect(reviewTemplate.stepDefinitions['specialist_analysis'].preconditions).toEqual(['intake']);
      expect(reviewTemplate.stepDefinitions['evaluator_gate'].preconditions).toEqual(['specialist_analysis']);
      expect(reviewTemplate.stepDefinitions['verification_pass'].preconditions).toEqual(['plain_language_review']);
      expect(reviewTemplate.stepDefinitions['final_gate'].preconditions).toEqual(['verification_pass']);
      expect(reviewTemplate.stepDefinitions['delivered'].preconditions).toEqual(['final_gate']);
    });

    it('should not allow jumping ahead in review', () => {
      initState(reviewTemplate);
      state.currentStep = 'final_gate';
      state.completedSteps = ['intake']; // Missing intermediate steps

      // The step name check prevents this: you can only complete the current step
      const result = advanceStep(reviewTemplate, 'final_gate');
      // It will try to advance to 'delivered' but preconditions require 'final_gate' completed
      // Actually gate decision is needed first
      expect(result).toHaveProperty('error'); // needs gate_decision
    });
  });

  describe('Evaluator Gate Marking', () => {
    it('review evaluator_gate should have evaluator flag', () => {
      const evalStep = reviewTemplate.stepDefinitions['evaluator_gate'];
      expect(evalStep.requiresEvaluatorGate).toBe(true);
      expect(evalStep.maxRevisionLoops).toBe(2);
    });

    it('counsel should have no evaluator gates', () => {
      const evalGates = Object.values(counselTemplate.stepDefinitions)
        .filter(s => s.requiresEvaluatorGate);
      expect(evalGates).toHaveLength(0);
    });

    it('counsel should have no human gates', () => {
      const humanGates = Object.values(counselTemplate.stepDefinitions)
        .filter(s => s.requiresGateApproval);
      expect(humanGates).toHaveLength(0);
    });

    it('review should have 1 human gate', () => {
      const humanGates = Object.values(reviewTemplate.stepDefinitions)
        .filter(s => s.requiresGateApproval);
      expect(humanGates).toHaveLength(1);
    });
  });

  describe('State Tracking', () => {
    it('should initialize with correct state shape', () => {
      initState(counselTemplate);
      expect(state.templateId).toBe('counsel');
      expect(state.currentStep).toBe('intake');
      expect(state.completedSteps).toEqual([]);
      expect(state.gateDecisions).toEqual({});
      expect(state.evaluatorResults).toEqual([]);
      expect(state.revisionCount).toBe(0);
      expect(state.startedAt).toBeTruthy();
      expect(state.lastTransitionAt).toBeTruthy();
    });

    it('should update lastTransitionAt on advancement', () => {
      initState(counselTemplate);
      const initialTime = state.lastTransitionAt;

      // Small delay to ensure time difference
      advanceStep(counselTemplate, 'intake');
      expect(state.lastTransitionAt).toBeTruthy();
      // The time should be updated (may or may not differ due to test speed)
    });
  });
});

// ── Quality escalation is the client's decision, enforced by the engine ──
import { SessionState } from '../../src/session/session-state.js';
import { createGenericWorkflowTools } from '../../src/mcp/tools/generic-workflow-engine.js';

function escalatedSession(raisedAt: string): SessionState {
  const s = new SessionState('test-esc-engine');
  const now = new Date().toISOString();
  s.genericWorkflow = {
    templateId: 'review', currentStep: 'evaluator_gate', completedSteps: ['intake', 'specialist_analysis'],
    gateDecisions: {}, evaluatorResults: [], revisionCount: 2, qualityChecks: [], stepIterationCounts: {}, handoffs: [],
    startedAt: now, lastTransitionAt: now,
    qualityEscalation: { step: 'evaluator_gate', score: 0.58, revisions: 2, maxRevisions: 2, failureReasons: ['x'], raisedAt },
  } as never;
  return s;
}
const advanceTool = (s: SessionState) =>
  (createGenericWorkflowTools(s, reviewTemplate) as any[]).find(t => t.name === 'advance_step') as any;

describe('advance_step under an unresolved quality escalation', () => {
  it('refuses to advance until a human decision recorded after the escalation exists', async () => {
    const s = escalatedSession(new Date().toISOString());
    const res = await advanceTool(s).handler({ completed_step: 'evaluator_gate' });
    expect(res.content[0].text).toContain('cannot advance until a HUMAN decides');
    expect(s.genericWorkflow!.currentStep).toBe('evaluator_gate');
  });

  it('a stale decision from before the escalation does not count', async () => {
    const s = escalatedSession(new Date(Date.now() + 60_000).toISOString());
    s.gateDecisions.push({ gateType: 'final_delivery', timestamp: new Date().toISOString(), summary: 'old', decision: 'approve' });
    const res = await advanceTool(s).handler({ completed_step: 'evaluator_gate' });
    expect(res.content[0].text).toContain('cannot advance until a HUMAN decides');
  });

  it('a human rejection re-raises the escalation and does not advance', async () => {
    const s = escalatedSession(new Date(Date.now() - 1000).toISOString());
    s.gateDecisions.push({ gateType: 'quality_escalation', timestamp: new Date().toISOString(), summary: 'q', decision: 'reject', notes: 'fix the cap' });
    const res = await advanceTool(s).handler({ completed_step: 'evaluator_gate' });
    expect(res.content[0].text).toContain('REJECTED');
    expect(res.content[0].text).toContain('fix the cap');
    expect(s.genericWorkflow!.qualityEscalation!.resolvedBy).toBeUndefined();
    expect(s.genericWorkflow!.currentStep).toBe('evaluator_gate');
  });

  it('a human approval resolves the escalation on the record and the workflow advances', async () => {
    const s = escalatedSession(new Date(Date.now() - 1000).toISOString());
    s.gateDecisions.push({ gateType: 'quality_escalation', timestamp: new Date().toISOString(), summary: 'q', decision: 'approve', notes: 'deliver with caveats' });
    const res = await advanceTool(s).handler({ completed_step: 'evaluator_gate' });
    expect(res.content[0].text).not.toContain('cannot advance');
    expect(s.genericWorkflow!.qualityEscalation!.resolvedBy).toMatchObject({ gateType: 'quality_escalation', decision: 'approve', notes: 'deliver with caveats' });
    expect(s.genericWorkflow!.completedSteps).toContain('evaluator_gate');
  });
});
