/**
 * Simple Query Workflow Template — Minimal 4-step pipeline for
 * direct legal questions that need a single specialist + evaluator gate.
 *
 * Pipeline: intake -> specialist_execution -> evaluator_gate -> delivered
 *
 * No debate. No human gates (evaluator gate is automatic).
 * The evaluator gate ensures quality before delivery.
 * If the evaluator fails twice, escalate to human.
 */

import type { WorkflowTemplate } from '../../types/workflow.js';
import { workflowRegistry } from '../registry.js';

export const simpleQueryTemplate: WorkflowTemplate = {
  id: 'simple-query',
  name: 'Simple Legal Query',
  description: 'Minimal 4-step pipeline for direct legal questions. Single specialist with automated evaluator gate. No debate rounds or human gates.',
  steps: ['intake', 'specialist_execution', 'evaluator_gate', 'delivered'],
  stepDefinitions: {
    intake: {
      name: 'intake',
      description: 'Accept request, classify complexity, select specialist.',
      preconditions: [],
    },
    specialist_execution: {
      name: 'specialist_execution',
      description: 'Dispatch the selected specialist to produce a deliverable.',
      preconditions: ['intake'],
    },
    evaluator_gate: {
      name: 'evaluator_gate',
      description: 'Automated quality check on the specialist deliverable. Different model from specialist. Max 2 revision loops, then escalate.',
      preconditions: ['specialist_execution'],
      requiresEvaluatorGate: true,
      maxRevisionLoops: 2,
    },
    delivered: {
      name: 'delivered',
      description: 'Quality-checked output delivered to user.',
      preconditions: ['evaluator_gate'],
    },
  },
  availableTools: [
    'Read', 'Grep', 'Glob', 'Task', 'TodoWrite',
    // Workflow engine (generic)
    'mcp__shem__get_current_step',
    'mcp__shem__advance_step',
    'mcp__shem__get_workflow_history',
    // Memory system (read-only for simple queries)
    'mcp__shem__query_institutional_memory',
    'mcp__shem__load_matter_memory',
    'mcp__shem__query_precedents',
    'mcp__shem__query_anti_patterns',
    // Evaluator gate
    'mcp__shem__run_evaluator_gate',
    'mcp__shem__record_evaluation_result',
  ],
  requiredAgents: [
    // Selected dynamically by the router based on request type
    // At minimum, the evaluator is always present
    'evaluator',
  ],
  orchestratorPrompt: `You are the orchestrator for a simple legal query workflow.

## Workflow
This is a minimal 4-step pipeline:
1. **INTAKE**: Accept the request, understand what's being asked
2. **SPECIALIST EXECUTION**: Dispatch the appropriate specialist agent
3. **EVALUATOR GATE**: Run automated quality check (different model from specialist)
4. **DELIVERED**: Return quality-checked output

## Rules
- Call \`get_current_step\` to see where you are
- Call \`advance_step\` after completing each step
- Query institutional memory at intake for relevant lessons
- The evaluator gate runs automatically — if it fails, revise (max 2x), then escalate to human
- Keep responses focused and efficient — this is a simple query, not a full pipeline
`,
  phasePermissions: {
    intake: {
      denyTools: [
        'mcp__shem__run_evaluator_gate',
        'mcp__shem__record_evaluation_result',
      ],
      reason: 'Intake phase: gather context before execution.',
    },
    specialist_execution: {
      denyTools: [
        'mcp__shem__record_evaluation_result',
      ],
      reason: 'Execution phase: specialist produces deliverable.',
    },
    evaluator_gate: {
      denyTools: [],
      reason: 'Evaluator gate: all quality tools available.',
    },
    delivered: {
      denyTools: [
        'mcp__shem__run_evaluator_gate',
      ],
      reason: 'Delivered: output already quality-checked.',
    },
  },
};

// Auto-register on import
workflowRegistry.register(simpleQueryTemplate);
