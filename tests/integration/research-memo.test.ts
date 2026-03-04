/**
 * Integration Test — Adversarial Workflow.
 *
 * Tests the adversarial workflow stepping through all 5 stages
 * (intake → build → attack → synthesize → delivered),
 * quality check iterations, phase permissions, and state tracking.
 *
 * Does NOT call the Claude API — simulates the orchestrator's
 * progression through the generic state machine.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SessionState } from '../../src/session/session-state.js';
import { workflowRegistry } from '../../src/workflows/registry.js';
import { createDynamicPermissions } from '../../src/permissions/dynamic-permissions.js';
import type { WorkflowTemplate, GenericWorkflowState } from '../../src/types/workflow.js';

// Ensure templates are registered
import '../../src/workflows/index.js';

// ── Generic Workflow Simulation ─────────────────────────────────────────

function initGenericWorkflow(session: SessionState, template: WorkflowTemplate): GenericWorkflowState {
  const state: GenericWorkflowState = {
    templateId: template.id,
    currentStep: template.steps[0],
    completedSteps: [],
    gateDecisions: {},
    evaluatorResults: [],
    revisionCount: 0,
    startedAt: new Date().toISOString(),
    lastTransitionAt: new Date().toISOString(),
  };
  session.genericWorkflow = state;
  return state;
}

function advanceGenericStep(
  session: SessionState,
  template: WorkflowTemplate,
  completedStep: string,
  gateDecision?: 'approved' | 'rejected' | 'skipped',
): { advanced?: string; complete?: boolean; rejected?: boolean; error?: string } {
  const state = session.genericWorkflow!;

  if (completedStep !== state.currentStep) {
    return { error: `Cannot complete "${completedStep}" — current is "${state.currentStep}"` };
  }

  const stepDef = template.stepDefinitions[completedStep];
  if (!stepDef) {
    return { error: `Unknown step: ${completedStep}` };
  }

  // Gate check
  if (stepDef.requiresGateApproval || stepDef.requiresEvaluatorGate) {
    if (!gateDecision) {
      return { error: `Step "${completedStep}" requires a gate decision` };
    }
    state.gateDecisions[completedStep] = gateDecision;
    if (gateDecision === 'rejected') {
      return { rejected: true };
    }
  }

  // Advance
  state.completedSteps.push(completedStep);
  const idx = template.steps.indexOf(completedStep);

  if (idx >= template.steps.length - 1) {
    return { complete: true };
  }

  const next = template.steps[idx + 1];
  const nextDef = template.stepDefinitions[next];

  // Check preconditions
  if (nextDef?.preconditions) {
    const unmet = nextDef.preconditions.filter(p => !state.completedSteps.includes(p));
    if (unmet.length > 0) {
      return { error: `Preconditions not met: ${unmet.join(', ')}` };
    }
  }

  state.currentStep = next;
  state.lastTransitionAt = new Date().toISOString();
  return { advanced: next };
}

describe('Adversarial Workflow Integration', () => {
  let session: SessionState;

  beforeEach(() => {
    session = new SessionState('test-adversarial');
  });

  describe('Full Path — Happy Path', () => {
    it('should complete all 5 steps: intake → build → attack → synthesize → delivered', () => {
      const template = workflowRegistry.get('adversarial')!;
      expect(template).toBeDefined();
      initGenericWorkflow(session, template);

      // Step 1: intake
      expect(session.genericWorkflow!.currentStep).toBe('intake');
      const step1 = advanceGenericStep(session, template, 'intake');
      expect(step1.advanced).toBe('build');

      // Step 2: build
      const step2 = advanceGenericStep(session, template, 'build');
      expect(step2.advanced).toBe('attack');

      // Step 3: attack (no gate — adversarial has no evaluator gate)
      const step3 = advanceGenericStep(session, template, 'attack');
      expect(step3.advanced).toBe('synthesize');

      // Step 4: synthesize
      const step4 = advanceGenericStep(session, template, 'synthesize');
      expect(step4.advanced).toBe('delivered');

      // Step 5: delivered
      const step5 = advanceGenericStep(session, template, 'delivered');
      expect(step5.complete).toBe(true);

      // Verify state
      expect(session.genericWorkflow!.completedSteps).toHaveLength(5);
      expect(Object.keys(session.genericWorkflow!.gateDecisions)).toHaveLength(0);
    });
  });

  describe('Quality Check Iterations', () => {
    it('should have no evaluator gate — adversarial uses self-checks only', () => {
      const template = workflowRegistry.get('adversarial')!;
      const hasEvaluatorGate = Object.values(template.stepDefinitions)
        .some(s => s.requiresEvaluatorGate);
      const hasHumanGate = Object.values(template.stepDefinitions)
        .some(s => s.requiresGateApproval);
      expect(hasEvaluatorGate).toBe(false);
      expect(hasHumanGate).toBe(false);
    });

    it('should support self-check iterations on build step', () => {
      const template = workflowRegistry.get('adversarial')!;
      const buildDef = template.stepDefinitions['build'];
      expect(buildDef.maxIterations).toBe(2);
      expect(buildDef.qualityCheckType).toBe('self');
    });

    it('should support self-check iterations on synthesize step', () => {
      const template = workflowRegistry.get('adversarial')!;
      const synthDef = template.stepDefinitions['synthesize'];
      expect(synthDef.maxIterations).toBe(2);
      expect(synthDef.qualityCheckType).toBe('self');
    });

    it('should track evaluator results for quality checks', () => {
      const template = workflowRegistry.get('adversarial')!;
      initGenericWorkflow(session, template);

      // First self-check on build: fail
      session.genericWorkflow!.evaluatorResults.push({
        step: 'build',
        passed: false,
        failureReasons: ['Insufficient citation depth', 'Missing opposing authorities'],
        score: 0.45,
        revisionNumber: 1,
        timestamp: new Date().toISOString(),
      });
      session.genericWorkflow!.revisionCount = 1;

      // Second self-check on build: pass
      session.genericWorkflow!.evaluatorResults.push({
        step: 'build',
        passed: true,
        failureReasons: [],
        score: 0.88,
        revisionNumber: 2,
        timestamp: new Date().toISOString(),
      });

      expect(session.genericWorkflow!.evaluatorResults).toHaveLength(2);
      expect(session.genericWorkflow!.evaluatorResults[0].passed).toBe(false);
      expect(session.genericWorkflow!.evaluatorResults[1].passed).toBe(true);
    });
  });

  describe('Step Preconditions', () => {
    it('should not allow skipping to build without intake', () => {
      const template = workflowRegistry.get('adversarial')!;
      initGenericWorkflow(session, template);

      // Try to advance build directly (not current step)
      const result = advanceGenericStep(session, template, 'build');
      expect(result.error).toBeTruthy();
    });

    it('should enforce build precondition on attack', () => {
      const template = workflowRegistry.get('adversarial')!;
      const attackDef = template.stepDefinitions['attack'];
      expect(attackDef.preconditions).toContain('build');
    });

    it('should enforce attack precondition on synthesize', () => {
      const template = workflowRegistry.get('adversarial')!;
      const synthDef = template.stepDefinitions['synthesize'];
      expect(synthDef.preconditions).toContain('attack');
    });

    it('should enforce synthesize precondition on delivered', () => {
      const template = workflowRegistry.get('adversarial')!;
      const deliveredDef = template.stepDefinitions['delivered'];
      expect(deliveredDef.preconditions).toContain('synthesize');
    });
  });

  describe('Dynamic Permissions', () => {
    it('should deny debate tools during intake phase', async () => {
      const template = workflowRegistry.get('adversarial')!;
      initGenericWorkflow(session, template);

      const canUseTool = createDynamicPermissions(session, template);

      // intake denies post_finding, post_challenge, post_response, resolve_debate
      const result = await canUseTool(
        'mcp__shem__post_finding',
        { agent_role: 'researcher', finding_type: 'legal-issue' },
        { signal: AbortSignal.timeout(5000), toolUseID: 'test-1' },
      );
      expect(result.behavior).toBe('deny');
    });

    it('should deny risk pricing tools during build phase', async () => {
      const template = workflowRegistry.get('adversarial')!;
      initGenericWorkflow(session, template);
      session.genericWorkflow!.currentStep = 'build';

      const canUseTool = createDynamicPermissions(session, template);

      // build denies request_risk_assessment, record_risk_assessment
      const result = await canUseTool(
        'mcp__shem__request_risk_assessment',
        {},
        { signal: AbortSignal.timeout(5000), toolUseID: 'test-2' },
      );
      expect(result.behavior).toBe('deny');
    });

    it('should allow debate tools during attack phase', async () => {
      const template = workflowRegistry.get('adversarial')!;
      initGenericWorkflow(session, template);
      session.genericWorkflow!.currentStep = 'attack';

      const canUseTool = createDynamicPermissions(session, template);

      // attack only denies risk pricing — all debate tools allowed
      const result = await canUseTool(
        'mcp__shem__post_finding',
        { agent_role: 'red-team', finding_type: 'adversarial-vulnerability' },
        { signal: AbortSignal.timeout(5000), toolUseID: 'test-3' },
      );
      expect(result.behavior).toBe('allow');
    });

    it('should deny risk pricing tools during attack phase', async () => {
      const template = workflowRegistry.get('adversarial')!;
      initGenericWorkflow(session, template);
      session.genericWorkflow!.currentStep = 'attack';

      const canUseTool = createDynamicPermissions(session, template);

      // attack denies request_risk_assessment, record_risk_assessment
      const result = await canUseTool(
        'mcp__shem__request_risk_assessment',
        {},
        { signal: AbortSignal.timeout(5000), toolUseID: 'test-4' },
      );
      expect(result.behavior).toBe('deny');
    });

    it('should deny new findings during synthesize phase', async () => {
      const template = workflowRegistry.get('adversarial')!;
      initGenericWorkflow(session, template);
      session.genericWorkflow!.currentStep = 'synthesize';

      const canUseTool = createDynamicPermissions(session, template);

      // synthesize denies post_finding, post_challenge, post_response
      const result = await canUseTool(
        'mcp__shem__post_challenge',
        { challenger_role: 'red-team' },
        { signal: AbortSignal.timeout(5000), toolUseID: 'test-5' },
      );
      expect(result.behavior).toBe('deny');
    });
  });

  describe('MCP Server with Adversarial Template', () => {
    it('should create MCP server for adversarial template', async () => {
      const { createShemMcpServer } = await import('../../src/mcp/server.js');
      const template = workflowRegistry.get('adversarial')!;

      const server = createShemMcpServer(session, template);
      expect(server).toBeDefined();
    });
  });

  describe('Workflow State Tracking', () => {
    it('should track templateId as adversarial', () => {
      const template = workflowRegistry.get('adversarial')!;
      initGenericWorkflow(session, template);

      expect(session.genericWorkflow!.templateId).toBe('adversarial');
    });

    it('should update lastTransitionAt on each advancement', () => {
      const template = workflowRegistry.get('adversarial')!;
      initGenericWorkflow(session, template);

      const beforeTime = session.genericWorkflow!.lastTransitionAt;
      advanceGenericStep(session, template, 'intake');
      const afterTime = session.genericWorkflow!.lastTransitionAt;

      expect(new Date(afterTime).getTime()).toBeGreaterThanOrEqual(new Date(beforeTime).getTime());
    });
  });
});
