/**
 * Unit Tests — Hivemind panel composition + panel ledger (src/orchestration/panels.ts).
 *
 * In-memory ledger, explicit pools — no config/env dependence except where a
 * test says so. Covers cold-start priors, measured override, decorrelation
 * preference, and outcome recording.
 */

import { describe, it, expect } from 'vitest';
import { composePanel, recordPanelistOutcomes, PANELIST_ROLE } from '../../src/orchestration/panels.js';
import { PerformanceLedger } from '../../src/orchestration/performance-ledger.js';
import { defaultPanel } from '../../src/orchestration/dissent.js';
import type { PanelMember, DissentVerdict } from '../../src/orchestration/dissent.js';

const POOL: PanelMember[] = [
  { key: 'opus', label: 'Opus', provider: 'anthropic', model: 'claude-opus-4-8' },
  { key: 'sonnet', label: 'Sonnet', provider: 'anthropic', model: 'claude-sonnet-5' },
  { key: 'mistral', label: 'Mistral Large', provider: 'mistral', model: 'mistral-large-latest' },
];

describe('composePanel', () => {
  it('returns the pool unchanged when it is not larger than the panel size', () => {
    const ledger = new PerformanceLedger();
    expect(composePanel('review', ledger, 2, POOL.slice(0, 2))).toHaveLength(2);
    expect(composePanel('review', ledger, 3, POOL)).toEqual(POOL);
  });

  it('cold-starts on priors and prefers a different provider for the second seat', () => {
    const ledger = new PerformanceLedger();
    const panel = composePanel('review', ledger, 2, POOL);
    // Opus has the highest prior; second seat goes cross-provider (Mistral)
    // over the same-provider Sonnet even though Sonnet's prior is higher.
    expect(panel[0].model).toBe('claude-opus-4-8');
    expect(panel[1].provider).toBe('mistral');
  });

  it('lets measured data override the prior ranking once a cell has enough observations', () => {
    const ledger = new PerformanceLedger();
    // Sonnet measured excellent, Opus measured poor, on this matter type (3 obs each)
    for (let i = 0; i < 3; i++) {
      ledger.record('review', PANELIST_ROLE, 'claude-sonnet-5', 1);
      ledger.record('review', PANELIST_ROLE, 'claude-opus-4-8', 0);
    }
    const panel = composePanel('review', ledger, 2, POOL);
    expect(panel[0].model).toBe('claude-sonnet-5');
    // Decorrelation still pulls the second seat cross-provider
    expect(panel[1].provider).toBe('mistral');
  });

  it('ignores measured cells below the observation threshold', () => {
    const ledger = new PerformanceLedger();
    ledger.record('review', PANELIST_ROLE, 'claude-sonnet-5', 1); // only 1 obs
    const panel = composePanel('review', ledger, 2, POOL);
    expect(panel[0].model).toBe('claude-opus-4-8'); // priors still rule
  });

  it('fills same-provider seats when no other provider remains', () => {
    const ledger = new PerformanceLedger();
    const anthropicOnly = POOL.slice(0, 2);
    const panel = composePanel('review', ledger, 2, anthropicOnly);
    expect(panel.map(p => p.provider)).toEqual(['anthropic', 'anthropic']);
    expect(new Set(panel.map(p => p.model)).size).toBe(2); // distinct models
  });
});

describe('recordPanelistOutcomes', () => {
  // 3 ANSWERING panelists — the minimum for ledger credit: on a 2-seat panel
  // a resolved split just means one panelist flipped, which is not a signal.
  const verdicts: DissentVerdict[] = [
    { member: 'Opus', provider: 'anthropic', model: 'claude-opus-4-8', label: 'capped at fees', quote: '', rationale: '', confidence: 'high' },
    { member: 'Sonnet', provider: 'anthropic', model: 'claude-sonnet-5', label: 'uncapped', quote: '', rationale: '', confidence: 'medium' },
    { member: 'Mistral', provider: 'mistral', model: 'mistral-large-latest', label: 'capped at fees', quote: '', rationale: '', confidence: 'medium' },
  ];

  it('credits correct first-round verdicts and debits wrong ones', () => {
    const ledger = new PerformanceLedger();
    recordPanelistOutcomes(ledger, 'review', verdicts, 'capped at fees');
    expect(ledger.qualityFor('review', PANELIST_ROLE, 'claude-opus-4-8')).toEqual({ ewma: 1, n: 1 });
    expect(ledger.qualityFor('review', PANELIST_ROLE, 'claude-sonnet-5')).toEqual({ ewma: 0, n: 1 });
    expect(ledger.qualityFor('review', PANELIST_ROLE, 'mistral-large-latest')).toEqual({ ewma: 1, n: 1 });
  });

  it('records nothing with fewer than 3 answering panelists (2-seat unanimity is not a signal)', () => {
    const ledger = new PerformanceLedger();
    recordPanelistOutcomes(ledger, 'review', verdicts.slice(0, 2), 'capped at fees');
    expect(ledger.qualityFor('review', PANELIST_ROLE, 'claude-opus-4-8')).toBeUndefined();
    expect(ledger.qualityFor('review', PANELIST_ROLE, 'claude-sonnet-5')).toBeUndefined();
  });

  it('errored panelists do not count toward the 3-answer minimum and get no cell', () => {
    const ledger = new PerformanceLedger();
    const withError: DissentVerdict[] = [
      ...verdicts.slice(0, 2),
      { member: 'Down', provider: 'mistral', model: 'mistral-large-latest', label: 'error', quote: '', rationale: '', confidence: 'unknown', error: 'down' },
    ];
    recordPanelistOutcomes(ledger, 'review', withError, 'capped at fees');
    expect(ledger.qualityFor('review', PANELIST_ROLE, 'claude-opus-4-8')).toBeUndefined();
    expect(ledger.qualityFor('review', PANELIST_ROLE, 'mistral-large-latest')).toBeUndefined();
  });

  it('feeds composePanel: a consistently-right panelist earns the top seat', () => {
    const ledger = new PerformanceLedger();
    for (let i = 0; i < 3; i++) recordPanelistOutcomes(ledger, 'review', verdicts, 'capped at fees');
    const panel = composePanel('review', ledger, 2, POOL);
    expect(panel[0].model).toBe('claude-opus-4-8');
  });
});

describe('defaultPanel provider threading', () => {
  it('composes an EU panel for a mistral engagement regardless of the global provider', () => {
    const panel = defaultPanel('mistral');
    expect(panel.length).toBeGreaterThanOrEqual(2);
    expect(panel.every(m => m.provider === 'mistral')).toBe(true);
  });

  it('composes a single local member for a local engagement (quorum then skips: <2 seats)', () => {
    const panel = defaultPanel('local');
    expect(panel).toHaveLength(1);
    expect(panel[0].provider).toBe('local');
  });
});
