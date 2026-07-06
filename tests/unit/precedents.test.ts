/**
 * Unit Tests — The Precedent / hive jurisprudence (src/orchestration/precedents.ts).
 *
 * In-memory boards (no dir) except the persistence roundtrip, which uses a
 * temp dir. Covers retrieval relevance, human-ruled ranking + supersession,
 * citation counts, and cap eviction order.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { PrecedentBoard, type HivePrecedent } from '../../src/orchestration/precedents.js';

function entry(over: Partial<Omit<HivePrecedent, 'id' | 'citations'>> = {}): Omit<HivePrecedent, 'id' | 'citations'> {
  return {
    question: 'Does the liability cap apply to a breach of the confidentiality section?',
    options: ['cap applies', 'cap does not apply', 'ambiguous'],
    clauseExcerpt: 'liability shall not exceed fees paid; nothing limits liability arising from breach of Section 8 (Confidentiality)',
    matterType: 'review',
    ruling: 'cap does not apply',
    source: 'panel-resolved',
    evidence: [],
    panel: ['Opus 4.8', 'Sonnet 5'],
    decidedAt: '2026-07-01T00:00:00.000Z',
    ...over,
  };
}

describe('PrecedentBoard', () => {
  it('retrieves an on-point precedent and ignores unrelated ones', () => {
    const b = new PrecedentBoard();
    b.record(entry());
    b.record(entry({
      question: 'Is the auto-renewal notice period at least 30 days?',
      clauseExcerpt: 'this agreement renews automatically unless notice is given thirty days prior',
      ruling: 'yes',
      options: ['yes', 'no'],
    }));

    const hits = b.search('Does the liability cap cover confidentiality breaches?', 'review');
    expect(hits).toHaveLength(1);
    expect(hits[0].ruling).toBe('cap does not apply');

    expect(b.search('Is the software delivered under an SLA with uptime guarantees?')).toHaveLength(0);
  });

  it('ranks a human ruling above a panel resolution of similar relevance', () => {
    const b = new PrecedentBoard();
    b.record(entry({ ruling: 'cap applies', source: 'panel-resolved', question: 'Does the liability cap apply to confidentiality breaches under this agreement?' }));
    b.record(entry({ ruling: 'cap does not apply', source: 'human-ruled' }));

    const hits = b.search('Does the liability cap apply to a confidentiality breach?', 'review');
    expect(hits[0].source).toBe('human-ruled');
    expect(hits[0].ruling).toBe('cap does not apply');
  });

  it('a human ruling supersedes the panel resolution of the SAME question', () => {
    const b = new PrecedentBoard();
    b.record(entry({ ruling: 'cap applies', source: 'panel-resolved' }));
    b.record(entry({ ruling: 'cap does not apply', source: 'human-ruled' }));

    const all = b.table();
    expect(all).toHaveLength(1);
    expect(all[0].source).toBe('human-ruled');
  });

  it('a panel resolution never overwrites a human ruling on the same point', () => {
    const b = new PrecedentBoard();
    b.record(entry({ ruling: 'cap does not apply', source: 'human-ruled' }));
    const returned = b.record(entry({ ruling: 'cap applies', source: 'panel-resolved' }));
    expect(returned.source).toBe('human-ruled');
    expect(b.table()).toHaveLength(1);
    expect(b.table()[0].ruling).toBe('cap does not apply');
  });

  it('the newest human ruling replaces an older human ruling on the same point', () => {
    const b = new PrecedentBoard();
    b.record(entry({ ruling: 'cap applies', source: 'human-ruled' }));
    b.record(entry({ ruling: 'cap does not apply', source: 'human-ruled' }));
    expect(b.table()).toHaveLength(1);
    expect(b.table()[0].ruling).toBe('cap does not apply');
  });

  it('re-resolving the same point panel-side replaces rather than accumulates', () => {
    const b = new PrecedentBoard();
    b.record(entry({ ruling: 'cap applies' }));
    b.record(entry({ ruling: 'cap does not apply' }));
    expect(b.table()).toHaveLength(1);
    expect(b.table()[0].ruling).toBe('cap does not apply');
  });

  it('scopes retrieval to the citing user — clause text never crosses users', () => {
    const b = new PrecedentBoard();
    b.record(entry({ userId: 'client-a' }));
    expect(b.search('Does the liability cap cover confidentiality breaches?', 'review', 2, { userId: 'client-a' })).toHaveLength(1);
    expect(b.search('Does the liability cap cover confidentiality breaches?', 'review', 2, { userId: 'client-b' })).toHaveLength(0);
  });

  it('never serves sovereign-recorded text into a different provider\'s session', () => {
    const b = new PrecedentBoard();
    b.record(entry({ userId: 'u', provider: 'mistral' }));
    b.record(entry({ userId: 'u', provider: 'anthropic', question: 'Does the liability cap exclude confidentiality breaches from its scope?' }));
    const q = 'Does the liability cap cover confidentiality breaches?';
    // Mistral-recorded entry: served back to mistral, never to anthropic.
    const toAnthropic = b.search(q, 'review', 2, { userId: 'u', provider: 'anthropic' });
    expect(toAnthropic.every(p => p.provider === 'anthropic')).toBe(true);
    // Anthropic-recorded text may serve any provider (already egressed).
    const toMistral = b.search(q, 'review', 2, { userId: 'u', provider: 'mistral' });
    expect(toMistral.some(p => p.provider === 'mistral')).toBe(true);
    expect(toMistral.some(p => p.provider === 'anthropic')).toBe(true);
  });

  it('requires at least 3 shared meaningful tokens — short queries cannot saturate the ratio', () => {
    const b = new PrecedentBoard();
    b.record(entry());
    // Two shared tokens ("liability", "cap") would score 1.0 on the min()
    // denominator without the absolute floor.
    expect(b.search('liability cap')).toHaveLength(0);
  });

  it('counts citations', () => {
    const b = new PrecedentBoard();
    const p = b.record(entry());
    b.recordCitation(p.id);
    b.recordCitation(p.id);
    expect(b.table()[0].citations).toBe(2);
  });

  it('evicts oldest panel-resolved entries before human rulings at the cap', () => {
    const b = new PrecedentBoard();
    const gold = b.record(entry({ source: 'human-ruled', question: 'gold question about indemnity scope for third party claims' }));
    for (let i = 0; i < 505; i++) {
      b.record(entry({ question: `filler question number ${i} about clause interpretation topic ${i}` }));
    }
    const all = b.table();
    expect(all.length).toBeLessThanOrEqual(500);
    expect(all.some(p => p.id === gold.id)).toBe(true);
  });

  it('persists and reloads from disk', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hive-precedent-'));
    try {
      const b1 = new PrecedentBoard(dir);
      b1.record(entry());
      const b2 = new PrecedentBoard(dir);
      expect(b2.table()).toHaveLength(1);
      expect(b2.table()[0].ruling).toBe('cap does not apply');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
