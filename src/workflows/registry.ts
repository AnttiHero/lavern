/**
 * Workflow Template Registry — Central store for all workflow templates.
 *
 * v5: Every workflow in The Shem is a template: a named sequence of steps
 * with preconditions, permissions, required agents, and an orchestrator prompt.
 *
 * The registry provides:
 * - Registration and retrieval of templates
 * - A summary view for the Router (which workflow handles which request type)
 */

import type { WorkflowTemplate } from '../types/workflow.js';

class WorkflowRegistry {
  private templates = new Map<string, WorkflowTemplate>();

  /**
   * Register a workflow template. Overwrites if ID already exists.
   */
  register(template: WorkflowTemplate): void {
    this.templates.set(template.id, template);
  }

  /**
   * Get a template by ID.
   */
  get(id: string): WorkflowTemplate | undefined {
    return this.templates.get(id);
  }

  /**
   * List all registered templates.
   */
  list(): WorkflowTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * Produce a markdown summary of all registered workflows.
   * The Router uses this to decide which workflow handles a request.
   */
  getSummaryForRouter(): string {
    const entries = this.list().map(t => {
      const stepList = t.steps.map((s, i) => {
        const def = t.stepDefinitions[s];
        const gate = def?.requiresGateApproval ? ' [GATE]' : '';
        const evaluator = def?.requiresEvaluatorGate ? ' [EVALUATOR]' : '';
        return `  ${i + 1}. ${s}${gate}${evaluator}`;
      }).join('\n');

      return `### ${t.id}: ${t.name}
${t.description}
**Steps** (${t.steps.length}):
${stepList}
**Required Agents**: ${t.requiredAgents.join(', ')}`;
    });

    return `# Available Workflows\n\n${entries.join('\n\n')}`;
  }

  /**
   * Clear all templates (useful for testing).
   */
  clear(): void {
    this.templates.clear();
  }
}

/**
 * Singleton registry — all templates register here on import.
 */
export const workflowRegistry = new WorkflowRegistry();
