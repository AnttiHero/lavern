/**
 * YOLO Express Lane — tier configurations.
 *
 * Two lanes for the repeat client who trusts the machine:
 *   Standard:    balanced team, standard intensity, medium effort, $10 budget
 *   White-Shoe:  full-service team, maximal intensity, max effort, $40 budget
 *
 * Both set yoloMode: true (auto-approve all gates).
 *
 * The `effort` field maps to Claude's API effort parameter:
 *   'medium' = balanced token spend (standard tier)
 *   'max'    = white-shoe effort — no token limits, deepest reasoning (Opus 4.6 only)
 */

export type YoloTier = 'standard' | 'white-shoe';

export type EffortLevel = 'low' | 'medium' | 'high' | 'max';

export interface YoloConfig {
  tier: YoloTier;
  label: string;
  workflowId: string;
  requestType: string;
  intensity: string;
  /** Claude API effort level — controls thinking depth and token spend */
  effort: EffortLevel;
  budgetUsd: number;
  yoloMode: true;
  teamPreset: string;
  teamSize: number;
  teamRoles: string[];
}

/**
 * Team roles are from DEMO_PRESETS in staffing/data/demoProfiles.ts.
 * Balanced = 8 agents, Full Service = 14 agents.
 */
export const YOLO_CONFIGS: Record<YoloTier, YoloConfig> = {
  standard: {
    tier: 'standard',
    label: 'Advisory',
    workflowId: 'counsel',
    requestType: 'legal_question',
    intensity: 'standard',
    effort: 'medium',
    budgetUsd: 10,
    yoloMode: true,
    teamPreset: 'balanced',
    teamSize: 8,
    teamRoles: [
      'managing-partner', 'corporate-generalist', 'junior-associate', 'contract-specialist',
      'plain-language-specialist', 'ethics-auditor', 'evaluator', 'risk-pricer',
    ],
  },
  'white-shoe': {
    tier: 'white-shoe',
    label: 'Full Service',
    workflowId: 'review',
    requestType: 'contract_review',
    intensity: 'maximal',
    effort: 'max',
    budgetUsd: 40,
    yoloMode: true,
    teamPreset: 'full-service',
    teamSize: 14,
    teamRoles: [
      'managing-partner', 'supervising-partner', 'corporate-generalist', 'contract-specialist',
      'regulatory-counsel', 'privacy-counsel', 'service-designer', 'plain-language-specialist',
      'client-proxy', 'ethics-auditor', 'data-analyst', 'evaluator', 'risk-pricer', 'qa-tester',
    ],
  },
};
