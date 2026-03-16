/**
 * Unit Tests — Knowledge Base Synonym Search
 *
 * Tests the legal synonym expansion in the FTS5 query sanitizer.
 * Ensures that searches for common legal terms find related concepts.
 */

import { describe, it, expect } from 'vitest';
import { sanitizeFtsQuery } from '../../src/knowledge-base/retriever.js';

describe('sanitizeFtsQuery', () => {
  it('returns empty string for empty/whitespace input', () => {
    expect(sanitizeFtsQuery('')).toBe('');
    expect(sanitizeFtsQuery('   ')).toBe('');
    expect(sanitizeFtsQuery('a')).toBe(''); // single char filtered
  });

  it('produces basic OR query for simple words', () => {
    const result = sanitizeFtsQuery('contract review');
    expect(result).toContain('"contract"');
    expect(result).toContain('"review"');
    expect(result).toContain('OR');
  });

  it('strips special characters', () => {
    const result = sanitizeFtsQuery('LLC vs. Inc.');
    expect(result).not.toContain('.');
    expect(result).toContain('"LLC"');
    expect(result).toContain('"Inc"');
  });

  // ── Synonym Expansion Tests ──

  it('expands "indemnification" to include "indemnity" and "hold harmless"', () => {
    const result = sanitizeFtsQuery('indemnification clause');
    expect(result).toContain('"indemnification"');
    expect(result).toContain('"indemnity"');
    // "hold harmless" is multi-word, individual words should be added
    expect(result).toContain('"hold"');
    expect(result).toContain('"harmless"');
  });

  it('expands "termination" to include "cancellation" and "expire"', () => {
    const result = sanitizeFtsQuery('termination provisions');
    expect(result).toContain('"termination"');
    expect(result).toContain('"cancellation"');
    expect(result).toContain('"expire"');
  });

  it('expands "arbitration" to include "mediation" and "dispute resolution"', () => {
    const result = sanitizeFtsQuery('arbitration agreement');
    expect(result).toContain('"arbitration"');
    expect(result).toContain('"mediation"');
    expect(result).toContain('"dispute"');
    expect(result).toContain('"resolution"');
  });

  it('expands "confidential" to include "proprietary" and "trade secret"', () => {
    const result = sanitizeFtsQuery('confidential information');
    expect(result).toContain('"confidential"');
    expect(result).toContain('"proprietary"');
    expect(result).toContain('"trade"');
    expect(result).toContain('"secret"');
  });

  it('expands "jurisdiction" to include "venue" and "forum"', () => {
    const result = sanitizeFtsQuery('jurisdiction clause');
    expect(result).toContain('"jurisdiction"');
    expect(result).toContain('"venue"');
    expect(result).toContain('"forum"');
  });

  it('expands "warranty" to include "guarantee"', () => {
    const result = sanitizeFtsQuery('warranty provisions');
    expect(result).toContain('"warranty"');
    expect(result).toContain('"guarantee"');
  });

  it('expands "amendment" to include "modification"', () => {
    const result = sanitizeFtsQuery('amendment process');
    expect(result).toContain('"amendment"');
    expect(result).toContain('"modification"');
  });

  it('does not expand unrelated terms', () => {
    const result = sanitizeFtsQuery('quarterly revenue report');
    // None of these words are in the synonym groups
    const terms = result.split(' OR ').map(t => t.replace(/"/g, '').trim());
    expect(terms).toContain('quarterly');
    expect(terms).toContain('revenue');
    expect(terms).toContain('report');
    // Should not have random extra terms
    expect(terms.length).toBeLessThanOrEqual(4);
  });

  it('handles case-insensitive synonym matching', () => {
    const result = sanitizeFtsQuery('GDPR compliance');
    expect(result).toContain('"GDPR"');
    expect(result).toContain('"compliance"');
    // compliance should expand
    expect(result).toContain('"regulatory"');
  });

  it('handles multi-word synonym phrases in query', () => {
    const result = sanitizeFtsQuery('force majeure clause');
    expect(result).toContain('"force"');
    expect(result).toContain('"majeure"');
    // The multi-word phrase "force majeure" should trigger synonym expansion
    // Multi-word synonyms are kept as FTS5 phrase queries
    expect(result).toContain('"act of God"');
    expect(result).toContain('"unforeseeable circumstances"');
  });

  it('deduplicates expanded terms', () => {
    const result = sanitizeFtsQuery('license licensing');
    const terms = result.split(' OR ').map(t => t.trim());
    // Each quoted term should appear only once
    const uniqueTerms = new Set(terms);
    expect(terms.length).toBe(uniqueTerms.size);
  });
});
