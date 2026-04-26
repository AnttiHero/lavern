/**
 * Review Workflow Template — Specialist + Evaluator with revision loop.
 *
 * v11: Renamed from contract-review. Generalized framing.
 *
 * Pipeline: intake -> specialist_analysis -> evaluator_gate ->
 *           plain_language_review -> final_gate -> delivered
 *
 * Second pair of eyes on a different model tier decorrelates errors.
 * Error mode guarded against: Factual errors, incompleteness, missed risks.
 */

import type { WorkflowTemplate } from '../../types/workflow.js';
import { workflowRegistry } from '../registry.js';
import { orchestratorReviewPrompt } from '../../agents/prompts/orchestrator-review.js';

export const reviewTemplate: WorkflowTemplate = {
  id: 'review',
  name: 'Review',
  description: 'Specialist + evaluator quality check with revision loop. Second pair of eyes on a different model. For contract reviews, compliance checks, risk assessments. 6 steps.',
  steps: [
    'intake',
    'specialist_analysis',
    'evaluator_gate',
    'plain_language_review',
    'verification_pass',
    'final_gate',
    'delivered',
  ],
  stepDefinitions: {
    intake: {
      name: 'intake',
      description: 'Accept document/request, identify type, jurisdiction, and parties. Query memory for relevant precedents and standard positions.',
      preconditions: [],
    },
    specialist_analysis: {
      name: 'specialist_analysis',
      description: 'Dispatch primary specialist for structured analysis. Risk scoring, deviation flagging, recommended changes.',
      preconditions: ['intake'],
      maxIterations: 2,
      qualityCheckType: 'self',
    },
    evaluator_gate: {
      name: 'evaluator_gate',
      description: 'Automated quality check on the analysis. Different model tier for error decorrelation. Max 2 revision loops.',
      preconditions: ['specialist_analysis'],
      requiresEvaluatorGate: true,
      maxRevisionLoops: 2,
    },
    plain_language_review: {
      name: 'plain_language_review',
      description: 'Translate findings into actionable business language. Executive summary, top concerns, negotiation priorities.',
      preconditions: ['evaluator_gate'],
    },
    verification_pass: {
      name: 'verification_pass',
      description: '10-pass verification pipeline on the deliverable. Context, UX, clarity, structure, accuracy, completeness, risk, formatting, legal design, delivery readiness. Produces Verification Report with severity-categorized findings and verdict.',
      preconditions: ['plain_language_review'],
    },
    final_gate: {
      name: 'final_gate',
      description: 'Human approval before delivery.',
      preconditions: ['verification_pass'],
      requiresGateApproval: true,
      gateType: 'final_delivery',
    },
    delivered: {
      name: 'delivered',
      description: 'Quality-checked analysis delivered with risk scores and plain language summary.',
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
    // Debate board (for posting findings and resolving them)
    'mcp__shem__post_finding',
    'mcp__shem__get_findings',
    'mcp__shem__get_debate_summary',
    'mcp__shem__resolve_debate',
    'mcp__shem__get_unresolved_debates',
    // Memory system
    'mcp__shem__query_institutional_memory',
    'mcp__shem__add_institutional_memory',
    'mcp__shem__load_matter_memory',
    'mcp__shem__save_matter_memory',
    'mcp__shem__query_precedents',
    'mcp__shem__save_precedent',
    // Knowledge Base
    'mcp__shem__search_knowledge_base',
    'mcp__shem__list_knowledge_base_collections',
    'mcp__shem__get_knowledge_base_entry',
    'mcp__shem__query_anti_patterns',
    // Document reader — read uploaded documents directly (was missing pre-0.14.4 — caused orchestrator to claim 'tool failure')
    'mcp__shem__list_documents',
    'mcp__shem__read_document_section',
    'mcp__shem__search_document',
    // Approval gate
    'mcp__shem__request_approval',
    // Evaluator gate
    'mcp__shem__run_evaluator_gate',
    'mcp__shem__record_evaluation_result',
    // Scoring
    'mcp__shem__calculate_readability_score',
    'mcp__shem__calculate_complexity_tax',
    // Risk pricing
    'mcp__shem__request_risk_assessment',
    'mcp__shem__record_risk_assessment',
    // Quality check iteration loops
    'mcp__shem__run_quality_check',
    'mcp__shem__record_quality_result',
  ],
  requiredAgents: [
    'contract-reviewer',
    'plain-language-specialist',
    'evaluator',
    'risk-pricer',
    'ethics-reviewer',
  ],
  maxTeamSize: 14,
  orchestratorArchetype: 'orchestrator-closer',
  orchestratorPrompt: orchestratorReviewPrompt,
  phasePermissions: {
    intake: {
      denyTools: [
        'mcp__shem__post_finding',
        'mcp__shem__resolve_debate',
        'mcp__shem__run_evaluator_gate',
        'mcp__shem__record_evaluation_result',
        'mcp__shem__request_approval',
        'mcp__shem__request_risk_assessment',
        'mcp__shem__record_risk_assessment',
      ],
      reason: 'Intake phase: gather context and query memory before analysis.',
    },
    specialist_analysis: {
      denyTools: [
        'mcp__shem__resolve_debate',
        'mcp__shem__run_evaluator_gate',
        'mcp__shem__record_evaluation_result',
        'mcp__shem__request_approval',
        'mcp__shem__request_risk_assessment',
        'mcp__shem__record_risk_assessment',
      ],
      reason: 'Analysis phase: specialist produces findings. Resolution happens later.',
    },
    evaluator_gate: {
      denyTools: [
        'mcp__shem__request_approval',
      ],
      reason: 'Evaluator gate: automated quality check in progress.',
    },
    plain_language_review: {
      denyTools: [
        'mcp__shem__run_evaluator_gate',
        'mcp__shem__record_evaluation_result',
      ],
      reason: 'Plain language phase: translate findings, no re-evaluation.',
    },
    verification_pass: {
      denyTools: [
        'mcp__shem__resolve_debate',
        'mcp__shem__request_approval',
        'mcp__shem__run_evaluator_gate',
        'mcp__shem__record_evaluation_result',
      ],
      reason: 'Verification phase: 10-pass quality pipeline in progress.',
    },
    final_gate: {
      denyTools: [
        'mcp__shem__post_finding',
        'mcp__shem__run_evaluator_gate',
        'mcp__shem__record_evaluation_result',
      ],
      reason: 'Final gate: only approval decisions and reading allowed.',
    },
    delivered: {
      denyTools: [
        'mcp__shem__post_finding',
        'mcp__shem__run_evaluator_gate',
        'mcp__shem__record_evaluation_result',
        'mcp__shem__request_approval',
      ],
      reason: 'Delivered: save precedents and memory only.',
    },
  },
};

// Auto-register on import
workflowRegistry.register(reviewTemplate);
