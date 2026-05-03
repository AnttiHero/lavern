/**
 * Tabulate Workflow Template — Structured tabular extraction from documents.
 *
 * Pipeline: intake -> specialist_execution -> delivered
 *
 * Different from Counsel/Review/Full-Bench: the deliverable is a SET of
 * tables (CSV / DOCX-with-tables / HTML / JSON), not a memo.
 *
 * Use cases:
 *   - Cap tables from SHAs
 *   - Payment schedules from contracts
 *   - Schedule of fees from engagement letters
 *   - JV participating interests + dilution mechanics
 *   - Lease abstracts (term, rent, options, indemnities)
 *   - Compliance matrices
 *   - Counterparty contact registers
 *
 * No evaluator gate, no debate — single-pass extraction by a Tabulate-aware
 * orchestrator. Speed + structure are the point. If the matter needs
 * adversarial scrutiny on the cells, escalate via Review or Full Bench.
 */

import type { WorkflowTemplate } from '../../types/workflow.js';
import { workflowRegistry } from '../registry.js';
import { orchestratorTabulatePrompt } from '../../agents/prompts/orchestrator-tabulate.js';

export const tabulateTemplate: WorkflowTemplate = {
  id: 'tabulate',
  name: 'Tabulate',
  description: 'Extract structured tables (cap tables, payment schedules, JV interests, lease abstracts, compliance matrices) from one or more documents. Output: CSV, DOCX-with-tables, HTML preview, JSON-with-provenance. Per-cell source citations and confidence ratings.',
  steps: ['intake', 'specialist_execution', 'delivered'],
  stepDefinitions: {
    intake: {
      name: 'intake',
      description: 'Survey documents for tabular structures (schedules, enumerations, clause-driven mechanics worth tabulating).',
      preconditions: [],
    },
    specialist_execution: {
      name: 'specialist_execution',
      description: 'Produce JSON-table output with per-cell provenance and confidence.',
      preconditions: ['intake'],
    },
    delivered: {
      name: 'delivered',
      description: 'Tables delivered. Frontend renders as preview; downloads as CSV / DOCX / HTML / JSON.',
      preconditions: ['specialist_execution'],
    },
  },
  availableTools: [
    'Read', 'Grep', 'Glob', 'TodoWrite',
    // Workflow engine
    'mcp__shem__get_current_step',
    'mcp__shem__advance_step',
    'mcp__shem__get_workflow_history',
    'mcp__shem__submit_handoff',
    'mcp__shem__get_handoffs',
    // Memory (read-only)
    'mcp__shem__query_institutional_memory',
    'mcp__shem__load_matter_memory',
    'mcp__shem__query_precedents',
    // Knowledge base (for column-naming conventions, defined-term decoders)
    'mcp__shem__search_knowledge_base',
    'mcp__shem__list_knowledge_base_collections',
    'mcp__shem__get_knowledge_base_entry',
    // Document reader — primary tool for Tabulate
    'mcp__shem__list_documents',
    'mcp__shem__read_document_section',
    'mcp__shem__search_document',
  ],
  requiredAgents: [
    // Orchestrator-only flow — but the executor requires at least one agent
    // definition to boot the agent SDK. Evaluator is the lightest valid choice.
    'evaluator',
  ],
  maxTeamSize: 4,
  orchestratorArchetype: 'orchestrator-fixer',
  orchestratorPrompt: orchestratorTabulatePrompt,
  phasePermissions: {
    intake: {
      denyTools: [],
      reason: 'Intake: read tools available for surveying tabular structures.',
    },
    specialist_execution: {
      denyTools: [],
      reason: 'Execution: orchestrator produces the JSON-table output.',
    },
    delivered: {
      denyTools: [],
      reason: 'Delivered: output complete.',
    },
  },
};

// Auto-register on import
workflowRegistry.register(tabulateTemplate);
