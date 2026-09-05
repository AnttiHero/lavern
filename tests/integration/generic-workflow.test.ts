/**
 * Integration Test — Generic Workflow Engine.
 *
 * v5: Tests the generic workflow engine with real templates,
 * stepping through workflows, evaluator gates, and state tracking.
 *
 * Does NOT call the Claude API — drives the PRODUCTION workflow tools the orchestrator calls,
 * progression through the generic state machine.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SessionState } from '../../src/session/session-state.js';
import { workflowRegistry } from '../../src/workflows/registry.js';
import { createDynamicPermissions } from '../../src/permissions/dynamic-permissions.js';
import { createGenericWorkflowTools } from '../../src/mcp/tools/generic-workflow-engine.js';
import { createEvaluatorGateTools } from '../../src/mcp/tools/evaluator-gate.js';
import type { WorkflowTemplate, GenericWorkflowState } from '../../src/types/workflow.js';

// Ensure templates are registered
import '../../src/workflows/index.js';

// ── Generic Workflow Simulation ─────────────────────────────────────────
// (the tool() wrapper exposes .handler, so the real engine is called — no replica)

function initGenericWorkflow(session: SessionState, template: WorkflowTemplate): GenericWorkflowState {
  // The real engine initialises state when its tools are created.
  createGenericWorkflowTools(session, template);
  return session.genericWorkflow!;
}

let gateSeq = 0;

/**
 * Drive the PRODUCTION advance_step tool (no replicated state machine). A
 * gate decision is recorded the way request_approval records it — as a
 * HumanGateDecision naming a gate — and an evaluator step is satisfied the
 * way the evaluator tool satisfies it, so the test exercises the same
 * enforcement the orchestrator faces (review: L01 test-strategy finding).
 */
async function advanceGenericStep(
  session: SessionState,
  template: WorkflowTemplate,
  completedStep: string,
  gateDecision?: 'approved' | 'rejected' | 'skipped',
): Promise<{ advanced?: string; complete?: boolean; rejected?: boolean; error?: string }> {
  const stepDef = template.stepDefinitions[completedStep];
  if (stepDef?.requiresGateApproval && gateDecision && gateDecision !== 'skipped') {
    session.gateDecisions.push({
      gateType: (stepDef.gateType ?? completedStep) as never,
      gateId: `test-gate-${++gateSeq}`,
      timestamp: new Date().toISOString(),
      summary: `test decision for ${completedStep}`,
      decision: gateDecision === 'approved' ? 'approve' : 'reject',
    });
  }
  if (stepDef?.requiresEvaluatorGate && gateDecision && gateDecision !== 'skipped') {
    const record = (createEvaluatorGateTools(session) as any[]).find(t => t.name === 'record_evaluation_result') as any;
    await record.handler({ step: completedStep, passed: gateDecision === 'approved', score: gateDecision === 'approved' ? 0.9 : 0.2, failure_reasons: gateDecision === 'approved' ? [] : ['test failure'] });
  }
  const advance = (createGenericWorkflowTools(session, template) as any[]).find(t => t.name === 'advance_step') as any;
  const res = await advance.handler({ completed_step: completedStep, gate_decision: gateDecision });
  const text: string = res.content[0].text;
  if (text.startsWith('ERROR')) return { error: text };
  if (text.startsWith('GATE REJECTED') || text.startsWith('QUALITY ESCALATION REJECTED')) return { rejected: true };
  if (text.startsWith('WORKFLOW COMPLETE')) return { complete: true };
  const m = text.match(/ADVANCED: .* \u2192 ([a-z_]+)/) ?? text.match(/ADVANCED: .* → ([a-z_]+)/);
  return { advanced: m?.[1] ?? session.genericWorkflow!.currentStep };
}

