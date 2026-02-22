/**
 * Research Memo Workflow Template — 5-step pipeline for
 * structured legal research with citations and adversarial review.
 *
 * Pipeline: intake -> research_execution -> evaluator_gate ->
 *           red_team_review -> delivered
 *
 * The legal-researcher agent produces a structured research memo
 * with citations, confidence levels, and conflicting authorities.
 * The evaluator gate checks citation validity and completeness.
 * The red-team agent stress-tests the research for gaps and
 * unconsidered counterarguments.
 */

import type { WorkflowTemplate } from '../../types/workflow.js';
import { workflowRegistry } from '../registry.js';

export const researchMemoTemplate: WorkflowTemplate = {
  id: 'research-memo',
  name: 'Research Memo',
  description: 'Structured legal research with citations, confidence levels, adversarial review, and risk pricing. 5 steps.',
  steps: [
    'intake',
    'research_execution',
    'evaluator_gate',
    'red_team_review',
    'delivered',
  ],
  stepDefinitions: {
    intake: {
      name: 'intake',
      description: 'Accept research question, identify jurisdictions and legal domains. Query institutional memory and precedents for existing research on this topic.',
      preconditions: [],
    },
    research_execution: {
      name: 'research_execution',
      description: 'Dispatch legal-researcher agent. Produces structured research memo with thesis, citations, confidence levels, supporting and opposing authorities, and practical implications.',
      preconditions: ['intake'],
    },
    evaluator_gate: {
      name: 'evaluator_gate',
      description: 'Automated quality check on the research memo. Verifies citation validity, completeness of analysis, intellectual honesty about uncertainty. Max 2 revision loops.',
      preconditions: ['research_execution'],
      requiresEvaluatorGate: true,
      maxRevisionLoops: 2,
    },
    red_team_review: {
      name: 'red_team_review',
      description: 'Dispatch red-team agent to stress-test the research. Finds gaps in authority analysis, unconsidered counterarguments, jurisdictional blind spots, and ambiguities in the thesis.',
      preconditions: ['evaluator_gate'],
    },
    delivered: {
      name: 'delivered',
      description: 'Quality-checked research memo delivered with citations, confidence assessment, and adversarial review notes.',
      preconditions: ['red_team_review'],
    },
  },
  availableTools: [
    'Read', 'Grep', 'Glob', 'Task', 'TodoWrite',
    // Workflow engine
    'mcp__shem__get_current_step',
    'mcp__shem__advance_step',
    'mcp__shem__get_workflow_history',
    // Debate board (for posting research findings)
    'mcp__shem__post_finding',
    'mcp__shem__get_findings',
    'mcp__shem__get_debate_summary',
    // Memory system (read + write — research findings are precedents)
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
    // Evaluator gate
    'mcp__shem__run_evaluator_gate',
    'mcp__shem__record_evaluation_result',
    // Risk pricing
    'mcp__shem__request_risk_assessment',
    'mcp__shem__record_risk_assessment',
  ],
  requiredAgents: [
    'legal-researcher',
    'evaluator',
    'red-team',
  ],
  orchestratorPrompt: `You are the orchestrator for a legal research memo workflow.

## Workflow
This is a 5-step pipeline for structured legal research:
1. **INTAKE**: Accept the research question, identify jurisdictions and legal domains. Query memory for existing research on this topic and relevant precedents.
2. **RESEARCH EXECUTION**: Dispatch legal-researcher agent. Produces structured research memo with thesis, citations, confidence levels, supporting and opposing authorities.
3. **EVALUATOR GATE**: Automated quality check on the research memo (different model). Citation validity is critical. Max 2 revision loops.
4. **RED TEAM REVIEW**: Dispatch red-team agent to stress-test the research. Finds gaps, unconsidered counterarguments, jurisdictional blind spots.
5. **DELIVERED**: Quality-checked research memo delivered.

## Rules
- Call \`get_current_step\` to see where you are
- Call \`advance_step\` after completing each step
- Post research findings to the debate board using research-specific finding types: \`research-citation\`, \`research-conflict\`, \`research-gap\`
- Query institutional memory and precedents at intake for existing research
- The evaluator gate runs automatically after research execution
- Red team review is adversarial — let them challenge the research honestly
- Save significant findings as precedents for future queries
- Request risk assessment after evaluator gate passes

## Output
The final deliverable should include:
- **Research Question**: Precisely framed question
- **Thesis**: Clear bottom-line answer with confidence level
- **Supporting Authorities**: Key citations backing the thesis
- **Opposing Authorities**: Counter-arguments and their basis
- **Unresolved Questions**: What remains genuinely uncertain
- **Practical Implications**: Actionable advice for the client
- **Red Team Notes**: Vulnerabilities and gaps identified by adversarial review
- **Risk Assessment**: Error probability and confidence metrics
`,
  phasePermissions: {
    intake: {
      denyTools: [
        'mcp__shem__post_finding',
        'mcp__shem__run_evaluator_gate',
        'mcp__shem__record_evaluation_result',
        'mcp__shem__request_risk_assessment',
        'mcp__shem__record_risk_assessment',
      ],
      reason: 'Intake phase: gather context and query memory before research.',
    },
    research_execution: {
      denyTools: [
        'mcp__shem__run_evaluator_gate',
        'mcp__shem__record_evaluation_result',
        'mcp__shem__request_risk_assessment',
        'mcp__shem__record_risk_assessment',
      ],
      reason: 'Research phase: legal-researcher produces findings and citations.',
    },
    evaluator_gate: {
      denyTools: [
        'mcp__shem__request_risk_assessment',
        'mcp__shem__record_risk_assessment',
      ],
      reason: 'Evaluator gate: automated quality check in progress.',
    },
    red_team_review: {
      denyTools: [
        'mcp__shem__run_evaluator_gate',
        'mcp__shem__record_evaluation_result',
      ],
      reason: 'Red team review: adversarial testing, no re-evaluation.',
    },
    delivered: {
      denyTools: [
        'mcp__shem__post_finding',
        'mcp__shem__run_evaluator_gate',
        'mcp__shem__record_evaluation_result',
      ],
      reason: 'Delivered: save precedents and memory only.',
    },
  },
};

// Auto-register on import
workflowRegistry.register(researchMemoTemplate);
