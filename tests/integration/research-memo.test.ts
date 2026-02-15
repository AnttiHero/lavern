/**
 * Integration Test — Research Memo Workflow.
 *
 * Tests the research-memo workflow stepping through all 5 stages,
 * evaluator gate integration, red-team review step, and risk assessment.
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

describe('Research Memo Workflow Integration', () => {
  let session: SessionState;

  beforeEach(() => {
    session = new SessionState('test-research-memo');
  });

  describe('Full Path — Happy Path', () => {
    it('should complete all 5 steps: intake → research → evaluator → red_team → delivered', () => {
      const template = workflowRegistry.get('research-memo')!;
      expect(template).toBeDefined();
      initGenericWorkflow(session, template);

      // Step 1: intake
      expect(session.genericWorkflow!.currentStep).toBe('intake');
      const step1 = advanceGenericStep(session, template, 'intake');
      expect(step1.advanced).toBe('research_execution');

      // Step 2: research_execution
      const step2 = advanceGenericStep(session, template, 'research_execution');
      expect(step2.advanced).toBe('evaluator_gate');

      // Step 3: evaluator_gate (requires gate decision)
      const step3NoDecision = advanceGenericStep(session, template, 'evaluator_gate');
      expect(step3NoDecision.error).toContain('requires a gate decision');

      const step3 = advanceGenericStep(session, template, 'evaluator_gate', 'approved');
      expect(step3.advanced).toBe('red_team_review');

      // Step 4: red_team_review
      const step4 = advanceGenericStep(session, template, 'red_team_review');
      expect(step4.advanced).toBe('delivered');

      // Step 5: delivered
      const step5 = advanceGenericStep(session, template, 'delivered');
      expect(step5.complete).toBe(true);

      // Verify state
      expect(session.genericWorkflow!.completedSteps).toHaveLength(5);
      expect(session.genericWorkflow!.gateDecisions['evaluator_gate']).toBe('approved');
    });
  });

  describe('Evaluator Gate Rejection', () => {
    it('should handle evaluator gate rejection (revision loop)', () => {
      const template = workflowRegistry.get('research-memo')!;
      initGenericWorkflow(session, template);

      advanceGenericStep(session, template, 'intake');
      advanceGenericStep(session, template, 'research_execution');

      // Evaluator rejects — stays at evaluator_gate
      const result = advanceGenericStep(session, template, 'evaluator_gate', 'rejected');
      expect(result.rejected).toBe(true);
      expect(session.genericWorkflow!.currentStep).toBe('evaluator_gate');
    });

    it('should track evaluator results across revision loops', () => {
      const template = workflowRegistry.get('research-memo')!;
      initGenericWorkflow(session, template);

      // First evaluation: fail
      session.genericWorkflow!.evaluatorResults.push({
        step: 'evaluator_gate',
        passed: false,
        failureReasons: ['Insufficient citation depth', 'Missing opposing authorities'],
        score: 0.45,
        revisionNumber: 1,
        timestamp: new Date().toISOString(),
      });
      session.genericWorkflow!.revisionCount = 1;

      // Second evaluation: pass
      session.genericWorkflow!.evaluatorResults.push({
        step: 'evaluator_gate',
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

    it('should escalate after max revisions (2)', () => {
      const template = workflowRegistry.get('research-memo')!;
      initGenericWorkflow(session, template);

      // Simulate two failed evaluations
      for (let i = 1; i <= 2; i++) {
        session.genericWorkflow!.evaluatorResults.push({
          step: 'evaluator_gate',
          passed: false,
          failureReasons: [`Research quality failure ${i}`],
          score: 0.40,
          revisionNumber: i,
          timestamp: new Date().toISOString(),
        });
      }
      session.genericWorkflow!.revisionCount = 2;

      const maxRevisions = template.stepDefinitions['evaluator_gate'].maxRevisionLoops ?? 2;
      expect(session.genericWorkflow!.revisionCount).toBeGreaterThanOrEqual(maxRevisions);
    });
  });

  describe('Step Preconditions', () => {
    it('should not allow skipping to research_execution without intake', () => {
      const template = workflowRegistry.get('research-memo')!;
      initGenericWorkflow(session, template);

      // Try to advance research_execution directly (not current step)
      const result = advanceGenericStep(session, template, 'research_execution');
      expect(result.error).toBeTruthy();
    });

    it('should enforce evaluator_gate precondition on red_team_review', () => {
      const template = workflowRegistry.get('research-memo')!;
      const redTeamDef = template.stepDefinitions['red_team_review'];
      expect(redTeamDef.preconditions).toContain('evaluator_gate');
    });

    it('should enforce red_team_review precondition on delivered', () => {
      const template = workflowRegistry.get('research-memo')!;
      const deliveredDef = template.stepDefinitions['delivered'];
      expect(deliveredDef.preconditions).toContain('red_team_review');
    });
  });

  describe('Dynamic Permissions', () => {
    it('should deny evaluator tools during intake phase', async () => {
      const template = workflowRegistry.get('research-memo')!;
      initGenericWorkflow(session, template);

      const canUseTool = createDynamicPermissions(session, template);

      const result = await canUseTool(
        'mcp__shem__run_evaluator_gate',
        {},
        { signal: AbortSignal.timeout(5000), toolUseID: 'test-1' },
      );
      expect(result.behavior).toBe('deny');
    });

    it('should deny risk pricing tools during research execution phase', async () => {
      const template = workflowRegistry.get('research-memo')!;
      initGenericWorkflow(session, template);
      session.genericWorkflow!.currentStep = 'research_execution';

      const canUseTool = createDynamicPermissions(session, template);

      const result = await canUseTool(
        'mcp__shem__request_risk_assessment',
        {},
        { signal: AbortSignal.timeout(5000), toolUseID: 'test-2' },
      );
      expect(result.behavior).toBe('deny');
    });

    it('should allow debate tools during red team review phase', async () => {
      const template = workflowRegistry.get('research-memo')!;
      initGenericWorkflow(session, template);
      session.genericWorkflow!.currentStep = 'red_team_review';

      const canUseTool = createDynamicPermissions(session, template);

      const result = await canUseTool(
        'mcp__shem__post_finding',
        { agent_role: 'red-team', finding_type: 'adversarial-vulnerability' },
        { signal: AbortSignal.timeout(5000), toolUseID: 'test-3' },
      );
      expect(result.behavior).toBe('allow');
    });

    it('should deny evaluator tools during red team review phase', async () => {
      const template = workflowRegistry.get('research-memo')!;
      initGenericWorkflow(session, template);
      session.genericWorkflow!.currentStep = 'red_team_review';

      const canUseTool = createDynamicPermissions(session, template);

      const result = await canUseTool(
        'mcp__shem__run_evaluator_gate',
        {},
        { signal: AbortSignal.timeout(5000), toolUseID: 'test-4' },
      );
      expect(result.behavior).toBe('deny');
    });
  });

  describe('MCP Server with Research Memo Template', () => {
    it('should create MCP server for research-memo template', async () => {
      const { createShemMcpServer } = await import('../../src/mcp/server.js');
      const template = workflowRegistry.get('research-memo')!;

      const server = createShemMcpServer(session, template);
      expect(server).toBeDefined();
    });
  });

  describe('Workflow State Tracking', () => {
    it('should track templateId as research-memo', () => {
      const template = workflowRegistry.get('research-memo')!;
      initGenericWorkflow(session, template);

      expect(session.genericWorkflow!.templateId).toBe('research-memo');
    });

    it('should update lastTransitionAt on each advancement', () => {
      const template = workflowRegistry.get('research-memo')!;
      initGenericWorkflow(session, template);

      const beforeTime = session.genericWorkflow!.lastTransitionAt;
      advanceGenericStep(session, template, 'intake');
      const afterTime = session.genericWorkflow!.lastTransitionAt;

      expect(new Date(afterTime).getTime()).toBeGreaterThanOrEqual(new Date(beforeTime).getTime());
    });
  });
});
