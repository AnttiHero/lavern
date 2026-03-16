/**
 * Unit Tests — Workflow Registry (src/workflows/registry.ts)
 *
 * Tests registration, retrieval, listing, and summary generation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { workflowRegistry } from '../../src/workflows/registry.js';
import type { WorkflowTemplate } from '../../src/types/workflow.js';

function makeTemplate(id: string, overrides: Partial<WorkflowTemplate> = {}): WorkflowTemplate {
  return {
    id,
    name: `Test ${id}`,
    description: `Description for ${id}`,
    steps: ['intake', 'synthesis'],
    stepDefinitions: {
      intake: { description: 'Intake step' },
      synthesis: { description: 'Synthesis step' },
    },
    requiredAgents: ['evaluator'],
    orchestratorPrompt: 'Test prompt',
    ...overrides,
  } as WorkflowTemplate;
}

describe('WorkflowRegistry', () => {
  beforeEach(() => {
    // Clear registry before each test (but it will contain real templates from imports)
    workflowRegistry.clear();
  });

  it('registers and retrieves a template', () => {
    const t = makeTemplate('test-wf');
    workflowRegistry.register(t);
    expect(workflowRegistry.get('test-wf')).toBe(t);
  });

  it('returns undefined for unknown ID', () => {
    expect(workflowRegistry.get('nonexistent')).toBeUndefined();
  });

  it('overwrites existing template with same ID', () => {
    workflowRegistry.register(makeTemplate('test-wf', { name: 'V1' }));
    workflowRegistry.register(makeTemplate('test-wf', { name: 'V2' }));
    expect(workflowRegistry.get('test-wf')!.name).toBe('V2');
  });

  it('lists all registered templates', () => {
    workflowRegistry.register(makeTemplate('a'));
    workflowRegistry.register(makeTemplate('b'));
    workflowRegistry.register(makeTemplate('c'));
    const list = workflowRegistry.list();
    expect(list).toHaveLength(3);
    expect(list.map(t => t.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('clear removes all templates', () => {
    workflowRegistry.register(makeTemplate('a'));
    workflowRegistry.register(makeTemplate('b'));
    workflowRegistry.clear();
    expect(workflowRegistry.list()).toHaveLength(0);
  });

  describe('getSummaryForRouter', () => {
    it('produces markdown summary', () => {
      workflowRegistry.register(makeTemplate('counsel', {
        name: 'Counsel',
        description: 'Quick legal Q&A',
        steps: ['intake', 'synthesis'],
        stepDefinitions: {
          intake: { description: 'Read' },
          synthesis: { description: 'Respond' },
        },
        requiredAgents: ['evaluator', 'contract-reviewer'],
      }));

      const summary = workflowRegistry.getSummaryForRouter();
      expect(summary).toContain('# Available Workflows');
      expect(summary).toContain('### counsel: Counsel');
      expect(summary).toContain('Quick legal Q&A');
      expect(summary).toContain('evaluator, contract-reviewer');
      expect(summary).toContain('1. intake');
      expect(summary).toContain('2. synthesis');
    });

    it('marks gate steps with [GATE]', () => {
      workflowRegistry.register(makeTemplate('gated', {
        steps: ['intake', 'ethics_gate'],
        stepDefinitions: {
          intake: { description: 'Read' },
          ethics_gate: { description: 'Ethics', requiresGateApproval: true },
        },
      }));

      const summary = workflowRegistry.getSummaryForRouter();
      expect(summary).toContain('[GATE]');
    });

    it('marks evaluator steps with [EVALUATOR]', () => {
      workflowRegistry.register(makeTemplate('eval', {
        steps: ['analysis'],
        stepDefinitions: {
          analysis: { description: 'Analyze', requiresEvaluatorGate: true },
        },
      }));

      const summary = workflowRegistry.getSummaryForRouter();
      expect(summary).toContain('[EVALUATOR]');
    });

    it('returns empty summary for empty registry', () => {
      const summary = workflowRegistry.getSummaryForRouter();
      expect(summary).toContain('# Available Workflows');
      // No workflow entries
      expect(summary).not.toContain('###');
    });
  });
});
