/**
 * Counsel Workflow Template — Solo expert, direct answer.
 *
 * v11: Renamed from simple-query. Structurally simplified.
 *
 * Pipeline: intake -> specialist_execution -> delivered
 *
 * No evaluator gate. No debate. No human gates.
 * Speed is the feature — trust the expert and deliver.
 * Error mode: None guarded against — if you need checking, use Review.
 */

import type { WorkflowTemplate } from '../../types/workflow.js';
import { workflowRegistry } from '../registry.js';
import { orchestratorCounselPrompt } from '../../agents/prompts/orchestrator-counsel.js';

export const counselTemplate: WorkflowTemplate = {
  id: 'counsel',
  name: 'Counsel',
  description: 'Solo expert, direct answer. No evaluator gate or debate. Sub-30-second response for simple legal questions, definitions, and quick lookups.',
  steps: ['intake', 'specialist_execution', 'delivered'],
  stepDefinitions: {
    intake: {
      name: 'intake',
      description: 'Accept request, identify the right specialist.',
      preconditions: [],
    },
    specialist_execution: {
      name: 'specialist_execution',
      description: 'Dispatch one specialist to produce a direct answer.',
      preconditions: ['intake'],
    },
    delivered: {
      name: 'delivered',
      description: 'Expert answer delivered to user.',
      preconditions: ['specialist_execution'],
    },
  },
  availableTools: [
    'Read', 'Grep', 'Glob', 'Task', 'TodoWrite',
    // Workflow engine
    'mcp__shem__get_current_step',
    'mcp__shem__advance_step',
    'mcp__shem__get_workflow_history',
    // Memory system (read-only — fast lookups)
    'mcp__shem__query_institutional_memory',
    'mcp__shem__load_matter_memory',
    'mcp__shem__query_precedents',
    // Knowledge Base
    'mcp__shem__search_knowledge_base',
    'mcp__shem__list_knowledge_base_collections',
    'mcp__shem__get_knowledge_base_entry',
    'mcp__shem__query_anti_patterns',
  ],
  requiredAgents: [
    // Selected dynamically by the router based on request type.
    // Counsel has no fixed agents — the right expert for the question.
  ],
  maxTeamSize: 2,
  orchestratorArchetype: 'orchestrator-fixer',
  orchestratorPrompt: orchestratorCounselPrompt,
  phasePermissions: {
    intake: {
      denyTools: [],
      reason: 'Intake: all read tools available.',
    },
    specialist_execution: {
      denyTools: [],
      reason: 'Execution: specialist produces the answer.',
    },
    delivered: {
      denyTools: [],
      reason: 'Delivered: output complete.',
    },
  },
};

// Auto-register on import
workflowRegistry.register(counselTemplate);
// Backward compatibility alias
workflowRegistry.register({ ...counselTemplate, id: 'simple-query' });
