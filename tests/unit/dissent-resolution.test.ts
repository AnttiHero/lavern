/**
 * Unit Tests — Hivemind dissent resolution loop (src/orchestration/resolution.ts).
 *
 * Injected callFn + gatherFn — no network, no DB. Covers: no-op on consensus,
 * resolve-on-revote, escalate-on-persistent-split, escalate-when-no-evidence,
 * and fail-safe escalation on loop errors.
 */

import { describe, it, expect } from 'vitest';
import { runDissent, type PanelMember } from '../../src/orchestration/dissent.js';
import { resolveDissent, type DissentEvidence } from '../../src/orchestration/resolution.js';

const PANEL: PanelMember[] = [
  { key: 'opus', label: 'Opus', provider: 'anthropic', model: 'model-a' },
  { key: 'sonnet', label: 'Sonnet', provider: 'anthropic', model: 'model-b' },
];
const OPTIONS = ['uncapped', 'capped at fees'];

const EVIDENCE: DissentEvidence[] = [
  { source: 'KB: Limitation of Liability', snippet: 'Caps phrased as "in no event exceed fees paid" are enforceable caps.' },
];

const canned = (map: Record<string, string>) => async (m: PanelMember) => map[m.key] ?? '{}';

async function makeSplit() {
  return runDissent({
    question: 'Is liability capped?', options: OPTIONS, context: 'the clause', panel: PANEL,
    callFn: canned({ opus: '{"label":"uncapped"}', sonnet: '{"label":"capped at fees"}' }),
  });
}

