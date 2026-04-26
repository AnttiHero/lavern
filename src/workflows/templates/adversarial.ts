/**
 * Adversarial Workflow Template — Builder + Attacker + Synthesizer.
 *
 * v11: Renamed from research-memo. Structurally redesigned.
 *
 * Pipeline: intake -> build -> attack -> synthesize -> delivered
 *
 * The red-team actively tries to destroy the builder's work.
 * Output has survived hostile examination.
 * Error mode guarded against: Blind spots, confirmation bias, untested assumptions.
 */

import type { WorkflowTemplate } from '../../types/workflow.js';
import { workflowRegistry } from '../registry.js';
import { orchestratorAdversarialPrompt } from '../../agents/prompts/orchestrator-adversarial.js';

export const adversarialTemplate: WorkflowTemplate = {
  id: 'adversarial',
  name: 'Adversarial',
  description: 'Builder + Attacker + Synthesizer. Stress-tested analysis that has survived hostile examination. For research memos, opinion letters, high-stakes analysis. 5 steps.',
  steps: [
    'intake',
    'build',
    'attack',
    'synthesize',
    'delivered',
  ],
  stepDefinitions: {
    intake: {
      name: 'intake',
      description: 'Accept the analysis request. Identify the core question, jurisdictions, and legal domains. Query memory for existing research and precedents.',
      preconditions: [],
    },
    build: {
      name: 'build',
      description: 'Dispatch the builder (legal-researcher or selected specialist) to produce the strongest possible analysis with thesis, citations, and confidence levels.',
      preconditions: ['intake'],
      maxIterations: 2,
      qualityCheckType: 'self',
    },
    attack: {
      name: 'attack',
      description: 'Dispatch the red-team attacker to stress-test the builder\'s analysis. Find counter-authorities, logical gaps, untested assumptions, edge cases. Max 3 challenge-response exchanges per topic.',
      preconditions: ['build'],
    },
    synthesize: {
      name: 'synthesize',
      description: 'Resolve the adversarial tension. Produce final output that distinguishes between defended positions, accepted vulnerabilities, and open questions.',
      preconditions: ['attack'],
      maxIterations: 2,
      qualityCheckType: 'self',
    },
    delivered: {
      name: 'delivered',
      description: 'Stress-tested analysis delivered with confidence levels informed by adversarial review.',
      preconditions: ['synthesize'],
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
    // Debate board (full — essential for adversarial process)
    'mcp__shem__post_finding',
    'mcp__shem__post_challenge',
    'mcp__shem__post_response',
    'mcp__shem__resolve_debate',
    'mcp__shem__get_findings',
    'mcp__shem__get_challenges',
    'mcp__shem__get_unresolved_debates',
    'mcp__shem__get_debate_summary',
    // Memory system (read + write)
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
    // Risk pricing
    'mcp__shem__request_risk_assessment',
    'mcp__shem__record_risk_assessment',
    // Quality check iteration loops
    'mcp__shem__run_quality_check',
    'mcp__shem__record_quality_result',
  ],
  requiredAgents: [
    'legal-researcher',
    'red-team',
    'synthesis-editor',
    'ethics-reviewer',
  ],
  maxTeamSize: 12,
  orchestratorArchetype: 'orchestrator-professor',
  orchestratorPrompt: orchestratorAdversarialPrompt,
  phasePermissions: {
    intake: {
      denyTools: [
        'mcp__shem__post_finding',
        'mcp__shem__post_challenge',
        'mcp__shem__post_response',
        'mcp__shem__resolve_debate',
        'mcp__shem__request_risk_assessment',
        'mcp__shem__record_risk_assessment',
      ],
      reason: 'Intake phase: gather context and query memory before research.',
    },
    build: {
      denyTools: [
        'mcp__shem__post_challenge',
        'mcp__shem__post_response',
        'mcp__shem__resolve_debate',
        'mcp__shem__request_risk_assessment',
        'mcp__shem__record_risk_assessment',
      ],
      reason: 'Build phase: builder produces findings. No challenges yet.',
    },
    attack: {
      denyTools: [
        'mcp__shem__request_risk_assessment',
        'mcp__shem__record_risk_assessment',
      ],
      reason: 'Attack phase: full debate tools for adversarial exchanges.',
    },
    synthesize: {
      denyTools: [
        'mcp__shem__post_finding',
        'mcp__shem__post_challenge',
        'mcp__shem__post_response',
      ],
      reason: 'Synthesis phase: resolve debates and produce final output.',
    },
    delivered: {
      denyTools: [
        'mcp__shem__post_finding',
        'mcp__shem__post_challenge',
        'mcp__shem__post_response',
        'mcp__shem__resolve_debate',
      ],
      reason: 'Delivered: save precedents and memory only.',
    },
  },
};

// Auto-register on import
workflowRegistry.register(adversarialTemplate);
