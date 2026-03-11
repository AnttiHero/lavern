/**
 * Verification Workflow Template — 10-pass sequential document verification.
 *
 * Standalone product: upload any legal document, get a Verification Report
 * with findings categorized as Critical/Major/Minor and an overall verdict.
 *
 * Pipeline: intake → verification_pipeline → report_compilation → final_gate → delivered
 */

import type { WorkflowTemplate } from '../../types/workflow.js';
import { workflowRegistry } from '../registry.js';
import { orchestratorVerificationPrompt } from '../../agents/prompts/orchestrator-verification.js';

export const verificationTemplate: WorkflowTemplate = {
  id: 'verification',
  name: 'Document Verification',
  description: '10-pass sequential verification of any legal document. Produces a structured Verification Report with findings by severity and an overall verdict (PASS/CONDITIONAL_PASS/FAIL).',
  steps: [
    'intake',
    'verification_pipeline',
    'report_compilation',
    'final_gate',
    'delivered',
  ],
  stepDefinitions: {
    intake: {
      name: 'intake',
      description: 'Accept document, identify type, jurisdiction, audience. Parse document structure.',
      preconditions: [],
    },
    verification_pipeline: {
      name: 'verification_pipeline',
      description: 'Run all 10 verification passes sequentially. Each pass produces scored findings.',
      preconditions: ['intake'],
    },
    report_compilation: {
      name: 'report_compilation',
      description: 'Compile all pass results into the final Verification Report with verdict.',
      preconditions: ['verification_pipeline'],
    },
    final_gate: {
      name: 'final_gate',
      description: 'Human review of the Verification Report before delivery.',
      preconditions: ['report_compilation'],
      requiresGateApproval: true,
      gateType: 'final_delivery',
    },
    delivered: {
      name: 'delivered',
      description: 'Verification Report delivered to user.',
      preconditions: ['final_gate'],
    },
  },
  availableTools: [
    'Read', 'Grep', 'Glob', 'Task', 'TodoWrite',
    // Workflow engine
    'mcp__shem__get_current_step',
    'mcp__shem__advance_step',
    'mcp__shem__get_workflow_history',
    'mcp__shem__submit_handoff',
    'mcp__shem__get_handoffs',
    // Scoring engine (used by passes 2, 3)
    'mcp__shem__calculate_readability_score',
    'mcp__shem__calculate_findability_score',
    'mcp__shem__calculate_complexity_tax',
    'mcp__shem__compare_before_after',
    // Verification engine (used by pass 6)
    'mcp__shem__run_self_verification',
    'mcp__shem__run_cross_verification',
    'mcp__shem__run_score_verification',
    'mcp__shem__get_verification_summary',
    // Evaluator gate (used by pass 5)
    'mcp__shem__run_evaluator_gate',
    'mcp__shem__record_evaluation_result',
    // Risk pricing (used by pass 7)
    'mcp__shem__request_risk_assessment',
    'mcp__shem__record_risk_assessment',
    // Debate board (for posting findings)
    'mcp__shem__post_finding',
    'mcp__shem__get_findings',
    'mcp__shem__get_debate_summary',
    // Memory system
    'mcp__shem__query_institutional_memory',
    'mcp__shem__add_institutional_memory',
    'mcp__shem__query_precedents',
    'mcp__shem__save_precedent',
    // Knowledge Base
    'mcp__shem__search_knowledge_base',
    'mcp__shem__list_knowledge_base_collections',
    'mcp__shem__get_knowledge_base_entry',
    // Approval gate
    'mcp__shem__request_approval',
    // Document tools
    'mcp__shem__list_documents',
    'mcp__shem__read_document_section',
    'mcp__shem__search_document',
    'mcp__shem__get_defined_terms',
    'mcp__shem__get_document_tables',
  ],
  requiredAgents: [
    'design-reviewer',
    'ethics-auditor',
    'evaluator',
    'meaning-guardian',
    'risk-pricer',
  ],
  maxTeamSize: 10,
  orchestratorArchetype: 'orchestrator-professor',
  orchestratorPrompt: orchestratorVerificationPrompt,
  phasePermissions: {
    intake: {
      denyTools: [
        'mcp__shem__post_finding',
        'mcp__shem__run_evaluator_gate',
        'mcp__shem__request_risk_assessment',
        'mcp__shem__request_approval',
      ],
      reason: 'Intake phase: gather context and parse document before verification.',
    },
    verification_pipeline: {
      denyTools: [
        'mcp__shem__request_approval',
        'mcp__shem__save_precedent',
      ],
      reason: 'Verification phase: all verification tools available. No approvals or precedent saves.',
    },
    report_compilation: {
      denyTools: [
        'mcp__shem__run_evaluator_gate',
        'mcp__shem__request_risk_assessment',
        'mcp__shem__request_approval',
      ],
      reason: 'Report compilation: only reading and summary tools allowed.',
    },
    final_gate: {
      denyTools: [
        'mcp__shem__post_finding',
        'mcp__shem__run_evaluator_gate',
      ],
      reason: 'Final gate: only approval decisions and reading allowed.',
    },
    delivered: {
      denyTools: [
        'mcp__shem__post_finding',
        'mcp__shem__run_evaluator_gate',
        'mcp__shem__request_approval',
      ],
      reason: 'Delivered: save precedents and memory only.',
    },
  },
};

// Auto-register on import
workflowRegistry.register(verificationTemplate);