describe('resolveDissent', () => {
  it('returns consensus results untouched', async () => {
    const consensus = await runDissent({
      question: 'q', options: OPTIONS, context: 'c', panel: PANEL,
      callFn: canned({ opus: '{"label":"uncapped"}', sonnet: '{"label":"uncapped"}' }),
    });
    const r = await resolveDissent(consensus, { context: 'c', gatherFn: async () => EVIDENCE });
    expect(r.resolution).toBeUndefined();
    expect(r).toBe(consensus);
  });

  it('resolves a split when the evidence re-vote converges', async () => {
    const split = await makeSplit();
    expect(split.dissent).toBe(true);

    const r = await resolveDissent(split, {
      context: 'the clause',
      panel: PANEL,
      gatherFn: async () => EVIDENCE,
      callFn: canned({ opus: '{"label":"capped at fees"}', sonnet: '{"label":"capped at fees"}' }),
    });
    expect(r.resolution?.resolved).toBe(true);
    expect(r.resolution?.escalated).toBe(false);
    expect(r.resolution?.finalLabel).toBe('capped at fees');
    expect(r.resolution?.evidence).toEqual(EVIDENCE);
    expect(r.resolution?.note).toMatch(/converged/);
    // Original first-round verdicts stay intact for the record
    expect(r.verdicts).toHaveLength(2);
    expect(r.dissent).toBe(true);
  });

  it('escalates when the split survives the evidence', async () => {
    const split = await makeSplit();
    const r = await resolveDissent(split, {
      context: 'the clause',
      panel: PANEL,
      gatherFn: async () => EVIDENCE,
      callFn: canned({ opus: '{"label":"uncapped"}', sonnet: '{"label":"capped at fees"}' }),
    });
    expect(r.resolution?.resolved).toBe(false);
    expect(r.resolution?.escalated).toBe(true);
    expect(r.resolution?.finalLabel).toBeUndefined();
    expect(r.resolution?.note).toMatch(/escalated to human review/);
  });

  it('escalates directly (no re-vote) when no evidence is found', async () => {
    const split = await makeSplit();
    let revoteRan = false;
    const r = await resolveDissent(split, {
      context: 'the clause',
      panel: PANEL,
      gatherFn: async () => [],
      callFn: async () => { revoteRan = true; return '{"label":"uncapped"}'; },
    });
    expect(revoteRan).toBe(false);
    expect(r.resolution?.escalated).toBe(true);
    expect(r.resolution?.revote).toEqual([]);
    expect(r.resolution?.note).toMatch(/No corroborating authority/);
  });

  it('escalates a unanimous off-list ("other") re-vote instead of resolving on it', async () => {
    const split = await makeSplit();
    const r = await resolveDissent(split, {
      context: 'the clause',
      panel: PANEL,
      gatherFn: async () => EVIDENCE,
      callFn: canned({ opus: '{"label":"it depends on venue"}', sonnet: '{"label":"cannot determine"}' }),
    });
    // Both re-votes map to the parser sentinel 'other' — that is a non-answer,
    // not a converged reading.
    expect(r.resolution?.resolved).toBe(false);
    expect(r.resolution?.escalated).toBe(true);
    expect(r.resolution?.finalLabel).toBeUndefined();
    expect(r.resolution?.note).toMatch(/did not converge on a listed option/);
  });

  it('does not resolve when only one panelist answers the re-vote', async () => {
    const split = await makeSplit();
    const r = await resolveDissent(split, {
      context: 'the clause',
      panel: PANEL,
      gatherFn: async () => EVIDENCE,
      callFn: async (m) => { if (m.key === 'sonnet') throw new Error('down'); return '{"label":"capped at fees"}'; },
    });
    expect(r.resolution?.resolved).toBe(false);
    expect(r.resolution?.escalated).toBe(true);
  });

  it('flags a departure when the panel converges AGAINST a cited hive precedent', async () => {
    const split = await makeSplit();
    const r = await resolveDissent(split, {
      context: 'the clause',
      panel: PANEL,
      gatherFn: async () => [
        { source: 'Hive precedent (human-ruled, 2026-06-12): "uncapped"', snippet: 'prior ruling', precedentRuling: 'uncapped' },
      ],
      callFn: canned({ opus: '{"label":"capped at fees"}', sonnet: '{"label":"capped at fees"}' }),
    });
    expect(r.resolution?.resolved).toBe(true);
    expect(r.resolution?.note).toMatch(/DEPARTED from prior hive precedent/);
  });

  it('notes consistency when the panel converges WITH a cited hive precedent', async () => {
    const split = await makeSplit();
    const r = await resolveDissent(split, {
      context: 'the clause',
      panel: PANEL,
      gatherFn: async () => [
        { source: 'Hive precedent (panel-resolved, 2026-06-12): "capped at fees"', snippet: 'prior ruling', precedentRuling: 'capped at fees' },
      ],
      callFn: canned({ opus: '{"label":"capped at fees"}', sonnet: '{"label":"capped at fees"}' }),
    });
    expect(r.resolution?.resolved).toBe(true);
    expect(r.resolution?.note).toMatch(/Consistent with prior hive precedent/);
  });

  it('adds no precedent note when the cited ruling uses a different option vocabulary', async () => {
    const split = await makeSplit();
    const r = await resolveDissent(split, {
      context: 'the clause',
      panel: PANEL,
      // Precedent from an engagement whose options were phrased differently —
      // "cap applies" is not in THIS question's option list, so it can neither
      // be followed nor departed from.
      gatherFn: async () => [
        { source: 'Hive precedent (panel-resolved, 2026-06-12): "cap applies"', snippet: 'prior ruling', precedentRuling: 'cap applies' },
      ],
      callFn: canned({ opus: '{"label":"capped at fees"}', sonnet: '{"label":"capped at fees"}' }),
    });
    expect(r.resolution?.resolved).toBe(true);
    expect(r.resolution?.note).not.toMatch(/DEPARTED|Consistent with prior/);
  });

  it('fail-safes to escalation when the gatherer throws', async () => {
    const split = await makeSplit();
    const r = await resolveDissent(split, {
      context: 'the clause',
      gatherFn: async () => { throw new Error('kb down'); },
    });
    expect(r.resolution?.escalated).toBe(true);
    expect(r.resolution?.note).toMatch(/Resolution loop failed/);
    // Original split data untouched
    expect(r.dissent).toBe(true);
    expect(r.verdicts).toHaveLength(2);
  });
});
