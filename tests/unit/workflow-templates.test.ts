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
import '../../src/workflows/templates/counsel.js';
import '../../src/workflows/templates/review.js';
import '../../src/workflows/templates/adversarial.js';

describe('Workflow Template Registry', () => {
  describe('Registration and Retrieval', () => {
    it('should have legal-design template registered', () => {
      const template = workflowRegistry.get('legal-design');
      expect(template).toBeDefined();
      expect(template!.name).toBe('Legal Document Redesign');
    });

    it('should have counsel template registered', () => {
      const template = workflowRegistry.get('counsel');
      expect(template).toBeDefined();
    });

    it('should have review template registered', () => {
      const template = workflowRegistry.get('review');
      expect(template).toBeDefined();
    });

    it('should return undefined for unknown template', () => {
      expect(workflowRegistry.get('nonexistent')).toBeUndefined();
    });

    it('should have adversarial template registered', () => {
      const template = workflowRegistry.get('adversarial');
      expect(template).toBeDefined();
    });

    it('should list all registered templates', () => {
      const templates = workflowRegistry.list();
      const ids = templates.map(t => t.id);
      expect(ids).toContain('legal-design');
      expect(ids).toContain('counsel');
      expect(ids).toContain('review');
      expect(ids).toContain('adversarial');
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

    it('should have 9 required agents (including ethics-reviewer)', () => {
      const template = workflowRegistry.get('legal-design')!;
      expect(template.requiredAgents).toHaveLength(9);
      expect(template.requiredAgents).toContain('design-reviewer');
      expect(template.requiredAgents).toContain('ethics-auditor');
      expect(template.requiredAgents).toContain('synthesis-editor');
      expect(template.requiredAgents).toContain('ethics-reviewer');
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


  describe('Router Summary', () => {
    it('should generate non-empty markdown summary', () => {
      const summary = workflowRegistry.getSummaryForRouter();
      expect(summary).toBeTruthy();
      expect(summary.length).toBeGreaterThan(100);
    });

    it('should include all template IDs in the summary', () => {
      const summary = workflowRegistry.getSummaryForRouter();
      expect(summary).toContain('legal-design');
      expect(summary).toContain('counsel');
      expect(summary).toContain('review');
      expect(summary).toContain('adversarial');
    });

    it('should include template names', () => {
      const summary = workflowRegistry.getSummaryForRouter();
      expect(summary).toContain('Legal Document Redesign');
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
