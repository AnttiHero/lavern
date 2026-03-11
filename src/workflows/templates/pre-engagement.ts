/**
 * Pre-Engagement Workflow Template — Client onboarding before substantive work.
 *
 * v8: Matches real law firm intake process:
 * 1. Conflict check
 * 2. KYC screening
 * 3. Engagement letter generation
 * 4. Client review gate (human gate — client accepts terms)
 * 5. Team staffing (human gate — client selects team)
 * 6. Matter opening
 * 7. Engaged (ready for substantive work)
 *
 * This workflow runs BEFORE the substantive workflow.
 * POST /api/matters triggers this workflow.
 * POST /api/sessions with matterId then triggers the substantive workflow.
 */

import type { WorkflowTemplate } from '../../types/workflow.js';
import { workflowRegistry } from '../registry.js';

export const preEngagementTemplate: WorkflowTemplate = {
  id: 'pre-engagement',
  name: 'Pre-Engagement',
  description: 'Client onboarding workflow: conflict check, KYC, engagement letter, team staffing, and matter opening. Runs before substantive work begins.',
  steps: [
    'conflict_check',
    'kyc_screening',
    'engagement_letter',
    'client_review_gate',
    'team_staffing',
    'matter_opening',
    'engaged',
  ],
  stepDefinitions: {
    conflict_check: {
      name: 'conflict_check',
      description: 'Run conflict of interest check against existing matters and client database. Query institutional memory for any matching entities.',
      preconditions: [],
    },
    kyc_screening: {
      name: 'kyc_screening',
      description: 'Know-Your-Client screening. Verify client identity, assess risk level, flag concerns. Requires conflict check to be clear.',
      preconditions: ['conflict_check'],
    },
    engagement_letter: {
      name: 'engagement_letter',
      description: 'Generate engagement letter with scope, fee structure, liability terms, data handling provisions, and proposed team composition.',
      preconditions: ['kyc_screening'],
    },
    client_review_gate: {
      name: 'client_review_gate',
      description: 'Human gate: Client reviews and accepts the engagement letter terms. Must be explicitly accepted before proceeding.',
      preconditions: ['engagement_letter'],
      requiresGateApproval: true,
      gateType: 'engagement_acceptance',
    },
    team_staffing: {
      name: 'team_staffing',
      description: 'Human gate: Client selects their team from available agent profiles. Can choose a preset or build a custom team.',
      preconditions: ['client_review_gate'],
      requiresGateApproval: true,
      gateType: 'team_selection',
    },
    matter_opening: {
      name: 'matter_opening',
      description: 'Open the matter formally. Assign matter number (SHEM-YYYY-NNN), create MatterRecord, configure session with selected team.',
      preconditions: ['team_staffing'],
    },
    engaged: {
      name: 'engaged',
      description: 'Pre-engagement complete. Matter is open and team is assigned. Ready for substantive workflow.',
      preconditions: ['matter_opening'],
    },
  },
  availableTools: [
    'Read', 'Grep', 'Glob',
    // Generic workflow engine
    'mcp__shem__get_current_step',
    'mcp__shem__advance_step',
    'mcp__shem__get_workflow_history',
    'mcp__shem__submit_handoff',
    'mcp__shem__get_handoffs',
    // Pre-engagement tools
    'mcp__shem__run_conflict_check',
    'mcp__shem__run_kyc_screening',
    'mcp__shem__generate_engagement_letter',
    'mcp__shem__get_agent_profiles',
    'mcp__shem__select_team',
    'mcp__shem__open_matter',
    // Approval gate (for human gates)
    'mcp__shem__request_approval',
    // Memory system (for conflict checks and precedents)
    'mcp__shem__query_institutional_memory',
    'mcp__shem__load_matter_memory',
    'mcp__shem__query_precedents',
    // Knowledge Base
    'mcp__shem__search_knowledge_base',
    'mcp__shem__list_knowledge_base_collections',
    'mcp__shem__get_knowledge_base_entry',
  ],
  requiredAgents: [],  // Pre-engagement doesn't dispatch specialist agents — it's orchestrator-only
  orchestratorPrompt: `You are the orchestrator for the pre-engagement workflow at The Shem law firm.

## Your Role
You handle client onboarding — the steps a real law firm takes BEFORE starting work on a matter. This includes conflict checks, KYC, engagement letter generation, and team staffing.

## Workflow Steps

### 1. CONFLICT CHECK
Run \`run_conflict_check\` with the client name and any known counterparties.
- If conflicts are found, flag them and halt.
- If clear, advance to the next step.

### 2. KYC SCREENING
Run \`run_kyc_screening\` with client details.
- Verify client identity and assess risk level.
- If high-risk flags, note them for partner review.

### 3. ENGAGEMENT LETTER
Run \`generate_engagement_letter\` with:
- Matter description and scope
- Estimated budget
- Fee structure
- Jurisdiction

### 4. CLIENT REVIEW GATE [HUMAN GATE]
Present the engagement letter to the client for review.
Call \`request_approval\` with the full engagement letter details.
The client must explicitly accept before proceeding.

### 5. TEAM STAFFING [HUMAN GATE]
First, call \`get_agent_profiles\` to show available agents and presets.
Present the team options to the client (presets and custom selection).
Call \`request_approval\` with the team options for the client to choose.
Then call \`select_team\` with the client's choice.

### 6. MATTER OPENING
Call \`open_matter\` to formally open the matter.
This assigns a matter number and configures the session.

### 7. ENGAGED
The pre-engagement workflow is complete. The matter is ready for substantive work.

## Rules
- Always call \`get_current_step\` to see where you are
- Call \`advance_step\` after completing each step
- NEVER skip conflict check or KYC
- The client MUST explicitly accept the engagement letter
- The client MUST select or approve their team
- Present team options clearly with skill ratings and costs
`,
  phasePermissions: {
    conflict_check: {
      denyTools: [
        'mcp__shem__run_kyc_screening',
        'mcp__shem__generate_engagement_letter',
        'mcp__shem__select_team',
        'mcp__shem__open_matter',
        'mcp__shem__request_approval',
      ],
      reason: 'Conflict check must be completed before any other pre-engagement steps.',
    },
    kyc_screening: {
      denyTools: [
        'mcp__shem__generate_engagement_letter',
        'mcp__shem__select_team',
        'mcp__shem__open_matter',
        'mcp__shem__request_approval',
      ],
      reason: 'KYC must complete before engagement letter or team selection.',
    },
    engagement_letter: {
      denyTools: [
        'mcp__shem__run_conflict_check',
        'mcp__shem__run_kyc_screening',
        'mcp__shem__select_team',
        'mcp__shem__open_matter',
      ],
      reason: 'Engagement letter generation phase. Team selection comes after client acceptance.',
    },
    client_review_gate: {
      denyTools: [
        'mcp__shem__run_conflict_check',
        'mcp__shem__run_kyc_screening',
        'mcp__shem__generate_engagement_letter',
        'mcp__shem__select_team',
        'mcp__shem__open_matter',
      ],
      reason: 'Client is reviewing the engagement letter. Only approval tools allowed.',
    },
    team_staffing: {
      denyTools: [
        'mcp__shem__run_conflict_check',
        'mcp__shem__run_kyc_screening',
        'mcp__shem__generate_engagement_letter',
        'mcp__shem__open_matter',
      ],
      reason: 'Team staffing phase. Client is selecting their team.',
    },
    matter_opening: {
      denyTools: [
        'mcp__shem__run_conflict_check',
        'mcp__shem__run_kyc_screening',
        'mcp__shem__generate_engagement_letter',
        'mcp__shem__select_team',
        'mcp__shem__request_approval',
      ],
      reason: 'Matter opening phase. Only matter opening tool allowed.',
    },
    engaged: {
      denyTools: [
        'mcp__shem__run_conflict_check',
        'mcp__shem__run_kyc_screening',
        'mcp__shem__generate_engagement_letter',
        'mcp__shem__select_team',
        'mcp__shem__open_matter',
        'mcp__shem__request_approval',
      ],
      reason: 'Pre-engagement complete. No more pre-engagement actions needed.',
    },
  },
};

// Auto-register on import
workflowRegistry.register(preEngagementTemplate);
