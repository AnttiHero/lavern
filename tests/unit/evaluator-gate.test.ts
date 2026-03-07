/**
 * Unit tests for the Evaluator Gate.
 *
 * Tests: Tool creation, pass/fail results, revision counting,
 * escalation after max revisions, event emission, agent definition checks.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SessionState } from '../../src/session/session-state.js';
import { createEvaluatorGateTools } from '../../src/mcp/tools/evaluator-gate.js';
import { agentDefinitions } from '../../src/agents/definitions.js';
import { EvaluatorOutputSchema, ContractReviewOutputSchema } from '../../src/types/output-schemas.js';

describe('Evaluator Gate', () => {
  let session: SessionState;

  beforeEach(() => {
    session = new SessionState('test-eval');
    // Initialize generic workflow state for testing
    const now = new Date().toISOString();
    session.genericWorkflow = {
      templateId: 'simple-query',
      currentStep: 'evaluator_gate',
      completedSteps: ['intake', 'specialist_execution'],
      gateDecisions: {},
      evaluatorResults: [],
      revisionCount: 0,
      startedAt: now,
      lastTransitionAt: now,
    };
  });

  describe('Tool Creation', () => {
    it('should return exactly 2 tools', () => {
      const tools = createEvaluatorGateTools(session);
      expect(tools).toHaveLength(2);
    });

    it('should have run_evaluator_gate and record_evaluation_result', () => {
      const tools = createEvaluatorGateTools(session);
      const names = tools.map((t: any) => t.name);
      expect(names).toContain('run_evaluator_gate');
      expect(names).toContain('record_evaluation_result');
    });
  });

  describe('run_evaluator_gate', () => {
    it('should emit evaluator_gate_run event', async () => {
      const tools = createEvaluatorGateTools(session);
      const runGate = tools.find((t: any) => t.name === 'run_evaluator_gate') as any;

      const events: any[] = [];
      session.events.on('evaluator_gate_run', (e: any) => events.push(e));

      await runGate.handler({ specialist_role: 'contract-reviewer', step: 'evaluator_gate' });

      expect(events).toHaveLength(1);
      expect(events[0].specialistRole).toBe('contract-reviewer');
      expect(events[0].step).toBe('evaluator_gate');
    });

    it('should return instructions to dispatch evaluator', async () => {
      const tools = createEvaluatorGateTools(session);
      const runGate = tools.find((t: any) => t.name === 'run_evaluator_gate') as any;

      const result = await runGate.handler({ specialist_role: 'contract-reviewer', step: 'evaluator_gate' });

      expect(result.content[0].text).toContain('EVALUATOR GATE REQUESTED');
      expect(result.content[0].text).toContain('contract-reviewer');
    });
  });

  describe('record_evaluation_result — PASS', () => {
    it('should return PASSED message for passing evaluation', async () => {
      const tools = createEvaluatorGateTools(session);
      const recordResult = tools.find((t: any) => t.name === 'record_evaluation_result') as any;

      const result = await recordResult.handler({
        step: 'evaluator_gate',
        passed: true,
        score: 0.85,
      });

      expect(result.content[0].text).toContain('PASSED');
      expect(result.content[0].text).toContain('0.85');
    });

    it('should record result in session state', async () => {
      const tools = createEvaluatorGateTools(session);
      const recordResult = tools.find((t: any) => t.name === 'record_evaluation_result') as any;

      await recordResult.handler({
        step: 'evaluator_gate',
        passed: true,
        score: 0.90,
      });

      expect(session.genericWorkflow!.evaluatorResults).toHaveLength(1);
      expect(session.genericWorkflow!.evaluatorResults[0].passed).toBe(true);
      expect(session.genericWorkflow!.evaluatorResults[0].score).toBe(0.90);
    });

    it('should emit evaluator_gate_result event', async () => {
      const tools = createEvaluatorGateTools(session);
      const recordResult = tools.find((t: any) => t.name === 'record_evaluation_result') as any;

      const events: any[] = [];
      session.events.on('evaluator_gate_result', (e: any) => events.push(e));

      await recordResult.handler({
        step: 'evaluator_gate',
        passed: true,
        score: 0.85,
      });

      expect(events).toHaveLength(1);
      expect(events[0].passed).toBe(true);
      expect(events[0].score).toBe(0.85);
    });
  });

  describe('record_evaluation_result — FAIL', () => {
    it('should return FAILED message with revision count', async () => {
      const tools = createEvaluatorGateTools(session);
      const recordResult = tools.find((t: any) => t.name === 'record_evaluation_result') as any;

      const result = await recordResult.handler({
        step: 'evaluator_gate',
        passed: false,
        score: 0.45,
        failure_reasons: ['Section 3 cites wrong statute', 'Risk score inconsistent with evidence'],
      });

      expect(result.content[0].text).toContain('FAILED');
      expect(result.content[0].text).toContain('REVISION');
      expect(result.content[0].text).toContain('Section 3 cites wrong statute');
    });

    it('should increment revision count on failure', async () => {
      const tools = createEvaluatorGateTools(session);
      const recordResult = tools.find((t: any) => t.name === 'record_evaluation_result') as any;

      await recordResult.handler({
        step: 'evaluator_gate',
        passed: false,
        score: 0.45,
        failure_reasons: ['Error found'],
      });

      expect(session.genericWorkflow!.revisionCount).toBe(1);
    });

    it('should not increment revision count on pass', async () => {
      const tools = createEvaluatorGateTools(session);
      const recordResult = tools.find((t: any) => t.name === 'record_evaluation_result') as any;

      await recordResult.handler({
        step: 'evaluator_gate',
        passed: true,
        score: 0.85,
      });

      expect(session.genericWorkflow!.revisionCount).toBe(0);
    });
  });

  describe('Escalation after max revisions', () => {
    it('should escalate after 2 failures', async () => {
      const tools = createEvaluatorGateTools(session);
      const recordResult = tools.find((t: any) => t.name === 'record_evaluation_result') as any;

      // First failure
      await recordResult.handler({
        step: 'evaluator_gate',
        passed: false,
        score: 0.40,
        failure_reasons: ['First round issue'],
      });
      expect(session.genericWorkflow!.revisionCount).toBe(1);

      // Second failure — should trigger escalation
      const result = await recordResult.handler({
        step: 'evaluator_gate',
        passed: false,
        score: 0.45,
        failure_reasons: ['Still has issues'],
      });

      expect(session.genericWorkflow!.revisionCount).toBe(2);
      expect(result.content[0].text).toContain('ESCALATION REQUIRED');
      expect(result.content[0].text).toContain('HUMAN REVIEW');
    });
  });

  describe('Agent Definitions', () => {
    it('evaluator agent should exist', () => {
      expect(agentDefinitions['evaluator']).toBeDefined();
    });

    it('evaluator should use a different model than most specialists', () => {
      const evaluatorModel = agentDefinitions['evaluator'].model;
      const designReviewerModel = agentDefinitions['design-reviewer'].model;
      // Evaluator uses opus, most specialists use sonnet
      expect(evaluatorModel).toBe('opus');
      expect(designReviewerModel).toBe('sonnet');
      expect(evaluatorModel).not.toBe(designReviewerModel);
    });

    it('evaluator should have record_evaluation_result in its tools', () => {
      expect(agentDefinitions['evaluator'].tools).toContain('mcp__shem__record_evaluation_result');
    });

    it('evaluator should have maxTurns of 6', () => {
      expect(agentDefinitions['evaluator'].maxTurns).toBe(6);
    });

    it('contract-reviewer agent should exist', () => {
      expect(agentDefinitions['contract-reviewer']).toBeDefined();
    });

    it('contract-reviewer should use opus model', () => {
      expect(agentDefinitions['contract-reviewer'].model).toBe('opus');
    });

    it('contract-reviewer should have debate tools', () => {
      expect(agentDefinitions['contract-reviewer'].tools).toContain('mcp__shem__post_finding');
    });
  });

  describe('Output Schemas', () => {
    it('EvaluatorOutputSchema should validate correct data', () => {
      const validData = {
        agentRole: 'evaluator',
        passed: true,
        overallScore: 0.85,
        dimensions: [
          {
            dimension: 'factual_correctness',
            score: 0.9,
            evidence: ['Verified against source'],
            issues: [],
          },
          {
            dimension: 'actionability',
            score: 0.85,
            evidence: ['Recommendations include specific replacement clause text'],
            issues: [],
          },
        ],
        failureReasons: [],
        revisionSuggestions: [],
        confidence: 0.88,
        summary: 'Deliverable meets quality standards.',
      };

      const result = EvaluatorOutputSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('ContractReviewOutputSchema should validate correct data', () => {
      const validData = {
        agentRole: 'contract-reviewer',
        executiveSummary: 'Standard SaaS agreement with moderate risk.',
        overallRiskScore: 3,
        overallRiskLevel: 'MEDIUM',
        clauseAnalysis: [{
          clauseNumber: 1,
          clauseType: 'Limitation of Liability',
          summary: 'Caps liability at 12 months of fees',
          riskScore: 2,
          standardPosition: 'Market standard',
          deviation: 'None',
          recommendedChange: 'None needed',
          evidence: ['Section 8.1'],
        }],
        topConcerns: [{
          rank: 1,
          clauseNumber: 5,
          concern: 'Unlimited liability for data breaches',
          recommendedRedline: 'Add cap equal to 2x annual fees',
          riskIfUnchanged: 'Potentially uncapped financial exposure',
        }],
        negotiationPriorities: ['Data breach liability cap', 'Termination notice period'],
        findings: [{
          id: 'f-1',
          type: 'contract-risk',
          content: 'Unlimited data breach liability',
          severity: 'RED',
          evidence: ['Section 12.3'],
          confidence: 0.92,
        }],
        confidence: 0.88,
        summary: 'Moderate risk contract with one critical data liability issue.',
      };

      const result = ContractReviewOutputSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });
  });
});
