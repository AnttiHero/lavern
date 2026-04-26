/**
 * Roundtable Workflow Template — Parallel expert panel + debate + synthesis.
 *
 * v11: Renamed from legal-design. Simplified from 10 steps to 7.
 *
 * Pipeline: intake -> parallel_analysis -> debate -> gate ->
 *           synthesis -> final_gate -> delivered
 *
 * Multiple experts analyze simultaneously. Their disagreements become
 * debate topics. The debate protocol resolves conflicts. This is where
 * the 70 agents shine — mix perspectives that no single expert could produce.
 *
 * Error mode guarded against: Tunnel vision, domain blindness, single-perspective thinking.
 */

import type { WorkflowTemplate } from '../../types/workflow.js';
import { workflowRegistry } from '../registry.js';
import { orchestratorRoundtablePrompt } from '../../agents/prompts/orchestrator-roundtable.js';

export const roundtableTemplate: WorkflowTemplate = {
  id: 'roundtable',
  name: 'Roundtable',
  description: 'Parallel expert panel, structured debate, synthesis. Multidisciplinary perspectives collide and resolve into work no single expert could produce. 7 steps.',
  steps: [
    'intake',
    'parallel_analysis',
    'debate',
    'gate',
    'synthesis',
    'final_gate',
    'delivered',
  ],
  stepDefinitions: {
    intake: {
      name: 'intake',
      description: 'Accept document/request and gather context (moment, audience, jurisdiction). Query institutional memory, matter memory, anti-patterns, and baselines.',
      preconditions: [],
    },
    parallel_analysis: {
      name: 'parallel_analysis',
      description: 'Dispatch ALL available analysis agents simultaneously. Each posts findings to the debate board independently. Multidisciplinary analysis produces richer insights.',
      preconditions: ['intake'],
    },
    debate: {
      name: 'debate',
      description: 'Identify conflicts between agents\' findings. Run challenge/response exchanges (max 3 per topic). Formally resolve all debates. Run verification if transformation occurred.',
      preconditions: ['parallel_analysis'],
    },
    gate: {
      name: 'gate',
      description: 'Human approval gate if RED-severity findings exist or confidence < 0.70. Confidence-based routing: >0.90 auto-proceed, 0.70-0.90 quick review, <0.70 full review.',
      preconditions: ['debate'],
      requiresGateApproval: true,
      gateType: 'ethics_critical',
    },
    synthesis: {
      name: 'synthesis',
      description: 'Assemble final dual-artifact output: user-facing deliverable + legal review package. Save precedents and institutional memory.',
      preconditions: ['gate'],
      maxIterations: 2,
      qualityCheckType: 'peer',
      qualityCheckerRole: 'client-proxy',
    },
    final_gate: {
      name: 'final_gate',
      description: 'Human approval before delivering final output.',
      preconditions: ['synthesis'],
      requiresGateApproval: true,
      gateType: 'final_delivery',
    },
    delivered: {
      name: 'delivered',
      description: 'Final output delivered. Run learning cycle (report card, feedback loop, baselines).',
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
    // Debate board (full)
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
    // Memory system
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
    // Session Replay Testing
    'mcp__shem__run_regression_test',
    'mcp__shem__run_batch_regression',
    'mcp__shem__compare_sessions',
    // Quality check iteration loops
    'mcp__shem__run_quality_check',
    'mcp__shem__record_quality_result',
  ],
  requiredAgents: [
    'design-reviewer',
    'ethics-auditor',
    'service-designer',
    'plain-language-specialist',
    'client-proxy',
    'synthesis-editor',
    'ethics-reviewer',
  ],
  maxTeamSize: 14,
  orchestratorArchetype: 'orchestrator-conductor',
  orchestratorPrompt: orchestratorRoundtablePrompt,
  phasePermissions: {
    intake: {
      denyTools: [
        'mcp__shem__post_challenge',
        'mcp__shem__post_response',
        'mcp__shem__resolve_debate',
        'mcp__shem__run_self_verification',
        'mcp__shem__run_cross_verification',
        'mcp__shem__run_score_verification',
      ],
      reason: 'Intake phase: only reading, memory queries, and context gathering allowed.',
    },
    parallel_analysis: {
      denyTools: [
        'mcp__shem__post_challenge',
        'mcp__shem__post_response',
        'mcp__shem__resolve_debate',
        'mcp__shem__run_self_verification',
        'mcp__shem__run_cross_verification',
        'mcp__shem__run_score_verification',
      ],
      reason: 'Analysis phase: agents post findings but do not challenge or resolve.',
    },
    debate: {
      denyTools: [
        'mcp__shem__save_precedent',
      ],
      reason: 'Debate phase: challenges, responses, resolutions, and verification allowed.',
    },
    gate: {
      denyTools: [
        'mcp__shem__post_finding',
        'mcp__shem__post_challenge',
        'mcp__shem__run_self_verification',
        'mcp__shem__run_cross_verification',
        'mcp__shem__run_score_verification',
      ],
      reason: 'Gate: only approval decisions and reading allowed.',
    },
    synthesis: {
      denyTools: [
        'mcp__shem__post_finding',
        'mcp__shem__post_challenge',
        'mcp__shem__post_response',
        'mcp__shem__resolve_debate',
        'mcp__shem__run_self_verification',
        'mcp__shem__run_cross_verification',
        'mcp__shem__run_score_verification',
        'mcp__shem__run_feedback_loop',
        'mcp__shem__update_baselines',
        'mcp__shem__record_anti_pattern',
      ],
      reason: 'Synthesis phase: assemble artifacts, save precedents, compile report card.',
    },
    final_gate: {
      denyTools: [
        'mcp__shem__post_finding',
        'mcp__shem__post_challenge',
        'mcp__shem__post_response',
        'mcp__shem__resolve_debate',
        'mcp__shem__save_precedent',
      ],
      reason: 'Final gate: only approval decisions and reading allowed.',
    },
    delivered: {
      denyTools: [
        'mcp__shem__post_finding',
        'mcp__shem__post_challenge',
        'mcp__shem__post_response',
        'mcp__shem__resolve_debate',
      ],
      reason: 'Delivered: run learning cycle (report card, feedback loop, baselines, LEGAL.md).',
    },
  },
};

// Auto-register on import
workflowRegistry.register(roundtableTemplate);