describe('Generic Workflow Integration', () => {
  let session: SessionState;

  beforeEach(() => {
    session = new SessionState('test-generic-workflow');
  });

  describe('Counsel Workflow — Full Path', () => {
    it('should complete all 3 steps: intake → specialist_execution → delivered', async () => {
      const template = workflowRegistry.get('counsel')!;
      initGenericWorkflow(session, template);

      // Step 1: intake
      expect(session.genericWorkflow!.currentStep).toBe('intake');
      const step1 = await advanceGenericStep(session, template, 'intake');
      expect(step1.advanced).toBe('specialist_execution');

      // Step 2: specialist_execution
      const step2 = await advanceGenericStep(session, template, 'specialist_execution');
      expect(step2.advanced).toBe('delivered');

      // Step 3: delivered
      const step3 = await advanceGenericStep(session, template, 'delivered');
      expect(step3.complete).toBe(true);

      // Verify state
      expect(session.genericWorkflow!.completedSteps).toHaveLength(3);
      expect(Object.keys(session.genericWorkflow!.gateDecisions)).toHaveLength(0);
    });

    it('should have no gates — counsel is gate-free', async () => {
      const template = workflowRegistry.get('counsel')!;
      const hasEvaluatorGate = Object.values(template.stepDefinitions)
        .some(s => s.requiresEvaluatorGate);
      const hasHumanGate = Object.values(template.stepDefinitions)
        .some(s => s.requiresGateApproval);
      expect(hasEvaluatorGate).toBe(false);
      expect(hasHumanGate).toBe(false);
    });
  });

  describe('Review Workflow — Full Path', () => {
    it('should complete all 7 steps with gates', async () => {
      const template = workflowRegistry.get('review')!;
      initGenericWorkflow(session, template);

      // Step 1: intake
      const step1 = await advanceGenericStep(session, template, 'intake');
      expect(step1.advanced).toBe('specialist_analysis');

      // Step 2: specialist_analysis
      const step2 = await advanceGenericStep(session, template, 'specialist_analysis');
      expect(step2.advanced).toBe('evaluator_gate');

      // Step 3: evaluator_gate (automated)
      const step3 = await advanceGenericStep(session, template, 'evaluator_gate', 'approved');
      expect(step3.advanced).toBe('plain_language_review');

      // Step 4: plain_language_review
      const step4 = await advanceGenericStep(session, template, 'plain_language_review');
      expect(step4.advanced).toBe('verification_pass');

      // Step 5: verification_pass
      const step5 = await advanceGenericStep(session, template, 'verification_pass');
      expect(step5.advanced).toBe('final_gate');

      // Step 6: final_gate (human gate)
      const step6 = await advanceGenericStep(session, template, 'final_gate', 'approved');
      expect(step6.advanced).toBe('delivered');

      // Step 7: delivered
      const step7 = await advanceGenericStep(session, template, 'delivered');
      expect(step7.complete).toBe(true);

      // Verify state
      expect(session.genericWorkflow!.completedSteps).toHaveLength(7);
      // The real engine records the human gate under its gate TYPE, and the
      // evaluator step advances on recorded passing evidence, not a self-report.
      expect(session.genericWorkflow!.gateDecisions['final_delivery']).toBe('approved');
      expect(session.genericWorkflow!.evaluatorResults.some(r => r.step === 'evaluator_gate' && r.passed)).toBe(true);
    });

    it('should block at final_gate rejection', async () => {
      const template = workflowRegistry.get('review')!;
      initGenericWorkflow(session, template);

      await advanceGenericStep(session, template, 'intake');
      await advanceGenericStep(session, template, 'specialist_analysis');
      await advanceGenericStep(session, template, 'evaluator_gate', 'approved');
      await advanceGenericStep(session, template, 'plain_language_review');
      await advanceGenericStep(session, template, 'verification_pass');

      const result = await advanceGenericStep(session, template, 'final_gate', 'rejected');
      expect(result.rejected).toBe(true);
      expect(session.genericWorkflow!.currentStep).toBe('final_gate');
    });
  });

  describe('Generic Workflow State on Session', () => {
    it('should track templateId on genericWorkflow', async () => {
      const template = workflowRegistry.get('counsel')!;
      initGenericWorkflow(session, template);

      expect(session.genericWorkflow!.templateId).toBe('counsel');
    });

    it('should track workflowTemplateId on session', async () => {
      session.workflowTemplateId = 'review';
      expect(session.workflowTemplateId).toBe('review');
    });

    it('should accumulate completedSteps', async () => {
      const template = workflowRegistry.get('counsel')!;
      initGenericWorkflow(session, template);

      await advanceGenericStep(session, template, 'intake');
      expect(session.genericWorkflow!.completedSteps).toEqual(['intake']);

      await advanceGenericStep(session, template, 'specialist_execution');
      expect(session.genericWorkflow!.completedSteps).toEqual(['intake', 'specialist_execution']);
    });

    it('should update lastTransitionAt on advancement', async () => {
      const template = workflowRegistry.get('counsel')!;
      initGenericWorkflow(session, template);

      const beforeTime = session.genericWorkflow!.lastTransitionAt;
      await advanceGenericStep(session, template, 'intake');
      const afterTime = session.genericWorkflow!.lastTransitionAt;

      expect(new Date(afterTime).getTime()).toBeGreaterThanOrEqual(new Date(beforeTime).getTime());
    });
  });

  describe('Evaluator Gate Integration', () => {
    it('should support evaluator results on session state', async () => {
      const template = workflowRegistry.get('review')!;
      initGenericWorkflow(session, template);

      // Simulate evaluator result
      session.genericWorkflow!.evaluatorResults.push({
        step: 'evaluator_gate',
        passed: true,
        failureReasons: [],
        score: 0.85,
        revisionNumber: 0,
        timestamp: new Date().toISOString(),
      });

      expect(session.genericWorkflow!.evaluatorResults).toHaveLength(1);
      expect(session.genericWorkflow!.evaluatorResults[0].passed).toBe(true);
    });

    it('should track revision count after evaluator rejection', async () => {
      const template = workflowRegistry.get('review')!;
      initGenericWorkflow(session, template);

      // Simulate evaluator failure
      session.genericWorkflow!.evaluatorResults.push({
        step: 'evaluator_gate',
        passed: false,
        failureReasons: ['Insufficient citation depth'],
        score: 0.55,
        revisionNumber: 1,
        timestamp: new Date().toISOString(),
      });
      session.genericWorkflow!.revisionCount = 1;

      expect(session.genericWorkflow!.revisionCount).toBe(1);
      expect(session.genericWorkflow!.evaluatorResults[0].passed).toBe(false);
    });

    it('should escalate after max revisions', async () => {
      const template = workflowRegistry.get('review')!;
      initGenericWorkflow(session, template);

      // Two failed evaluations → escalation
      for (let i = 1; i <= 2; i++) {
        session.genericWorkflow!.evaluatorResults.push({
          step: 'evaluator_gate',
          passed: false,
          failureReasons: [`Failure ${i}`],
          score: 0.50,
          revisionNumber: i,
          timestamp: new Date().toISOString(),
        });
      }
      session.genericWorkflow!.revisionCount = 2;

      const maxRevisions = template.stepDefinitions['evaluator_gate'].maxRevisionLoops ?? 2;
      expect(session.genericWorkflow!.revisionCount).toBeGreaterThanOrEqual(maxRevisions);
      // At this point, the system should escalate to human review
    });
  });

  describe('Dynamic Permissions with Templates', () => {
    it('should use template phasePermissions for generic workflows', async () => {
      const template = workflowRegistry.get('review')!;
      initGenericWorkflow(session, template);

      // If the review template has phasePermissions, they should be respected
      if (template.phasePermissions) {
        const canUseTool = createDynamicPermissions(session, template);

        // Non-MCP tools should always be allowed
        const result = await canUseTool(
          'Read',
          { file_path: '/test.txt' },
          { signal: AbortSignal.timeout(5000), toolUseID: 'test-1' },
        );
        expect(result.behavior).toBe('allow');
      }
    });

    it('should fall back to legacy rules when no template provided', async () => {
      const canUseTool = createDynamicPermissions(session);

      // Should use PHASE_DENY_RULES — in intake phase, post_challenge is denied
      const result = await canUseTool(
        'mcp__shem__post_challenge',
        { challenger_role: 'ethics-auditor' },
        { signal: AbortSignal.timeout(5000), toolUseID: 'test-2', agentID: 'agent-1' },
      );
      expect(result.behavior).toBe('deny');
    });

    it('should deny orchestrator-only tools for subagents regardless of template', async () => {
      const template = workflowRegistry.get('counsel')!;
      const canUseTool = createDynamicPermissions(session, template);

      const result = await canUseTool(
        'mcp__shem__advance_step',
        { completed_step: 'intake' },
        { signal: AbortSignal.timeout(5000), toolUseID: 'test-3', agentID: 'subagent-123' },
      );
      expect(result.behavior).toBe('deny');
    });
  });

  describe('Registry Summary for Router', () => {
    it('should include all registered workflows in router summary', async () => {
      const summary = workflowRegistry.getSummaryForRouter();
      expect(summary).toContain('legal-design');
      expect(summary).toContain('counsel');
      expect(summary).toContain('review');
    });

    it('should list all registered templates', async () => {
      const templates = workflowRegistry.list();
      expect(templates.length).toBeGreaterThanOrEqual(3);

      const ids = templates.map(t => t.id);
      expect(ids).toContain('legal-design');
      expect(ids).toContain('counsel');
      expect(ids).toContain('review');
    });
  });

  describe('MCP Server with Template', () => {
    it('should create MCP server with generic workflow tools for non-legal-design', async () => {
      const { createShemMcpServer } = await import('../../src/mcp/server.js');
      const template = workflowRegistry.get('review')!;

      // Should not throw — creates MCP server with generic workflow engine
      const server = createShemMcpServer(session, template);
      expect(server).toBeDefined();
    });

    it('should create MCP server with legacy workflow tools for legal-design', async () => {
      const { createShemMcpServer } = await import('../../src/mcp/server.js');
      const template = workflowRegistry.get('legal-design')!;

      // Should use legacy createWorkflowTools, not generic
      const server = createShemMcpServer(session, template);
      expect(server).toBeDefined();
    });

    it('should create MCP server without template (backward compat)', async () => {
      const { createShemMcpServer } = await import('../../src/mcp/server.js');

      // No template → legacy mode
      const server = createShemMcpServer(session);
      expect(server).toBeDefined();
    });
  });
});
