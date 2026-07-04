/**
 * Hivemind — per-engagement glue.
 *
 * planEngagementRouting(): at engagement start, decide each team agent's model.
 *   It computes the qualitymax choice (respecting each agent's hand-tuned
 *   default unless measured data justifies a change) and, when live routing is
 *   enabled, occasionally EXPLORES an alternative to gather measured data. The
 *   decision (with rationale + the model the agent will actually run on) is
 *   recorded on the session for the "Hivemind" delivery tab + audit bundle.
 *
 * recordEngagementOutcome(): after the engagement, fold its measured quality
 *   back into the Performance Ledger against the model each agent ACTUALLY ran
 *   on — so the selector can deviate from defaults where the data earns it.
 *
 * Live model OVERRIDE (config.hivemind.enabled) is applied by the
 * executor using each decision's `effectiveTier`. With the flag OFF, agents run
 * their static models and this layer is pure shadow recording — zero behavior
 * change.
 */

import { config } from '../config.js';
import { createLogger } from '../utils/logger.js';
import { agentDefinitions } from '../agents/definitions.js';
import { selectModel } from './model-selection.js';
import type { RoutingDecision } from './model-selection.js';
import { DEFAULT_MODEL_POOL, residencySatisfies, type ModelOption, type ModelResidency } from './model-priors.js';
import { PerformanceLedger } from './performance-ledger.js';
import type { SessionState } from '../session/session-state.js';

const logger = createLogger('HIVEMIND');

/**
 * Roles whose model is DELIBERATELY kept distinct from the specialists for
 * error decorrelation — the automated quality gate and independent verifiers.
 * They exist to catch the other agents' mistakes, so hivemind routing must never
 * move them onto another agent's model (which would re-correlate the errors
 * the gate is meant to catch). Their model stays the hand-tuned default.
 */
const DECORRELATION_PROTECTED = new Set(['evaluator', 'meaning-guardian', 'red-team']);

let ledger: PerformanceLedger | undefined;
/** Process-wide ledger, persisted under the reports dir. */
export function getLedger(): PerformanceLedger {
  if (!ledger) ledger = new PerformanceLedger(config.reportsDir);
  return ledger;
}

/** Models Lavern can actually dispatch today. v1: the Anthropic family (the
 *  Agent SDK path). Cross-provider per-agent dispatch widens this later. */
function runnablePool(): ModelOption[] {
  return DEFAULT_MODEL_POOL.filter(m => m.provider === 'anthropic');
}

function residencyForProvider(provider: string): ModelResidency {
  return provider === 'local' ? 'on-device' : provider === 'mistral' ? 'eu' : 'us';
}

/** Map an agent's hand-tuned tier ('opus'/'sonnet'/...) to a concrete pool model id. */
function baselineModelId(pool: ModelOption[], role: string): string {
  const def = agentDefinitions[role as keyof typeof agentDefinitions] as { model?: string } | undefined;
  const tier = def?.model;
  return pool.find(m => m.tier === tier)?.id ?? pool[0]?.id ?? '';
}

/** Pick a random eligible alternative model (≠ excludeId) for exploration. */
function pickAlternative(pool: ModelOption[], excludeId: string, residency: ModelResidency, rng: () => number): ModelOption | undefined {
  const alts = pool.filter(m => m.id !== excludeId && residencySatisfies(m.residency, residency));
  if (alts.length === 0) return undefined;
  return alts[Math.floor(rng() * alts.length)];
}

/**
 * Plan + record the routing decision for each team agent. Idempotent: replaces
 * any prior decisions on the session. `rng` is injectable for tests.
 */
export function planEngagementRouting(
  session: SessionState,
  matterType: string,
  teamRoles: string[],
  provider: string = config.provider,
  /** Whether the CALLER applies the live model override. When false (e.g. the
   *  legal-design pipeline, which is shadow-only), effective = the static
   *  default so ledger attribution matches what actually ran. */
  liveRouting: boolean = config.hivemind.enabled,
  rng: () => number = Math.random,
): RoutingDecision[] {
  const pool = runnablePool();
  const residency = residencyForProvider(provider);
  const enabled = liveRouting;
  const lg = getLedger();
  const decisions: RoutingDecision[] = [];

  for (const role of [...new Set(teamRoles)]) {
    const baseId = baselineModelId(pool, role);
    let choice;
    try {
      choice = selectModel(
        { agentRole: role, matterType, residency, pool, baselineModelId: baseId, minObservations: config.hivemind.minObservations },
        lg,
      );
    } catch (err) {
      logger.warn('routing decision skipped', { role, err: (err as Error).message });
      continue;
    }

    // What the agent will ACTUALLY run on: the static default when live routing
    // is off; otherwise the chosen model, or an exploration pick.
    let effId = enabled ? choice.modelId : baseId;
    let effTier = enabled ? choice.tier : (pool.find(m => m.id === baseId)?.tier ?? choice.tier);
    let explored = false;
    if (enabled && rng() < config.hivemind.explorationRate) {
      const alt = pickAlternative(pool, choice.modelId, residency, rng);
      if (alt) { effId = alt.id; effTier = alt.tier; explored = true; }
    }

    // Decorrelation guard: verification/gate roles never move off their
    // distinct default model — keep them independent of the specialists.
    if (DECORRELATION_PROTECTED.has(role)) {
      effId = baseId;
      effTier = pool.find(m => m.id === baseId)?.tier ?? effTier;
      explored = false;
    }

    decisions.push({
      agentRole: role,
      chosenModelId: choice.modelId,
      chosenLabel: choice.label,
      provider: choice.provider,
      tier: choice.tier,
      source: choice.source,
      score: choice.score,
      rationale: explored
        ? `${choice.rationale} Exploring ${effTier} this run to gather data.`
        : choice.rationale,
      candidates: choice.candidates,
      baselineModelId: baseId,
      overrodeBaseline: choice.modelId !== baseId,
      effectiveModelId: effId,
      effectiveTier: effTier,
      explored,
      decidedAt: new Date().toISOString(),
    });
  }

  session.hivemind = decisions;
  if (enabled) logger.info('live routing applied', { matterType, agents: decisions.length, explored: decisions.filter(d => d.explored).length });
  return decisions;
}

/** A coarse [0,1] quality signal for the whole engagement, from verification. */
function engagementQuality(session: SessionState): number {
  const v = session.verificationResults;
  if (v.length > 0) return v.filter(r => r.passed).length / v.length;
  return 0.7; // neutral prior when nothing was verified
}

/**
 * Fold this engagement's measured quality into the ledger, keyed to the model
 * each agent ACTUALLY ran on (effectiveModelId) — so exploration and live
 * overrides both teach the selector.
 */
export function recordEngagementOutcome(session: SessionState, matterType: string): void {
  const decisions = session.hivemind;
  if (!decisions.length) return;
  const quality = engagementQuality(session);
  const lg = getLedger();
  for (const d of decisions) {
    lg.record(matterType, d.agentRole, d.effectiveModelId, quality);
  }
  logger.info('recorded engagement outcome to ledger', { matterType, agents: decisions.length, quality: quality.toFixed(2) });
}
