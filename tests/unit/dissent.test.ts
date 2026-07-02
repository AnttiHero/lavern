/**
 * Unit Tests — Dissent Mode engine (src/orchestration/dissent.ts).
 *
 * Uses an injected callFn (canned model replies) so no network is needed.
 * Covers split detection, consensus, failure degradation, and label mapping.
 */

import { describe, it, expect } from 'vitest';
import { runDissent, type PanelMember } from '../../src/orchestration/dissent.js';

const PANEL: PanelMember[] = [
  { key: 'opus', label: 'Opus', provider: 'anthropic', model: 'x' },
  { key: 'sonnet', label: 'Sonnet', provider: 'anthropic', model: 'y' },
  { key: 'mistral', label: 'Mistral', provider: 'mistral', model: 'z' },
];
const OPTIONS = ['uncapped', 'capped at fees', 'ambiguous'];

const canned = (map: Record<string, string>) => async (m: PanelMember) => map[m.key] ?? '{}';

describe('runDissent', () => {
  it('flags a split when panelists choose different labels', async () => {
    const r = await runDissent({
      question: 'Capped?', options: OPTIONS, context: 'clause', panel: PANEL,
      callFn: canned({
        opus: '{"label":"uncapped","quote":"no limitation of liability","rationale":"no cap clause","confidence":"high"}',
        sonnet: '{"label":"capped at fees","quote":"limited to fees paid","rationale":"cap present","confidence":"medium"}',
        mistral: '{"label":"uncapped","quote":"no cap","rationale":"agrees","confidence":"high"}',
      }),
    });
    expect(r.dissent).toBe(true);
    expect(r.positions['uncapped']).toEqual(['Opus', 'Mistral']);
    expect(r.positions['capped at fees']).toEqual(['Sonnet']);
    expect(r.summary).toMatch(/Split decision/);
    expect(r.verdicts.find(v => v.member === 'Opus')?.quote).toBe('no limitation of liability');
  });

  it('reports consensus when all agree', async () => {
    const r = await runDissent({
      question: 'Capped?', options: OPTIONS, context: 'c', panel: PANEL,
      callFn: canned({ opus: '{"label":"ambiguous"}', sonnet: '{"label":"ambiguous"}', mistral: '{"label":"ambiguous"}' }),
    });
    expect(r.dissent).toBe(false);
    expect(r.summary).toMatch(/All 3 models agree: ambiguous/);
  });

  it('degrades a failed panelist to an error verdict without throwing', async () => {
    const r = await runDissent({
      question: 'q', options: OPTIONS, context: 'c', panel: PANEL,
      callFn: async (m) => { if (m.key === 'mistral') throw new Error('down'); return '{"label":"uncapped"}'; },
    });
    expect(r.verdicts.find(v => v.member === 'Mistral')?.error).toBe('down');
    expect(r.dissent).toBe(false); // the two survivors agree
    expect(r.positions['uncapped']).toEqual(['Opus', 'Sonnet']);
  });

  it('maps a loosely-phrased label onto the option set, else "other"', async () => {
    const r = await runDissent({
      question: 'q', options: OPTIONS, context: 'c', panel: [PANEL[0], PANEL[1]],
      callFn: canned({ opus: '{"label":"it is UNCAPPED"}', sonnet: '{"label":"who knows"}' }),
    });
    expect(r.verdicts.find(v => v.member === 'Opus')?.label).toBe('uncapped');
    expect(r.verdicts.find(v => v.member === 'Sonnet')?.label).toBe('other');
  });
});
