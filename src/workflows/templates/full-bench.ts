/**
 * Full Bench Workflow Template — Hierarchical multi-workstream pattern.
 *
 * v11: Genuinely new pattern. Nothing like this existed before.
 *
 * Pipeline: intake -> decomposition -> workstream_execution ->
 *           senior_review -> synthesis -> final_gate -> delivered
 *
 * Senior partner decomposes the problem into workstreams.
 * Each workstream is delegated to the appropriate specialist team.
 * Senior partner reviews all outputs for integration gaps.
 * Synthesis team assembles a unified deliverable.
 *
 * Error mode guarded against: Everything — requires senior judgment at both ends.
 */

import type { WorkflowTemplate } from '../../types/workflow.js';
import { workflowRegistry } from '../registry.js';
import { orchestratorFullBenchPrompt } from '../../agents/prompts/orchestrator-full-bench.js';

export const fullBenchTemplate: WorkflowTemplate = {
  id: 'full-bench',
  name: 'Full Bench',
  description: 'Hierarchical multi-workstream pattern. Senior decomposition, delegated workstreams, senior review, unified synthesis. For M&A, major litigation, transformative legal design. 7 steps.',
  steps: [
    'intake',
    'decomposition',
    'workstream_execution',
    'senior_review',
    'synthesis',
    'verification_pass',
    'final_gate',
    'delivered',
  ],
  stepDefinitions: {
    intake: {
      name: 'intake',
      description: 'Accept matter brief, gather comprehensive context. Multi-jurisdictional context, stakeholders, timeline, budget. Extensive memory queries.',
      preconditions: [],
    },
    decomposition: {
      name: 'decomposition',
      description: 'Senior partner analyzes the matter and decomposes it into 2-5 workstreams. Each workstream specifies scope, appropriate pattern, team, dependencies, and priority.',
      preconditions: ['intake'],
      maxIterations: 2,
      qualityCheckType: 'peer',
      qualityCheckerRole: 'supervising-partner',
    },
    workstream_execution: {
      name: 'workstream_execution',
      description: 'Execute each workstream by dispatching appropriate specialist teams. Independent workstreams run in parallel. Dependent workstreams run sequentially.',
      preconditions: ['decomposition'],
    },
    senior_review: {
      name: 'senior_review',
      description: 'Senior partner reviews all workstream outputs holistically. Identifies integration gaps, contradictions, and synthesis opportunities. Evaluator quality-checks overall consistency.',
      preconditions: ['workstream_execution'],
      requiresEvaluatorGate: true,
      maxRevisionLoops: 1,
    },
    synthesis: {
      name: 'synthesis',
      description: 'Assemble all workstream outputs into a unified deliverable. Coherent narrative, cross-cutting themes, comprehensive risk map. Dual artifacts: client-facing + review package.',
      preconditions: ['senior_review'],
      maxIterations: 2,
      qualityCheckType: 'self',
    },
    verification_pass: {
      name: 'verification_pass',
      description: '10-pass verification pipeline on the synthesized deliverable. Context, UX, clarity, structure, accuracy, completeness, risk, formatting, legal design, delivery readiness. Produces Verification Report with severity-categorized findings and verdict.',
      preconditions: ['synthesis'],
    },
    final_gate: {
      name: 'final_gate',
      description: 'Human approval before delivering the full bench analysis.',
      preconditions: ['verification_pass'],
      requiresGateApproval: true,
      gateType: 'final_delivery',
    },
    delivered: {
      name: 'delivered',
      description: 'Comprehensive deliverable delivered. Run learning cycle.',
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
    // Debate board (full — essential for cross-workstream coordination)
    'mcp__shem__post_finding',
    'mcp__shem__post_challenge',
    'mcp__shem__post_response',
    'mcp__shem__resolve_debate',
    'mcp__shem__get_findings',
    'mcp__shem__get_challenges',
    'mcp__shem__get_unresolved_debates',
    'mcp__shem__get_debate_summary',
    // Scoring engine
    'mcp__shem__calculate_complexity_tax',
    'mcp__shem__calculate_readability_score',
    'mcp__shem__calculate_findability_score',
    'mcp__shem__compare_before_after',
    // Verification engine
    'mcp__shem__run_self_verification',
    'mcp__shem__run_cross_verification',
    'mcp__shem__run_score_verification',
    'mcp__shem__get_verification_summary',
    // Memory system (full)
    'mcp__shem__add_institutional_memory',
    'mcp__shem__query_institutional_memory',
    'mcp__shem__save_matter_memory',
    'mcp__shem__load_matter_memory',
    'mcp__shem__save_precedent',
    'mcp__shem__query_precedents',
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
    // Risk pricing
    'mcp__shem__request_risk_assessment',
    'mcp__shem__record_risk_assessment',
    // Report Card & Learning
    'mcp__shem__compile_report_card',
    'mcp__shem__get_report_card',
    'mcp__shem__run_feedback_loop',
    'mcp__shem__update_precedent_effectiveness',
    'mcp__shem__record_anti_pattern',
    // Baselines
    'mcp__shem__update_baselines',
    'mcp__shem__check_against_baseline',
    'mcp__shem__get_baseline',
    'mcp__shem__get_quality_trend',
    // LEGAL.md
    'mcp__shem__compile_legal_md',
    'mcp__shem__get_legal_md',
    // Quality check iteration loops
    'mcp__shem__run_quality_check',
    'mcp__shem__record_quality_result',
  ],
  requiredAgents: [
    'managing-partner',
    'supervising-partner',
    'synthesis-editor',
    'evaluator',
    'risk-pricer',
    'ethics-reviewer',
  ],
  maxTeamSize: 25,
  orchestratorArchetype: 'orchestrator-conductor',
  orchestratorPrompt: orchestratorFullBenchPrompt,
  phasePermissions: {
    intake: {
      denyTools: [
        'mcp__shem__post_finding',
        'mcp__shem__post_challenge',
        'mcp__shem__post_response',
        'mcp__shem__resolve_debate',
        'mcp__shem__run_self_verification',
        'mcp__shem__run_cross_verification',
        'mcp__shem__run_score_verification',
        'mcp__shem__run_evaluator_gate',
        'mcp__shem__record_evaluation_result',
        'mcp__shem__request_approval',
      ],
      reason: 'Intake phase: gather context and query memory extensively.',
    },
    decomposition: {
      denyTools: [
        'mcp__shem__post_challenge',
        'mcp__shem__post_response',
        'mcp__shem__run_self_verification',
        'mcp__shem__run_cross_verification',
        'mcp__shem__run_score_verification',
        'mcp__shem__run_evaluator_gate',
        'mcp__shem__record_evaluation_result',
        'mcp__shem__request_approval',
      ],
      reason: 'Decomposition: senior partner posts workstream findings, no challenges yet.',
    },
    workstream_execution: {
      denyTools: [
        'mcp__shem__run_evaluator_gate',
        'mcp__shem__record_evaluation_result',
        'mcp__shem__request_approval',
      ],
      reason: 'Workstream execution: all debate tools for cross-workstream coordination.',
    },
    senior_review: {
      denyTools: [
        'mcp__shem__request_approval',
      ],
      reason: 'Senior review: full debate + evaluator tools for integration review.',
    },
    synthesis: {
      denyTools: [
        'mcp__shem__post_challenge',
        'mcp__shem__post_response',
        'mcp__shem__run_evaluator_gate',
        'mcp__shem__record_evaluation_result',
        'mcp__shem__run_feedback_loop',
        'mcp__shem__update_baselines',
        'mcp__shem__record_anti_pattern',
      ],
      reason: 'Synthesis phase: assemble artifacts, save precedents, compile report card.',
    },
    verification_pass: {
      denyTools: [
        'mcp__shem__post_finding',
        'mcp__shem__post_challenge',
        'mcp__shem__post_response',
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
        'mcp__shem__post_challenge',
        'mcp__shem__post_response',
        'mcp__shem__resolve_debate',
        'mcp__shem__save_precedent',
        'mcp__shem__run_evaluator_gate',
        'mcp__shem__record_evaluation_result',
      ],
      reason: 'Final gate: only approval decisions and reading allowed.',
    },
    delivered: {
      denyTools: [
        'mcp__shem__post_finding',
        'mcp__shem__post_challenge',
        'mcp__shem__post_response',
        'mcp__shem__resolve_debate',
        'mcp__shem__run_evaluator_gate',
        'mcp__shem__record_evaluation_result',
        'mcp__shem__request_approval',
      ],
      reason: 'Delivered: run learning cycle.',
    },
  },
};

// Auto-register on import
workflowRegistry.register(fullBenchTemplate);
