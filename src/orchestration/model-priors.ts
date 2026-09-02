/**
 * Hivemind — model pool + cold-start quality priors.
 *
 * The pool is the set of LLM "workers" Lavern can route an agent to. Each
 * option carries a cold-start quality prior (0–1, rough public-capability
 * estimate) used ONLY until the Performance Ledger has enough measured data
 * for that (matter-type × agent × model) cell — at which point measured
 * quality overrides the prior. Priors are deliberately transparent and
 * editable; nothing here is a learned black box.
 *
 * `residency` is a hard constraint, not a preference: a matter flagged
 * confidential/privileged must never be routed to a model whose residency
 * doesn't satisfy it.
 */

import { anthropicTierModels } from '../providers/tier-models.js';

export type ModelResidency = 'us' | 'eu' | 'on-device';

/** Display label from a model id: claude-opus-5 → "Opus 5", claude-haiku-4-5 → "Haiku 4.5". */
export function labelForModel(id: string): string {
  const parts = id.replace(/^claude-/, '').split('-').filter(p => !/^\d{8}$/.test(p));
  const [family, ...ver] = parts;
  return `${family.charAt(0).toUpperCase()}${family.slice(1)} ${ver.join('.')}`.trim();
}

export interface ModelOption {
  /** Concrete model id passed to the provider. */
  id: string;
  /** Short display label for the Hivemind tab. */
  label: string;
  provider: 'anthropic' | 'mistral' | 'local';
  /** Lavern tier this model fills, for back-compat with the static tier map. */
  tier: 'opus' | 'sonnet' | 'haiku' | 'large' | 'medium' | 'small' | 'on-device';
  /** Where the data is processed — drives the confidentiality hard-filter. */
  residency: ModelResidency;
  /** Cold-start general-capability prior in [0,1]. Overridden by measured data. */
  qualityPrior: number;
  /** Relative cost weight (1 = cheapest baseline). Display + future budget mode. */
  costWeight: number;
}

/**
 * The default pool. Priors are rough cold-start estimates from public
 * capability, NOT measured Lavern performance — the ledger replaces them per
 * (matter-type × agent × model) as engagements accumulate. Tune freely.
 */
const TIER = anthropicTierModels();

export const DEFAULT_MODEL_POOL: ModelOption[] = [
  // Anthropic ids come from config.anthropicTierModels so the pool, the SDK
  // subprocess pins, and ledger attribution can never disagree. Cost weights
  // are relative to Haiku ($1/M in): Sonnet 5 $2, Opus 5 $5.
  { id: TIER.opus,   label: labelForModel(TIER.opus),   provider: 'anthropic', tier: 'opus',   residency: 'us', qualityPrior: 0.96, costWeight: 5 },
  { id: TIER.sonnet, label: labelForModel(TIER.sonnet), provider: 'anthropic', tier: 'sonnet', residency: 'us', qualityPrior: 0.90, costWeight: 2 },
  { id: TIER.haiku,  label: labelForModel(TIER.haiku),  provider: 'anthropic', tier: 'haiku',  residency: 'us', qualityPrior: 0.66, costWeight: 1 },
  { id: 'mistral-large-latest',label: 'Mistral Large',provider: 'mistral',   tier: 'large',     residency: 'eu',        qualityPrior: 0.79, costWeight: 4  },
  { id: 'mistral-medium-latest',label: 'Mistral Medium',provider: 'mistral', tier: 'medium',    residency: 'eu',        qualityPrior: 0.66, costWeight: 2  },
  { id: 'gemma3:27b',          label: 'Gemma3 27B',   provider: 'local',     tier: 'on-device', residency: 'on-device', qualityPrior: 0.55, costWeight: 0  },
  { id: 'gemma3:12b',          label: 'Gemma3 12B',   provider: 'local',     tier: 'on-device', residency: 'on-device', qualityPrior: 0.45, costWeight: 0  },
];

/** Residency satisfaction: what a model offers ⊇ what the matter requires. */
export function residencySatisfies(modelResidency: ModelResidency, required?: ModelResidency): boolean {
  if (!required || required === 'us') return true;          // no constraint, or US is fine
  if (required === 'eu') return modelResidency === 'eu' || modelResidency === 'on-device';
  if (required === 'on-device') return modelResidency === 'on-device';
  return true;
}

export function findModel(pool: ModelOption[], id: string): ModelOption | undefined {
  return pool.find(m => m.id === id);
}
