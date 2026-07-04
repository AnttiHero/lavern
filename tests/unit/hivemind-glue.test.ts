/**
 * Unit Tests — Hivemind engagement glue
 * (src/orchestration/record-engagement-routing.ts).
 *
 * Covers shadow vs live attribution, the decorrelation guard (verification
 * roles never overridden), exploration with an injected rng, residency gating
 * for non-Anthropic providers, and ledger record-back against the effective
 * model. Uses unique matter-type keys so the process-wide ledger stays at
 * cold-start for each assertion.
 */

import { describe, it, expect } from 'vitest';
import { planEngagementRouting, recordEngagementOutcome, getLedger } from '../../src/orchestration/record-engagement-routing.js';
import { config } from '../../src/config.js';

// Minimal SessionState stand-in — the helper only touches these fields.
function fakeSession(): { hivemind: unknown[]; verificationResults: { passed: boolean }[]; selectedTeam: string[] } {
  return { hivemind: [], verificationResults: [{ passed: true }, { passed: false }], selectedTeam: [] };
}

describe('planEngagementRouting', () => {
  it('shadow (liveRouting=false): effective model is the hand-tuned default', () => {
    const s = fakeSession();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [d] = planEngagementRouting(s as any, 'glue-shadow', ['contract-reviewer'], 'anthropic', false);
    expect(d.effectiveModelId).toBe(d.baselineModelId);
    expect(d.explored).toBe(false);
    expect(s.hivemind).toHaveLength(1);
  });

  it('decorrelation guard: the evaluator is never moved off its default, even live', () => {
    const s = fakeSession();
    const prev = config.hivemind.explorationRate;
    (config.hivemind as { explorationRate: number }).explorationRate = 1; // force exploration
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [d] = planEngagementRouting(s as any, 'glue-decorr', ['evaluator'], 'anthropic', true, () => 0);
      expect(d.effectiveModelId).toBe(d.baselineModelId); // protected → stays on default
      expect(d.explored).toBe(false);
    } finally {
      (config.hivemind as { explorationRate: number }).explorationRate = prev;
    }
  });

  it('exploration (live + rng): routes a non-protected agent to an alternative', () => {
    const s = fakeSession();
    const prev = config.hivemind.explorationRate;
    (config.hivemind as { explorationRate: number }).explorationRate = 1;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [d] = planEngagementRouting(s as any, 'glue-explore', ['contract-reviewer'], 'anthropic', true, () => 0);
      expect(d.explored).toBe(true);
      expect(d.effectiveModelId).not.toBe(d.chosenModelId);
    } finally {
      (config.hivemind as { explorationRate: number }).explorationRate = prev;
    }
  });

  it('non-Anthropic (EU/local) provider yields no decisions — the US pool is residency-ineligible', () => {
    const s = fakeSession();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const decisions = planEngagementRouting(s as any, 'glue-eu', ['contract-reviewer'], 'mistral', false);
    expect(decisions).toHaveLength(0);
  });

  it('recordEngagementOutcome folds quality into the ledger against the model that ran', () => {
    const s = fakeSession();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [d] = planEngagementRouting(s as any, 'glue-record', ['contract-reviewer'], 'anthropic', false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recordEngagementOutcome(s as any, 'glue-record');
    const q = getLedger().qualityFor('glue-record', 'contract-reviewer', d.effectiveModelId);
    expect(q).toBeDefined();
    expect(q!.ewma).toBeCloseTo(0.5, 5); // 1 of 2 verifications passed
  });
});
