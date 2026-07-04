/**
 * Unit Tests — Hivemind model selection (src/orchestration/).
 *
 * Covers: cold-start prior selection, measured-data override (with the
 * min-observations gate), the residency hard-filter for confidential matters,
 * qualitymax vs cost objectives, and the EWMA ledger.
 */

import { describe, it, expect } from 'vitest';
import { selectModel } from '../../src/orchestration/model-selection.js';
import { PerformanceLedger } from '../../src/orchestration/performance-ledger.js';
import type { ModelOption } from '../../src/orchestration/model-priors.js';

const POOL: ModelOption[] = [
  { id: 'opus',   label: 'Opus',   provider: 'anthropic', tier: 'opus',      residency: 'us',        qualityPrior: 0.95, costWeight: 25 },
  { id: 'sonnet', label: 'Sonnet', provider: 'anthropic', tier: 'sonnet',    residency: 'us',        qualityPrior: 0.82, costWeight: 5  },
  { id: 'mistral',label: 'Mistral',provider: 'mistral',   tier: 'large',     residency: 'eu',        qualityPrior: 0.79, costWeight: 4  },
  { id: 'gemma',  label: 'Gemma',  provider: 'local',     tier: 'on-device', residency: 'on-device', qualityPrior: 0.55, costWeight: 0  },
];

describe('selectModel — qualitymax', () => {
  it('cold-start: picks the highest prior when there is no measured data', () => {
    const ledger = new PerformanceLedger();
    const choice = selectModel({ agentRole: 'contract-reviewer', matterType: 'review', pool: POOL }, ledger);
    expect(choice.modelId).toBe('opus');
    expect(choice.source).toBe('prior');
    expect(choice.rationale).toMatch(/cold-start prior/);
  });

  it('measured data overrides the prior once the observation gate is met', () => {
    const ledger = new PerformanceLedger();
    // Sonnet proves consistently better than Opus on THIS agent×matter.
    for (let i = 0; i < 5; i++) ledger.record('review', 'contract-reviewer', 'sonnet', 0.97);
    for (let i = 0; i < 5; i++) ledger.record('review', 'contract-reviewer', 'opus', 0.70);

    const choice = selectModel({ agentRole: 'contract-reviewer', matterType: 'review', pool: POOL }, ledger);
    expect(choice.modelId).toBe('sonnet');
    expect(choice.source).toBe('measured');
    expect(choice.rationale).toMatch(/measured quality/);
  });

  it('does NOT trust measured data below the min-observations gate', () => {
    const ledger = new PerformanceLedger();
    ledger.record('review', 'x', 'sonnet', 0.99); // only 1 obs, gate is 3
    const choice = selectModel({ agentRole: 'x', matterType: 'review', pool: POOL, minObservations: 3 }, ledger);
    expect(choice.modelId).toBe('opus'); // falls back to prior → Opus
    expect(choice.source).toBe('prior');
  });

  it('confidential matter (on-device) hard-filters US/EU models out', () => {
    const ledger = new PerformanceLedger();
    const choice = selectModel({ agentRole: 'x', matterType: 'review', residency: 'on-device', pool: POOL }, ledger);
    expect(choice.modelId).toBe('gemma'); // only on-device survives the filter
    const opus = choice.candidates.find(c => c.modelId === 'opus');
    expect(opus?.eligible).toBe(false);
    expect(opus?.reason).toMatch(/residency/);
  });

  it('EU matter allows EU + on-device, excludes US', () => {
    const ledger = new PerformanceLedger();
    const choice = selectModel({ agentRole: 'x', matterType: 'review', residency: 'eu', pool: POOL }, ledger);
    expect(choice.modelId).toBe('mistral'); // highest-prior EU-eligible
    expect(choice.candidates.find(c => c.modelId === 'opus')?.eligible).toBe(false);
  });

  it('cost objective prefers the cheapest eligible model', () => {
    const ledger = new PerformanceLedger();
    const choice = selectModel({ agentRole: 'x', matterType: 'review', objective: 'cost', pool: POOL }, ledger);
    expect(choice.modelId).toBe('gemma'); // costWeight 0
  });

  it('always returns the full scored candidate list for transparency', () => {
    const ledger = new PerformanceLedger();
    const choice = selectModel({ agentRole: 'x', matterType: 'review', pool: POOL }, ledger);
    expect(choice.candidates).toHaveLength(POOL.length);
  });
});

describe('selectModel — hand-tuned default protection', () => {
  it('cold start KEEPS the agent default instead of jumping to the highest prior', () => {
    const ledger = new PerformanceLedger();
    // Default is Sonnet; Opus has the higher prior but no measured evidence here.
    const choice = selectModel({ agentRole: 'x', matterType: 'review', pool: POOL, baselineModelId: 'sonnet' }, ledger);
    expect(choice.modelId).toBe('sonnet');
    expect(choice.rationale).toMatch(/hand-tuned default kept/);
  });

  it('keeps the default even when the default has measured data and a rival has a higher PRIOR', () => {
    const ledger = new PerformanceLedger();
    for (let i = 0; i < 5; i++) ledger.record('review', 'x', 'sonnet', 0.70); // only the default ran (shadow)
    const choice = selectModel({ agentRole: 'x', matterType: 'review', pool: POOL, baselineModelId: 'sonnet' }, ledger);
    expect(choice.modelId).toBe('sonnet'); // NOT pulled to Opus on its 0.95 prior
  });

  it('deviates to an alternative that has measured data beating the default', () => {
    const ledger = new PerformanceLedger();
    for (let i = 0; i < 5; i++) ledger.record('review', 'x', 'opus', 0.92); // Opus actually ran and measured well
    const choice = selectModel({ agentRole: 'x', matterType: 'review', pool: POOL, baselineModelId: 'sonnet' }, ledger);
    expect(choice.modelId).toBe('opus');
    expect(choice.source).toBe('measured');
  });
});

describe('PerformanceLedger EWMA', () => {
  it('first observation seeds the EWMA; later ones move it', () => {
    const ledger = new PerformanceLedger();
    ledger.record('m', 'a', 'opus', 0.8);
    expect(ledger.qualityFor('m', 'a', 'opus')).toEqual({ ewma: 0.8, n: 1 });
    ledger.record('m', 'a', 'opus', 1.0);
    const after = ledger.qualityFor('m', 'a', 'opus')!;
    expect(after.n).toBe(2);
    expect(after.ewma).toBeCloseTo(0.86, 5); // 0.3*1.0 + 0.7*0.8
  });

  it('clamps observations into [0,1]', () => {
    const ledger = new PerformanceLedger();
    ledger.record('m', 'a', 'opus', 5);
    expect(ledger.qualityFor('m', 'a', 'opus')!.ewma).toBe(1);
  });
});
