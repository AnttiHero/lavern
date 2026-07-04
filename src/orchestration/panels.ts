/**
 * Hivemind — learning panel composition (Layers 3 + 4).
 *
 * Panels stop being a fixed pair and become a measured choice: every resolved
 * dissent teaches the Performance Ledger which models read which kinds of
 * questions right (Layer 3), and composePanel() picks the best-measured,
 * DECORRELATED panelists for the matter at hand — a hive of clones is an
 * echo chamber, so provider diversity beats a marginally higher score.
 *
 * Layer 4 widens the pool across providers, strictly opt-in
 * (LAVERN_HIVEMIND_CROSS_PANEL=true): a cross-vendor panelist means clause
 * text leaves the primary provider, so it never happens by default, and never
 * on local (zero-egress) engagements.
 */

import { config } from '../config.js';
import { defaultPanel } from './dissent.js';
import type { PanelMember, DissentVerdict } from './dissent.js';
import { DEFAULT_MODEL_POOL } from './model-priors.js';
import type { LedgerView, PerformanceLedger } from './performance-ledger.js';

/** Ledger role key for panel-outcome cells — kept distinct from agent roles. */
export const PANELIST_ROLE = 'hive-panelist';

/** Fallback prior for panelists without a DEFAULT_MODEL_POOL entry. */
const DEFAULT_PANELIST_PRIOR = 0.7;

/**
 * Every model eligible to sit on a panel for the given provider — which MUST
 * be the engagement's EFFECTIVE provider (session.provider ?? config.provider),
 * never the bare global: an EU-sovereign session on a globally-anthropic
 * deployment must get an EU panel. Cross-provider members only when the
 * operator opted in, and only on anthropic engagements (a sovereign/local
 * engagement never gains a cross-vendor panelist).
 */
export function panelPool(provider: string = config.provider): PanelMember[] {
  const pool = [...defaultPanel(provider)];
  if (config.hivemind.crossPanel && provider === 'anthropic' && config.mistral.apiKey) {
    pool.push({ key: 'mistral-large', label: 'Mistral Large', provider: 'mistral', model: 'mistral-large-latest' });
  }
  return pool;
}

/**
 * Pick `size` panelists for this matter type: best-measured score first
 * (ledger EWMA when a cell has enough observations, cold-start prior
 * otherwise), then greedy fill preferring a DIFFERENT provider over the
 * next-best same-provider candidate — decorrelation is the panel's job.
 */
export function composePanel(
  matterType: string,
  ledger: LedgerView,
  size = 2,
  pool: PanelMember[] = panelPool(),
): PanelMember[] {
  if (pool.length <= size) return pool;

  const minObs = config.hivemind.minObservations;
  const scored = pool
    .map(m => {
      const measured = ledger.qualityFor(matterType, PANELIST_ROLE, m.model);
      const usable = !!measured && measured.n >= minObs;
      const prior = DEFAULT_MODEL_POOL.find(p => p.id === m.model)?.qualityPrior ?? DEFAULT_PANELIST_PRIOR;
      return { m, score: usable ? measured!.ewma : prior };
    })
    .sort((a, b) => b.score - a.score);

  const picked: PanelMember[] = [scored[0].m];
  const remaining = scored.slice(1);
  while (picked.length < size && remaining.length > 0) {
    const providers = new Set(picked.map(p => p.provider));
    const idx = remaining.findIndex(c => !providers.has(c.m.provider));
    const next = idx >= 0 ? remaining.splice(idx, 1)[0] : remaining.shift()!;
    picked.push(next.m);
  }
  return picked;
}

/**
 * Layer 3 feedback: after a resolved dissent, credit the panelists whose
 * FIRST-round verdict matched the final label — that measures who reads this
 * kind of question right before the evidence arrives.
 *
 * Requires at least 3 answering panelists. On a 2-seat panel, a resolved
 * split means exactly one panelist flipped on the evidence — crediting the
 * non-flipper 1 and the flipper 0 would measure stubbornness, not
 * correctness (the final label comes from the same two models, so there is
 * no independent ground truth). With 3+ seats the final label reflects a
 * majority the individual panelist did not control, which is a real signal.
 */
export function recordPanelistOutcomes(
  ledger: PerformanceLedger,
  matterType: string,
  verdicts: DissentVerdict[],
  finalLabel: string,
): void {
  const answered = verdicts.filter(v => !v.error && v.model);
  if (answered.length < 3) return;
  for (const v of answered) {
    ledger.record(matterType, PANELIST_ROLE, v.model, v.label === finalLabel ? 1 : 0);
  }
}
