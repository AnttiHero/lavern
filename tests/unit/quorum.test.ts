/**
 * Unit Tests — Hivemind quorum verification (src/orchestration/quorum.ts).
 *
 * Injected callFn (canned panelist replies) — no network. Covers the three
 * outcomes, the strict-majority rule, and failure degradation.
 */

import { describe, it, expect } from 'vitest';
import { runQuorumCheck } from '../../src/orchestration/quorum.js';
import type { PanelMember } from '../../src/orchestration/dissent.js';

const PANEL: PanelMember[] = [
  { key: 'opus', label: 'Opus', provider: 'anthropic', model: 'x' },
  { key: 'sonnet', label: 'Sonnet', provider: 'anthropic', model: 'y' },
  { key: 'mistral', label: 'Mistral', provider: 'mistral', model: 'z' },
];

const canned = (map: Record<string, string>) => async (m: PanelMember) => map[m.key] ?? '{}';

const BASE = {
  pass: 'accuracy',
  description: 'Liability cap contradicts the indemnity clause',
  evidence: 'Section 9.1 caps liability at fees paid; Section 11.2 requires unlimited indemnification.',
  location: 'Sections 9.1 / 11.2',
};

describe('runQuorumCheck', () => {
  it('confirms when all answering panelists support the finding', async () => {
    const q = await runQuorumCheck({
      ...BASE, panel: PANEL,
      callFn: canned({
        opus: '{"label":"supported","quote":"caps liability at fees paid","confidence":"high"}',
        sonnet: '{"label":"supported","quote":"unlimited indemnification","confidence":"high"}',
        mistral: '{"label":"supported","confidence":"medium"}',
      }),
    });
    expect(q.outcome).toBe('confirmed');
    expect(q.votes).toBe('3/3 supported');
    expect(q.pass).toBe('accuracy');
  });

  it('marks unconfirmed when support is not a strict majority', async () => {
    const q = await runQuorumCheck({
      ...BASE, panel: [PANEL[0], PANEL[1]],
      callFn: canned({
        opus: '{"label":"supported"}',
        sonnet: '{"label":"not supported","rationale":"11.2 only covers third-party claims"}',
      }),
    });
    expect(q.outcome).toBe('unconfirmed');
    expect(q.votes).toBe('1/2 supported');
  });

  it('never counts a paraphrased rejection as support', async () => {
    const q = await runQuorumCheck({
      ...BASE, panel: [PANEL[0], PANEL[1]],
      callFn: canned({
        opus: '{"label":"not supported by the cited evidence"}',
        sonnet: '{"label":"unsupported"}',
      }),
    });
    expect(q.outcome).toBe('unconfirmed');
    expect(q.votes).toBe('0/2 supported');
  });

  it('treats "overstated" as non-support', async () => {
    const q = await runQuorumCheck({
      ...BASE, panel: [PANEL[0], PANEL[1]],
      callFn: canned({ opus: '{"label":"overstated"}', sonnet: '{"label":"overstated"}' }),
    });
    expect(q.outcome).toBe('unconfirmed');
    expect(q.votes).toBe('0/2 supported');
  });

  it('is inconclusive when fewer than 2 panelists answer', async () => {
    const q = await runQuorumCheck({
      ...BASE, panel: [PANEL[0], PANEL[1]],
      callFn: async (m) => { if (m.key === 'sonnet') throw new Error('down'); return '{"label":"supported"}'; },
    });
    expect(q.outcome).toBe('inconclusive');
    expect(q.votes).toBe('1/1 supported');
  });

  it('confirms on 2/3 strict majority', async () => {
    const q = await runQuorumCheck({
      ...BASE, panel: PANEL,
      callFn: canned({
        opus: '{"label":"supported"}',
        sonnet: '{"label":"supported"}',
        mistral: '{"label":"not supported"}',
      }),
    });
    expect(q.outcome).toBe('confirmed');
    expect(q.votes).toBe('2/3 supported');
  });

  it('truncates long finding text but keeps the panel verdicts', async () => {
    const q = await runQuorumCheck({
      ...BASE,
      description: 'x'.repeat(500),
      panel: [PANEL[0], PANEL[1]],
      callFn: canned({ opus: '{"label":"supported"}', sonnet: '{"label":"supported"}' }),
    });
    expect(q.finding.length).toBe(300);
    expect(q.verdicts).toHaveLength(2);
  });
});
