import type { WorkflowTemplate } from '../../types/workflow.js';
import { orchestratorDefenseStrategyPrompt } from '../../agents/prompts/orchestrator-defense-strategy.js';
import { workflowRegistry } from '../registry.js';

/**
 * Defense Strategy — multi-document allegation defense for civil litigation
 * and criminal matters.
 *
 * Distinct from defence-disclosure (criminal disclosure review): this
 * workflow is built around opposing records (motion record vs. responding
 * record, claim vs. defence), party attribution (who said what), an
 * allegation register, and an interactive clarification round where the
 * team can pause and ask the client questions via mcp__shem__ask_user —
 * answered in text or by attaching more documents mid-session.
 */
export const defenseStrategyTemplate: WorkflowTemplate = {
  id: 'defense-strategy',
  name: 'Defense Strategy',
  description: 'Defense-support workflow for clients facing allegations in civil litigation (motion records, pleadings, affidavits) or criminal proceedings. Reads the full record, attributes every statement to its speaker, maps each allegation to supporting and contradicting evidence, pauses to ask the client targeted questions when the record cannot answer, and produces a counsel-ready defense-options work product stress-tested by a red team.',
  steps: [
    'intake',
    'document_inventory',
    'party_attribution',
    'allegation_map',
    'clarification_round',
    'defense_theory',
    'red_team_challenge',
    'strategy_synthesis',
    'final_gate',
    'delivered',
  ],
  stepDefinitions: {
    intake: {
      name: 'intake',
      description: 'Confirm the client\'s position (moving/responding party, defendant, accused), forum, status, deadlines, documents, counsel-supervision assumption, and safety boundaries.',
      preconditions: [],
    },
    document_inventory: {
      name: 'document_inventory',
      description: 'Inventory all filings, records, exhibits, disclosure, unreadable items, and missing materials across every document.',
      preconditions: ['intake'],
      qualityCheckType: 'self',
      maxIterations: 2,
    },
    party_attribution: {
      name: 'party_attribution',
      description: 'Build the party map and attribution table: every material statement traced to speaker, document, paragraph, and sworn/unsworn/argument status, with opposing records paired.',
      preconditions: ['document_inventory'],
      qualityCheckType: 'self',
      maxIterations: 2,
    },
    allegation_map: {
      name: 'allegation_map',
      description: 'Complete the allegation register: every allegation against the client with accuser, legal character, supporting evidence, contradicting evidence, and response status.',
      preconditions: ['party_attribution'],
      qualityCheckType: 'peer',
      qualityCheckerRole: 'litigation-partner',
      maxIterations: 2,
    },
    clarification_round: {
      name: 'clarification_round',
      description: 'Consolidate specialist questions into batched ask_user calls. Incorporate the client\'s answers and any newly attached documents, or record explicit [A] assumptions if skipped.',
      preconditions: ['allegation_map'],
    },
    defense_theory: {
      name: 'defense_theory',
      description: 'Build defense options per allegation: record-supported denials, contradictions, missing-proof arguments, procedural issues, and counsel-only decision points.',
      preconditions: ['clarification_round'],
      qualityCheckType: 'peer',
      qualityCheckerRole: 'criminal-defence-counsel',
      maxIterations: 2,
    },
    red_team_challenge: {
      name: 'red_team_challenge',
      description: 'Steel-man the opposing party\'s or Crown\'s best case against each defense option and flag where the record remains adverse.',
      preconditions: ['defense_theory'],
      qualityCheckType: 'peer',
      qualityCheckerRole: 'red-team',
      maxIterations: 1,
    },
    strategy_synthesis: {
      name: 'strategy_synthesis',
      description: 'Produce the counsel-ready defense strategy: allegation-by-allegation defense table, contradiction chart, open assumptions, prioritized counsel questions, and next steps.',
      preconditions: ['red_team_challenge'],
      requiresEvaluatorGate: true,
      maxRevisionLoops: 2,
    },
    final_gate: {
      name: 'final_gate',
      description: 'Human approval before delivery. Counsel must verify legal strategy, deadlines, filings, and advice.',
      preconditions: ['strategy_synthesis'],
      requiresGateApproval: true,
      gateType: 'final_delivery',
    },
    delivered: {
      name: 'delivered',
      description: 'Deliver citation-backed defense-support work product and audit bundle.',
      preconditions: ['final_gate'],
    },
  },
  availableTools: [
    'Read', 'Grep', 'Glob', 'Task', 'TodoWrite',
    'mcp__shem__get_current_step',
    'mcp__shem__advance_step',
    'mcp__shem__get_workflow_history',
    'mcp__shem__submit_handoff',
    'mcp__shem__get_handoffs',
    'mcp__shem__post_finding',
    'mcp__shem__decline_to_find',
    'mcp__shem__post_challenge',
    'mcp__shem__post_response',
    'mcp__shem__get_findings',
    'mcp__shem__get_challenges',
    'mcp__shem__get_debate_summary',
    'mcp__shem__resolve_debate',
    'mcp__shem__get_unresolved_debates',
    'mcp__shem__query_institutional_memory',
    'mcp__shem__add_institutional_memory',
    'mcp__shem__load_matter_memory',
    'mcp__shem__save_matter_memory',
    'mcp__shem__query_precedents',
    'mcp__shem__save_precedent',
    'mcp__shem__search_knowledge_base',
    'mcp__shem__list_knowledge_base_collections',
    'mcp__shem__get_knowledge_base_entry',
    'mcp__shem__list_documents',
    'mcp__shem__read_document_section',
    'mcp__shem__search_document',
    'mcp__shem__request_approval',
    'mcp__shem__ask_user',
    'mcp__shem__run_evaluator_gate',
    'mcp__shem__record_evaluation_result',
    'mcp__shem__run_quality_check',
    'mcp__shem__record_quality_result',
  ],
  requiredAgents: [
    'allegation-mapper',
    'litigation-partner',
    'litigation-associate',
    'criminal-defence-counsel',
    'disclosure-analyst',
    'motion-factum-analyst',
    'forensic-accounting-analyst',
    'legal-researcher',
    'red-team',
    'plain-language-specialist',
    'evaluator',
    'ethics-reviewer',
  ],
  maxTeamSize: 14,
  orchestratorArchetype: 'orchestrator-professor',
  orchestratorPrompt: orchestratorDefenseStrategyPrompt,
  phasePermissions: {
    intake: {
      denyTools: [
        'mcp__shem__post_finding',
        'mcp__shem__resolve_debate',
        'mcp__shem__run_evaluator_gate',
        'mcp__shem__record_evaluation_result',
        'mcp__shem__request_approval',
      ],
      reason: 'Intake phase: establish the client\'s position, scope, and documents before analysis. ask_user is allowed — the client\'s party identity must be confirmed, not assumed.',
    },
    document_inventory: {
      denyTools: ['mcp__shem__resolve_debate', 'mcp__shem__request_approval'],
      reason: 'Inventory phase: gather sources and post cited gaps before resolving debates.',
    },
    defense_theory: {
      denyTools: ['mcp__shem__request_approval'],
      reason: 'Defense theory phase: build options before seeking approval.',
    },
    strategy_synthesis: {
      denyTools: ['mcp__shem__request_approval', 'mcp__shem__ask_user'],
      reason: 'Synthesis phase: clarifications are over — complete the evaluator gate before final human approval.',
    },
    final_gate: {
      denyTools: [
        'mcp__shem__post_finding',
        'mcp__shem__run_evaluator_gate',
        'mcp__shem__record_evaluation_result',
        'mcp__shem__ask_user',
      ],
      reason: 'Final gate: only approval decisions and reading are appropriate.',
    },
    delivered: {
      denyTools: [
        'mcp__shem__post_finding',
        'mcp__shem__request_approval',
        'mcp__shem__run_evaluator_gate',
        'mcp__shem__record_evaluation_result',
        'mcp__shem__ask_user',
      ],
      reason: 'Delivered: no new analysis after handoff.',
    },
  },
};

workflowRegistry.register(defenseStrategyTemplate);
