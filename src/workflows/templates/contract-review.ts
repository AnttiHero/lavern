/**
 * Contract Review Workflow Template — 6-step pipeline for
 * risk-scored contract analysis with clause-by-clause review.
 *
 * Pipeline: intake -> contract_analysis -> evaluator_gate ->
 *           plain_language_review -> final_gate -> delivered
 *
 * The contract-reviewer agent does clause-by-clause analysis with
 * risk scoring, deviation flagging, and recommended changes.
 * The evaluator gate runs automatically after analysis.
 * A human final gate ensures human sign-off before delivery.
 */

import type { WorkflowTemplate } from '../../types/workflow.js';
import { workflowRegistry } from '../registry.js';

export const contractReviewTemplate: WorkflowTemplate = {
  id: 'contract-review',
  name: 'Contract Review',
  description: 'Risk-scored contract analysis with clause-by-clause review, deviation flagging, plain language summary, and human final gate. 6 steps.',
  steps: [
    'intake',
    'contract_analysis',
    'evaluator_gate',
    'plain_language_review',
    'final_gate',
    'delivered',
  ],
  stepDefinitions: {
    intake: {
      name: 'intake',
      description: 'Accept contract document, identify contract type, jurisdiction, and parties. Query memory for relevant precedents and standard positions.',
      preconditions: [],
    },
    contract_analysis: {
      name: 'contract_analysis',
      description: 'Dispatch contract-reviewer agent for clause-by-clause analysis. Risk scoring (1-5 per clause), deviation flagging, recommended redlines, negotiation priorities.',
      preconditions: ['intake'],
    },
    evaluator_gate: {
      name: 'evaluator_gate',
      description: 'Automated quality check on the contract analysis. Verifies completeness, accuracy of risk scores, citation validity. Max 2 revision loops.',
      preconditions: ['contract_analysis'],
      requiresEvaluatorGate: true,
      maxRevisionLoops: 2,
    },
    plain_language_review: {
      name: 'plain_language_review',
      description: 'Produce a plain-language executive summary of the contract analysis. Translate legal findings into actionable business language.',
      preconditions: ['evaluator_gate'],
    },
    final_gate: {
      name: 'final_gate',
      description: 'Human approval before delivering the contract review to the client.',
      preconditions: ['plain_language_review'],
      requiresGateApproval: true,
      gateType: 'final_delivery',
    },
    delivered: {
      name: 'delivered',
      description: 'Final contract review delivered to user with risk scores, recommended changes, and plain language summary.',
      preconditions: ['final_gate'],
    },
  },
  availableTools: [
    'Read', 'Grep', 'Glob', 'Task', 'TodoWrite',
    // Workflow engine (generic)
    'mcp__shem__get_current_step',
    'mcp__shem__advance_step',
    'mcp__shem__get_workflow_history',
    // Debate board (for posting contract findings)
    'mcp__shem__post_finding',
    'mcp__shem__get_findings',
    'mcp__shem__get_debate_summary',
    // Memory system
    'mcp__shem__query_institutional_memory',
    'mcp__shem__add_institutional_memory',
    'mcp__shem__load_matter_memory',
    'mcp__shem__save_matter_memory',
    'mcp__shem__query_precedents',
    'mcp__shem__save_precedent',
    'mcp__shem__query_anti_patterns',
    // Approval gate (for final_gate)
    'mcp__shem__request_approval',
    // Evaluator gate
    'mcp__shem__run_evaluator_gate',
    'mcp__shem__record_evaluation_result',
    // Scoring (readability of contract)
    'mcp__shem__calculate_readability_score',
    'mcp__shem__calculate_complexity_tax',
    // Risk pricing
    'mcp__shem__request_risk_assessment',
    'mcp__shem__record_risk_assessment',
  ],
  requiredAgents: [
    'contract-reviewer',
    'plain-language-specialist',
    'evaluator',
    'risk-pricer',
  ],
  orchestratorPrompt: `You are the orchestrator for a contract review workflow.

## Workflow
This is a 6-step pipeline for contract analysis:
1. **INTAKE**: Accept the contract, identify type/jurisdiction/parties. Query memory for standard positions and precedents.
2. **CONTRACT ANALYSIS**: Dispatch contract-reviewer for clause-by-clause analysis with risk scores, deviations, and redlines.
3. **EVALUATOR GATE**: Automated quality check on the analysis (different model). Max 2 revision loops.
4. **PLAIN LANGUAGE REVIEW**: Dispatch plain-language-specialist to translate findings into actionable business language.
5. **FINAL GATE**: Human approval before delivery.
6. **DELIVERED**: Output delivered.

## Rules
- Call \`get_current_step\` to see where you are
- Call \`advance_step\` after completing each step
- Post all contract findings to the debate board using contract-specific finding types: \`contract-risk\`, \`contract-deviation\`, \`contract-standard\`
- Query memory at intake for relevant precedents and standard positions
- The evaluator gate runs automatically after analysis
- MUST invoke approval gate before final delivery
- Save successful review patterns as precedents for future use
- After the evaluator gate passes, request risk assessment from risk-pricer before plain language review

## Output
The final deliverable should include:
- **Executive Summary**: Plain language overview of key risks and recommendations
- **Clause Analysis**: Detailed clause-by-clause breakdown with risk scores
- **Top Concerns**: Ranked list of highest-risk items with recommended redlines
- **Negotiation Priorities**: Ordered list of what to negotiate first
- **Standard Position Comparison**: How this contract deviates from market standard
- **Risk Assessment**: Error probability, potential loss magnitude, insurability
`,
  phasePermissions: {
    intake: {
      denyTools: [
        'mcp__shem__post_finding',
        'mcp__shem__run_evaluator_gate',
        'mcp__shem__record_evaluation_result',
        'mcp__shem__request_approval',
        'mcp__shem__request_risk_assessment',
        'mcp__shem__record_risk_assessment',
      ],
      reason: 'Intake phase: gather context and query memory before analysis.',
    },
    contract_analysis: {
      denyTools: [
        'mcp__shem__run_evaluator_gate',
        'mcp__shem__record_evaluation_result',
        'mcp__shem__request_approval',
        'mcp__shem__request_risk_assessment',
        'mcp__shem__record_risk_assessment',
      ],
      reason: 'Analysis phase: contract-reviewer produces findings.',
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
workflowRegistry.register(contractReviewTemplate);
