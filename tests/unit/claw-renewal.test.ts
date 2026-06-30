/**
 * Unit Tests — Renewal Watcher (src/claw/renewal.ts)
 *
 * Covers deterministic extraction (auto-renew, notice period, anchor date,
 * cancel-by computation, confidence tiers) and the deadline checker's
 * lead-window / past-deadline behavior.
 */

import { describe, it, expect } from 'vitest';
import { extractRenewalTerms, checkRenewalDeadlines } from '../../src/claw/renewal.js';
import type { DocumentRegistry } from '../../src/claw/registry.js';
import type { DocumentEntry, RenewalTerms } from '../../src/claw/types.js';

describe('extractRenewalTerms', () => {
  it('extracts auto-renew + notice + explicit renewal date → high confidence + cancel-by', () => {
    const text =
      'This Agreement shall automatically renew for successive one-year terms. ' +
      'The renewal date is January 15, 2026. Either party may terminate upon ' +
      "thirty (30) days' written notice prior to the renewal date.";
    const t = extractRenewalTerms(text);
    expect(t).not.toBeNull();
    expect(t!.autoRenew).toBe(true);
    expect(t!.noticePeriodDays).toBe(30);
    expect(t!.anchorKind).toBe('renewal');
    expect(t!.anchorDate).toBe('2026-01-15');
    expect(t!.cancelByDate).toBe('2025-12-16'); // 30 days before renewal
    expect(t!.confidence).toBe('high');
  });

  it('explicit expiration date with no notice → medium confidence, no cancel-by', () => {
    const t = extractRenewalTerms('This Agreement expires on December 31, 2026 unless renewed by the parties.');
    expect(t).not.toBeNull();
    expect(t!.anchorKind).toBe('expiration');
    expect(t!.anchorDate).toBe('2026-12-31');
    expect(t!.cancelByDate).toBeUndefined();
    expect(t!.confidence).toBe('medium');
  });

  it('relative terms only (no calendar date) → low confidence, no fabricated date', () => {
    const t = extractRenewalTerms('The Agreement renews for successive one-year terms unless either party provides sixty (60) days notice.');
    expect(t).not.toBeNull();
    expect(t!.autoRenew).toBe(true);
    expect(t!.noticePeriodDays).toBe(60);
    expect(t!.anchorDate).toBeUndefined();
    expect(t!.cancelByDate).toBeUndefined();
    expect(t!.confidence).toBe('low');
  });

  it('returns null for documents with no renewal signal', () => {
    expect(extractRenewalTerms('This privacy policy explains how we collect and use cookies.')).toBeNull();
  });
});

describe('checkRenewalDeadlines', () => {
  function fakeRegistry(terms: Record<string, RenewalTerms | undefined>): DocumentRegistry {
    const documents: Record<string, DocumentEntry> = {};
    for (const [hash, t] of Object.entries(terms)) {
      documents[hash] = {
        path: `/x/${hash}.pdf`, name: `${hash}.pdf`, type: 'Contract', hash,
        sizeBytes: 1, firstSeen: '', lastModified: '', status: 'reviewed',
        ...(t ? { renewalTerms: t } : {}),
      };
    }
    return { getState: () => ({ documents }) } as unknown as DocumentRegistry;
  }

  const now = new Date('2026-06-01T00:00:00Z');

  it('alerts only on deadlines inside the lead window, soonest first', () => {
    const reg = fakeRegistry({
      soon: { autoRenew: true, cancelByDate: '2026-06-11', confidence: 'high' },        // +10d → alert
      veryClose: { autoRenew: false, cancelByDate: '2026-06-03', confidence: 'high' },  // +2d → alert
      farOff: { autoRenew: true, anchorDate: '2026-09-09', anchorKind: 'renewal', confidence: 'medium' }, // +100d → no
      past: { autoRenew: false, cancelByDate: '2026-05-27', confidence: 'high' },       // -5d, not renewing → no
      noTerms: undefined,
    });

    const alerts = checkRenewalDeadlines(reg, 30, now);
    expect(alerts.map(a => a.hash)).toEqual(['veryClose', 'soon']); // sorted by daysLeft
    expect(alerts[0].daysLeft).toBe(2);
    expect(alerts[0].kind).toBe('cancel-by');
    expect(alerts[1].daysLeft).toBe(10);
  });

  it('flags an auto-renewer with a recently-passed anchor for review instead of dropping it', () => {
    const reg = fakeRegistry({
      lapsed: { autoRenew: true, cancelByDate: '2026-05-01', confidence: 'high' },   // ~31d ago, auto-renews → review
      ancient: { autoRenew: true, cancelByDate: '2024-01-01', confidence: 'high' },  // >1y ago → skip
      nonRenew: { autoRenew: false, cancelByDate: '2026-05-01', confidence: 'high' },// past, not renewing → skip
    });
    const alerts = checkRenewalDeadlines(reg, 30, now);
    expect(alerts.map(a => a.hash)).toEqual(['lapsed']);
    expect(alerts[0].needsReview).toBe(true);
  });

  it('parses real contract dates safely — rejects rollover and ambiguous numeric dates', () => {
    expect(extractRenewalTerms('This Agreement expires on February 30, 2026.')).toBeNull(); // invalid → no anchor → no terms
    const ok = extractRenewalTerms('This Agreement expires on 31/12/2026 unless renewed.'); // 31 > 12 → d/m/y, unambiguous
    expect(ok?.anchorDate).toBe('2026-12-31');
    const ambiguous = extractRenewalTerms('This Agreement expires on 03/04/2026 unless renewed.'); // both <= 12 → skipped
    expect(ambiguous?.anchorDate).toBeUndefined();
  });

  it('falls back to anchorDate when there is no cancel-by, and respects the lead window', () => {
    const reg = fakeRegistry({
      exp: { autoRenew: false, anchorDate: '2026-06-20', anchorKind: 'expiration', confidence: 'medium' }, // +19d
    });
    const alerts = checkRenewalDeadlines(reg, 30, now);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].kind).toBe('expiration');
    expect(alerts[0].deadlineDate).toBe('2026-06-20');
  });
});
