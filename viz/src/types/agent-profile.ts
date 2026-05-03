/**
 * Agent Profile Types — NBA2K-style agent cards with skills and personalities.
 *
 * Every agent in the firm has a profile that describes:
 * - Category (lawyer, specialist, infrastructure, orchestrator)
 * - Seniority and cost tier
 * - 8 skill dimensions rated 1–10
 * - 5 personality axes rated 1–10 + archetype name
 * - Practice areas, strengths, limitations
 *
 * Clients see these profiles when composing their team.
 */

// ── Categories ──────────────────────────────────────────────────────────

export type AgentCategory = 'lawyer' | 'specialist' | 'infrastructure' | 'orchestrator';

export type SeniorityTier = 'partner' | 'senior-associate' | 'associate' | 'junior' | 'specialist' | 'counsel';

/** Maps to Claude model tier — determines actual API cost. */
export type CostTier = 'opus' | 'sonnet' | 'haiku';

// ── Skills ──────────────────────────────────────────────────────────────

/** 8 skill dimensions, each rated 1–10. Displayed on the agent "card". */
export interface SkillRatings {
  /** Accuracy, correctness, attention to detail */
  precision: number;
  /** Novel solutions, alternative approaches, lateral thinking */
  creativity: number;
  /** Efficiency, conciseness, turnaround time */
  speed: number;
  /** Thoroughness of analysis, exhaustiveness */
  depth: number;
  /** Persuasive drafting, adversarial thinking, deal-making */
  negotiation: number;
  /** Plain language, client-facing clarity, empathy */
  communication: number;
  /** Citation quality, authority analysis, source evaluation */
  research: number;
  /** Risk identification, pricing, mitigation strategy */
  risk: number;
}

// ── Personality ─────────────────────────────────────────────────────────

/** 5 personality axes, each rated 1–10 (low end ↔ high end). */
export type PersonalityAxis =
  | 'conservative-vs-creative'      // 1 = conservative, 10 = creative
  | 'thorough-vs-fast'              // 1 = thorough, 10 = fast
  | 'risk-averse-vs-tolerant'       // 1 = risk-averse, 10 = risk-tolerant
  | 'formal-vs-approachable'        // 1 = formal, 10 = approachable
  | 'adversarial-vs-collaborative'; // 1 = adversarial, 10 = collaborative

export interface PersonalityProfile {
  /** Named archetype — e.g., "The Gatekeeper", "The Surgeon", "The Diplomat" */
  archetype: string;
  /** Each axis rated 1–10 */
  traits: Record<PersonalityAxis, number>;
  /** Free-text work style description embedded in the agent's system prompt */
  workStyle: string;
}

// ── Agent Profile ───────────────────────────────────────────────────────

export interface AgentProfile {
  /** Agent role key — must match a key in agentDefinitions */
  role: string;

  /** Display name shown to clients (e.g., "Managing Partner") */
  displayName: string;

  /** One-line description for team selection UI */
  tagline: string;

  /** Category: lawyer, specialist, infrastructure, or orchestrator */
  category: AgentCategory;

  /** Seniority level — affects perceived authority and billing rate */
  seniority: SeniorityTier;

  /** Model cost tier — determines which Claude model is used */
  costTier: CostTier;

  /** Simulated hourly billing rate in USD (display/budgeting, not actual API cost) */
  billingRateUsd: number;

  /** 8 skill dimensions rated 1–10 */
  skills: SkillRatings;

  /** Personality archetype + 5 axes + work style text */
  personality: PersonalityProfile;

  /** Practice areas this agent covers */
  practiceAreas: string[];

  /** What this agent excels at — shown in team selection */
  strengths: string[];

  /** What this agent does NOT do well — shown in team selection */
  limitations: string[];

  /** Behavioral boundaries — things this agent must NEVER do. Injected into system prompt. */
  criticalRules?: string[];

  /** Measurable success criteria. Used by evaluator gate and displayed in agent cards. */
  successMetrics?: string[];

  /** Whether this agent can be removed from a team (e.g., evaluator may be mandatory) */
  optional: boolean;

  /** Whether this agent is selected by default for new matters */
  defaultSelected: boolean;

  /** Optional DiceBear seed (defaults to displayName if absent) */
  avatarSeed?: string;

  /** Optional DiceBear URL params to override avatar features (e.g. "lips=variant02") */
  avatarExtra?: string;

  /** How this agent was created. Drives the share-page hero copy and the
   *  LinkedIn pre-fill text (e.g. "I cloned myself with Lavern" vs
   *  "I cloned MinterEllison with Lavern"). Set at addAgent time, never
   *  shown directly in the UI. */
  provenance?: AgentProvenance;
}

// ── Provenance ──────────────────────────────────────────────────────────

export type AgentProvenanceKind = 'self' | 'firm' | 'scratch' | 'goblin';

export interface AgentProvenance {
  /** How the agent was made. */
  kind: AgentProvenanceKind;
  /** For 'firm' kind — the cloned firm's name (e.g. "MinterEllison"). */
  firmName?: string;
  /** ISO 8601 timestamp of creation. */
  createdAt?: string;
}

// ── Team Presets ─────────────────────────────────────────────────────────

export interface TeamPreset {
  id: string;
  name: string;
  description: string;
  roles: string[];
}
