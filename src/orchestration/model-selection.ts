/**
 * Hivemind — the glass-box model selector.
 *
 * Given an agent and the matter context, pick the model to run it on. The
 * default objective is "quality" (qualitymax): route to the model with the
 * highest MEASURED quality for this (matter-type × agent) cell, falling back to
 * the cold-start prior until a cell has enough observations. Hard constraints
 * (data residency for confidential matters; optional budget ceiling) filter the
 * pool first. Every decision returns a human-readable rationale AND the full
 * scored candidate list, so the Hivemind tab and the audit
 * bundle can always show *why* an agent got the model it got.
 */

import { DEFAULT_MODEL_POOL, residencySatisfies } from './model-priors.js';
import type { ModelOption, ModelResidency } from './model-priors.js';
import type { LedgerView } from './performance-ledger.js';

export type RoutingObjective = 'quality' | 'quality-within-budget' | 'cost';

/** Observations needed before measured quality overrides the cold-start prior. */
const MIN_OBS_DEFAULT = 3;

export interface SelectionContext {
  agentRole: string;
  /** Routing key — e.g. workflow id or request type from the router classification. */
  matterType: string;
  /** Confidentiality hard-constraint. Omit/`us` = no restriction. */
  residency?: ModelResidency;
  /** Default 'quality' (qualitymax). */
  objective?: RoutingObjective;
  /** Override the model pool (tests / per-firm pools). */
  pool?: ModelOption[];
  minObservations?: number;
  /** For 'quality-within-budget': max allowed costWeight. */
  maxCostWeight?: number;
  /**
   * The agent's hand-tuned default model id. Used as the cold-start choice:
   * with NO measured data we keep the deliberate static assignment (which
   * encodes intentional model diversity for error decorrelation) rather than
   * blindly maxxing every agent to the highest-prior model. Measured data still
   * overrides it.
   */
  baselineModelId?: string;
}

export interface CandidateScore {
  modelId: string;
  label: string;
  provider: string;
  score: number;
  source: 'measured' | 'prior';
  observations: number;
  costWeight: number;
  eligible: boolean;
  /** Why excluded, when not eligible. */
  reason?: string;
}

export interface ModelChoice {
  modelId: string;
  label: string;
  provider: string;
  tier: string;
  score: number;
  source: 'measured' | 'prior';
  /** Plain-language explanation, logged to the audit bundle. */
  rationale: string;
  /** Every model considered, scored — powers the Hivemind tab. */
  candidates: CandidateScore[];
}

function scoreCandidate(model: ModelOption, ctx: SelectionContext, ledger: LedgerView): CandidateScore {
  const minObs = ctx.minObservations ?? MIN_OBS_DEFAULT;
  const measured = ledger.qualityFor(ctx.matterType, ctx.agentRole, model.id);

  let score: number;
  let source: 'measured' | 'prior';
  if (measured && measured.n >= minObs) { score = measured.ewma; source = 'measured'; }
  else { score = model.qualityPrior; source = 'prior'; }

  let eligible = true;
  let reason: string | undefined;
  if (!residencySatisfies(model.residency, ctx.residency)) {
    eligible = false;
    reason = `residency ${model.residency} cannot serve a ${ctx.residency} matter`;
  } else if (ctx.objective === 'quality-within-budget' && ctx.maxCostWeight != null && model.costWeight > ctx.maxCostWeight) {
    eligible = false;
    reason = `cost ${model.costWeight} exceeds budget ${ctx.maxCostWeight}`;
  }

  return {
    modelId: model.id, label: model.label, provider: model.provider,
    score, source, observations: measured?.n ?? 0, costWeight: model.costWeight, eligible, reason,
  };
}

export function selectModel(ctx: SelectionContext, ledger: LedgerView): ModelChoice {
  const pool = ctx.pool ?? DEFAULT_MODEL_POOL;
  const objective = ctx.objective ?? 'quality';

  const scored = pool.map(model => ({ model, c: scoreCandidate(model, ctx, ledger) }));
  const eligible = scored.filter(s => s.c.eligible);
  if (eligible.length === 0) {
    throw new Error(`Hivemind: no eligible model for ${ctx.agentRole} under residency=${ctx.residency ?? 'us'}`);
  }

  // Rank by objective: qualitymax = highest score; cost = cheapest.
  const ranked = eligible.slice().sort((a, b) =>
    objective === 'cost'
      ? (a.model.costWeight - b.model.costWeight) || (b.c.score - a.c.score)
      : (b.c.score - a.c.score) || (a.model.costWeight - b.model.costWeight),
  );

  // Deviate from the agent's hand-tuned default ONLY on measured evidence: an
  // alternative must have real measured data AND outscore the default. Priors
  // alone never trigger a deviation — otherwise every agent gets pulled to the
  // highest-prior model, erasing the deliberate model diversity. With no
  // baseline (e.g. a firm-level pool query) it's pure qualitymax.
  let winner = ranked[0];
  let keptBaseline = false;
  if (objective !== 'cost' && ctx.baselineModelId) {
    const baseline = eligible.find(s => s.model.id === ctx.baselineModelId);
    if (baseline) {
      const bestMeasured = eligible
        .filter(s => s.c.source === 'measured')
        .sort((a, b) => b.c.score - a.c.score)[0];
      const deviate = !!bestMeasured
        && bestMeasured.model.id !== baseline.model.id
        && bestMeasured.c.score > baseline.c.score;
      winner = deviate ? bestMeasured : baseline;
      keptBaseline = !deviate;
    }
  }

  const m = winner.model;
  const w = winner.c;

  const rationale = w.source === 'measured'
    ? `Routed ${ctx.agentRole} → ${m.label}: measured quality ${w.score.toFixed(2)} over ${w.observations} prior "${ctx.matterType}" engagement(s) (qualitymax).`
    : keptBaseline
      ? `Routed ${ctx.agentRole} → ${m.label}: hand-tuned default kept — no measured data yet for "${ctx.matterType}".`
      : `Routed ${ctx.agentRole} → ${m.label}: cold-start prior ${w.score.toFixed(2)} (no measured data yet for "${ctx.matterType}"; qualitymax).`;

  return {
    modelId: m.id, label: m.label, provider: m.provider, tier: m.tier,
    score: w.score, source: w.source, rationale,
    candidates: scored.map(s => s.c),
  };
}

/**
 * A model-routing decision recorded for one agent in one engagement. Stored on
 * the session, persisted to the audit bundle, and rendered in the
 * Hivemind delivery sub-tab.
 */
export interface RoutingDecision {
  agentRole: string;
  chosenModelId: string;
  chosenLabel: string;
  provider: string;
  tier: string;
  source: 'measured' | 'prior';
  score: number;
  rationale: string;
  candidates: CandidateScore[];
  /** The agent's hand-tuned default model id (what static dispatch would use). */
  baselineModelId: string;
  /** True when the engine's choice differs from the hand-tuned default. */
  overrodeBaseline: boolean;
  /** The model the agent ACTUALLY ran on (= chosen, or an exploration pick, or
   *  the default when live routing is disabled). Outcomes are attributed here. */
  effectiveModelId: string;
  effectiveTier: string;
  /** True when this agent was routed to an alternative to gather measured data. */
  explored: boolean;
  decidedAt: string;
}
