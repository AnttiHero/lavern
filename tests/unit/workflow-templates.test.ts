/**
 * Unit tests for the Workflow Template Registry.
 *
 * Tests: Registration, retrieval, listing, template contents,
 * legal-design template matches v4 steps, router summary generation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { workflowRegistry } from '../../src/workflows/registry.js';
import { WORKFLOW_STEPS } from '../../src/types/workflow.js';
import type { WorkflowTemplate } from '../../src/types/workflow.js';

// Import templates to trigger auto-registration
import '../../src/workflows/templates/legal-design.js';
import '../../src/workflows/templates/simple-query.js';
import '../../src/workflows/templates/contract-review.js';
import '../../src/workflows/templates/research-memo.js';

describe('Workflow Template Registry', () => {
  describe('Registration and Retrieval', () => {
    it('should have legal-design template registered', () => {
      const template = workflowRegistry.get('legal-design');
      expect(template).toBeDefined();
      expect(template!.name).toBe('Legal Document Redesign');
    });

    it('should have simple-query template registered', () => {
      const template = workflowRegistry.get('simple-query');
      expect(template).toBeDefined();
      expect(template!.name).toBe('Simple Legal Query');
    });

    it('should have contract-review template registered', () => {
      const template = workflowRegistry.get('contract-review');
      expect(template).toBeDefined();
      expect(template!.name).toBe('Contract Review');
    });

    it('should return undefined for unknown template', () => {
      expect(workflowRegistry.get('nonexistent')).toBeUndefined();
    });

    it('should have research-memo template registered', () => {
      const template = workflowRegistry.get('research-memo');
      expect(template).toBeDefined();
      expect(template!.name).toBe('Research Memo');
    });

    it('should list all 4 registered templates', () => {
      const templates = workflowRegistry.list();
      expect(templates.length).toBeGreaterThanOrEqual(4);
      const ids = templates.map(t => t.id);
      expect(ids).toContain('legal-design');
      expect(ids).toContain('simple-query');
      expect(ids).toContain('contract-review');
      expect(ids).toContain('research-memo');
    });
  });

  describe('Legal Design Template', () => {
    it('should have the same steps as WORKFLOW_STEPS', () => {
      const template = workflowRegistry.get('legal-design')!;
      expect(template.steps).toEqual([...WORKFLOW_STEPS]);
    });

    it('should have 11 steps (intake through delivered)', () => {
      const template = workflowRegistry.get('legal-design')!;
      expect(template.steps).toHaveLength(11);
      expect(template.steps[0]).toBe('intake');
      expect(template.steps[template.steps.length - 1]).toBe('delivered');
    });

    it('should have step definitions for every step', () => {
      const template = workflowRegistry.get('legal-design')!;
      for (const step of template.steps) {
        expect(template.stepDefinitions[step]).toBeDefined();
        expect(template.stepDefinitions[step].name).toBe(step);
      }
    });

    it('should have 3 gate steps', () => {
      const template = workflowRegistry.get('legal-design')!;
      const gates = Object.values(template.stepDefinitions).filter(s => s.requiresGateApproval);
      expect(gates).toHaveLength(3);
    });

    it('should have 8 required agents', () => {
      const template = workflowRegistry.get('legal-design')!;
      expect(template.requiredAgents).toHaveLength(8);
      expect(template.requiredAgents).toContain('design-reviewer');
      expect(template.requiredAgents).toContain('ethics-auditor');
      expect(template.requiredAgents).toContain('synthesis-editor');
    });

    it('should have phase permissions for all 11 phases', () => {
      const template = workflowRegistry.get('legal-design')!;
      expect(template.phasePermissions).toBeDefined();
      expect(Object.keys(template.phasePermissions!)).toHaveLength(11);
      for (const step of template.steps) {
        expect(template.phasePermissions![step]).toBeDefined();
        expect(template.phasePermissions![step].denyTools).toBeInstanceOf(Array);
        expect(template.phasePermissions![step].reason).toBeTruthy();
      }
    });

    it('should include all expected tool categories', () => {
      const template = workflowRegistry.get('legal-design')!;
      const tools = template.availableTools;
      // Workflow engine
      expect(tools).toContain('mcp__shem__get_current_step');
      expect(tools).toContain('mcp__shem__advance_step');
      // Debate board
      expect(tools).toContain('mcp__shem__post_finding');
      expect(tools).toContain('mcp__shem__resolve_debate');
      // Scoring
      expect(tools).toContain('mcp__shem__calculate_complexity_tax');
      // Verification
      expect(tools).toContain('mcp__shem__run_self_verification');
      // Memory
      expect(tools).toContain('mcp__shem__query_institutional_memory');
      // Approval
      expect(tools).toContain('mcp__shem__request_approval');
      // Learning (v4)
      expect(tools).toContain('mcp__shem__compile_report_card');
      expect(tools).toContain('mcp__shem__run_feedback_loop');
    });
  });

  describe('Simple Query Template', () => {
    it('should have 4 steps', () => {
      const template = workflowRegistry.get('simple-query')!;
      expect(template.steps).toHaveLength(4);
    });

    it('should follow intake -> specialist -> evaluator -> delivered', () => {
      const template = workflowRegistry.get('simple-query')!;
      expect(template.steps).toEqual([
        'intake',
        'specialist_execution',
        'evaluator_gate',
        'delivered',
      ]);
    });

    it('should have evaluator gate step with evaluator flag', () => {
      const template = workflowRegistry.get('simple-query')!;
      const evalStep = template.stepDefinitions['evaluator_gate'];
      expect(evalStep.requiresEvaluatorGate).toBe(true);
      expect(evalStep.maxRevisionLoops).toBe(2);
    });

    it('should have no human gate steps', () => {
      const template = workflowRegistry.get('simple-query')!;
      const gates = Object.values(template.stepDefinitions).filter(s => s.requiresGateApproval);
      expect(gates).toHaveLength(0);
    });

    it('should require evaluator agent', () => {
      const template = workflowRegistry.get('simple-query')!;
      expect(template.requiredAgents).toContain('evaluator');
    });

    it('should have phase permissions for all 4 phases', () => {
      const template = workflowRegistry.get('simple-query')!;
      expect(template.phasePermissions).toBeDefined();
      expect(Object.keys(template.phasePermissions!)).toHaveLength(4);
    });
  });

  describe('Contract Review Template', () => {
    it('should have 6 steps', () => {
      const template = workflowRegistry.get('contract-review')!;
      expect(template.steps).toHaveLength(6);
    });

    it('should follow the correct step order', () => {
      const template = workflowRegistry.get('contract-review')!;
      expect(template.steps).toEqual([
        'intake',
        'contract_analysis',
        'evaluator_gate',
        'plain_language_review',
        'final_gate',
        'delivered',
      ]);
    });

    it('should have 1 human gate step (final_gate)', () => {
      const template = workflowRegistry.get('contract-review')!;
      const gates = Object.values(template.stepDefinitions).filter(s => s.requiresGateApproval);
      expect(gates).toHaveLength(1);
      expect(gates[0].name).toBe('final_gate');
      expect(gates[0].gateType).toBe('final_delivery');
    });

    it('should have evaluator gate step', () => {
      const template = workflowRegistry.get('contract-review')!;
      const evalStep = template.stepDefinitions['evaluator_gate'];
      expect(evalStep.requiresEvaluatorGate).toBe(true);
    });

    it('should require contract-reviewer, plain-language-specialist, evaluator, and risk-pricer', () => {
      const template = workflowRegistry.get('contract-review')!;
      expect(template.requiredAgents).toContain('contract-reviewer');
      expect(template.requiredAgents).toContain('plain-language-specialist');
      expect(template.requiredAgents).toContain('evaluator');
      expect(template.requiredAgents).toContain('risk-pricer');
    });

    it('should include risk pricing tools', () => {
      const template = workflowRegistry.get('contract-review')!;
      expect(template.availableTools).toContain('mcp__shem__request_risk_assessment');
      expect(template.availableTools).toContain('mcp__shem__record_risk_assessment');
    });

    it('should have phase permissions for all 6 phases', () => {
      const template = workflowRegistry.get('contract-review')!;
      expect(template.phasePermissions).toBeDefined();
      expect(Object.keys(template.phasePermissions!)).toHaveLength(6);
    });

    it('should include debate board tools for posting findings', () => {
      const template = workflowRegistry.get('contract-review')!;
      expect(template.availableTools).toContain('mcp__shem__post_finding');
      expect(template.availableTools).toContain('mcp__shem__get_findings');
    });
  });

  describe('Research Memo Template', () => {
    it('should have 5 steps', () => {
      const template = workflowRegistry.get('research-memo')!;
      expect(template.steps).toHaveLength(5);
    });

    it('should follow the correct step order', () => {
      const template = workflowRegistry.get('research-memo')!;
      expect(template.steps).toEqual([
        'intake',
        'research_execution',
        'evaluator_gate',
        'red_team_review',
        'delivered',
      ]);
    });

    it('should have no human gate steps', () => {
      const template = workflowRegistry.get('research-memo')!;
      const gates = Object.values(template.stepDefinitions).filter(s => s.requiresGateApproval);
      expect(gates).toHaveLength(0);
    });

    it('should have evaluator gate step with evaluator flag', () => {
      const template = workflowRegistry.get('research-memo')!;
      const evalStep = template.stepDefinitions['evaluator_gate'];
      expect(evalStep.requiresEvaluatorGate).toBe(true);
      expect(evalStep.maxRevisionLoops).toBe(2);
    });

    it('should require legal-researcher, evaluator, and red-team', () => {
      const template = workflowRegistry.get('research-memo')!;
      expect(template.requiredAgents).toContain('legal-researcher');
      expect(template.requiredAgents).toContain('evaluator');
      expect(template.requiredAgents).toContain('red-team');
    });

    it('should have phase permissions for all 5 phases', () => {
      const template = workflowRegistry.get('research-memo')!;
      expect(template.phasePermissions).toBeDefined();
      expect(Object.keys(template.phasePermissions!)).toHaveLength(5);
      for (const step of template.steps) {
        expect(template.phasePermissions![step]).toBeDefined();
        expect(template.phasePermissions![step].denyTools).toBeInstanceOf(Array);
        expect(template.phasePermissions![step].reason).toBeTruthy();
      }
    });

    it('should have step definitions for every step', () => {
      const template = workflowRegistry.get('research-memo')!;
      for (const step of template.steps) {
        expect(template.stepDefinitions[step]).toBeDefined();
        expect(template.stepDefinitions[step].name).toBe(step);
      }
    });

    it('should include debate board tools for posting research findings', () => {
      const template = workflowRegistry.get('research-memo')!;
      expect(template.availableTools).toContain('mcp__shem__post_finding');
      expect(template.availableTools).toContain('mcp__shem__get_findings');
    });

    it('should include memory write tools for saving research precedents', () => {
      const template = workflowRegistry.get('research-memo')!;
      expect(template.availableTools).toContain('mcp__shem__save_precedent');
      expect(template.availableTools).toContain('mcp__shem__add_institutional_memory');
    });

    it('should include risk pricing tools', () => {
      const template = workflowRegistry.get('research-memo')!;
      expect(template.availableTools).toContain('mcp__shem__request_risk_assessment');
      expect(template.availableTools).toContain('mcp__shem__record_risk_assessment');
    });

    it('should include evaluator gate tools', () => {
      const template = workflowRegistry.get('research-memo')!;
      expect(template.availableTools).toContain('mcp__shem__run_evaluator_gate');
      expect(template.availableTools).toContain('mcp__shem__record_evaluation_result');
    });

    it('should deny evaluator tools during intake', () => {
      const template = workflowRegistry.get('research-memo')!;
      const intakePerms = template.phasePermissions!['intake'];
      expect(intakePerms.denyTools).toContain('mcp__shem__run_evaluator_gate');
      expect(intakePerms.denyTools).toContain('mcp__shem__record_evaluation_result');
    });

    it('should deny evaluator tools during red team review', () => {
      const template = workflowRegistry.get('research-memo')!;
      const redTeamPerms = template.phasePermissions!['red_team_review'];
      expect(redTeamPerms.denyTools).toContain('mcp__shem__run_evaluator_gate');
      expect(redTeamPerms.denyTools).toContain('mcp__shem__record_evaluation_result');
    });
  });

  describe('Router Summary', () => {
    it('should generate non-empty markdown summary', () => {
      const summary = workflowRegistry.getSummaryForRouter();
      expect(summary).toBeTruthy();
      expect(summary.length).toBeGreaterThan(100);
    });

    it('should include all template IDs in the summary', () => {
      const summary = workflowRegistry.getSummaryForRouter();
      expect(summary).toContain('legal-design');
      expect(summary).toContain('simple-query');
      expect(summary).toContain('contract-review');
      expect(summary).toContain('research-memo');
    });

    it('should include template names', () => {
      const summary = workflowRegistry.getSummaryForRouter();
      expect(summary).toContain('Legal Document Redesign');
      expect(summary).toContain('Simple Legal Query');
      expect(summary).toContain('Contract Review');
      expect(summary).toContain('Research Memo');
    });

    it('should indicate gate steps', () => {
      const summary = workflowRegistry.getSummaryForRouter();
      expect(summary).toContain('[GATE]');
    });

    it('should indicate evaluator gate steps', () => {
      const summary = workflowRegistry.getSummaryForRouter();
      expect(summary).toContain('[EVALUATOR]');
    });
  });

  describe('Custom Template Registration', () => {
    it('should allow registering new templates', () => {
      const customTemplate: WorkflowTemplate = {
        id: 'test-custom',
        name: 'Test Custom',
        description: 'A test template',
        steps: ['step_a', 'step_b'],
        stepDefinitions: {
          step_a: { name: 'step_a', description: 'First step', preconditions: [] },
          step_b: { name: 'step_b', description: 'Second step', preconditions: ['step_a'] },
        },
        availableTools: [],
        requiredAgents: [],
        orchestratorPrompt: 'Test prompt',
      };

      workflowRegistry.register(customTemplate);
      const retrieved = workflowRegistry.get('test-custom');
      expect(retrieved).toBeDefined();
      expect(retrieved!.steps).toHaveLength(2);
    });
  });
});
