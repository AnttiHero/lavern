/**
 * YOLO Express Lane — tier configurations.
 *
 * Three service levels for the client who trusts the machine:
 *   Counsel:     solo expert, direct answer, medium effort, $10 budget
 *   Review:      dedicated team, debate + quality checks, max effort, $40 budget
 *   Full Bench:  every specialist, senior oversight at both ends, max effort, $125 budget
 *
 * `yoloMode: true` applies to the explicit YOLO launcher only. The express
 * Instruct tiers reuse these configs but take their gate mode from the
 * profile's YOLO default (human gates unless the user opted out).
 *
 * The `effort` field maps to Claude's API effort parameter:
 *   'medium' = balanced token spend (counsel tier)
 *   'max'    = no token limits, deepest reasoning (Opus tier only)
 */

export type YoloTier = 'standard' | 'white-shoe' | 'elite';

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
 * Counsel = 1 dispatched, Review = 14 agents, Full Bench = 23 agents.
 */
export const YOLO_CONFIGS: Record<YoloTier, YoloConfig> = {
  standard: {
    tier: 'standard',
    label: 'Counsel',
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
    label: 'Review',
    workflowId: 'review',
    requestType: 'contract_review',
    intensity: 'maximal',
    effort: 'max',
    budgetUsd: 40,
    yoloMode: true,
    teamPreset: 'full-service',
    teamSize: 12,
    teamRoles: [
      'managing-partner', 'supervising-partner', 'corporate-generalist', 'contract-specialist',
      'regulatory-counsel', 'privacy-counsel', 'service-designer', 'plain-language-specialist',
      'client-proxy', 'ethics-auditor', 'evaluator', 'risk-pricer',
    ],
  },
  elite: {
    tier: 'elite',
    label: 'Full Bench',
    workflowId: 'full-bench',
    requestType: 'general',
    intensity: 'maximum',
    effort: 'max',
    budgetUsd: 125,
    yoloMode: true,
    teamPreset: 'elite',
    teamSize: 21,
    teamRoles: [
      // Senior leadership
      'managing-partner', 'supervising-partner', 'of-counsel', 'innovation-partner',
      // Practice specialists
      'corporate-generalist', 'contract-specialist', 'regulatory-counsel', 'privacy-counsel',
      'tax-counsel', 'ip-specialist', 'litigation-associate', 'international-counsel',
      // Design & accessibility
      'service-designer', 'plain-language-specialist', 'client-proxy',
      // Advisory & risk
      'ethics-auditor', 'ai-ethics-specialist',
      // Operations & control
      'evaluator', 'risk-pricer', 'synthesis-editor',
      // Support
      'junior-associate',
    ],
  },
};
