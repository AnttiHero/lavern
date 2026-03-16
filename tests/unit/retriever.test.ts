/**
 * Unit Tests — Knowledge Base Retriever (src/knowledge-base/retriever.ts)
 *
 * Tests the FTS5 query sanitizer and legal synonym expansion.
 * DB-dependent functions (search, list, getChunk) are tested via integration tests.
 */

import { describe, it, expect } from 'vitest';
import { sanitizeFtsQuery } from '../../src/knowledge-base/retriever.js';

describe('sanitizeFtsQuery', () => {
  // ── Basic Sanitization ──────────────────────────────────────────────

  it('returns empty string for empty input', () => {
    expect(sanitizeFtsQuery('')).toBe('');
  });

  it('returns empty string for single character words', () => {
    expect(sanitizeFtsQuery('a b c')).toBe('');
  });

  it('returns empty for only special characters', () => {
    expect(sanitizeFtsQuery('!@#$%^&*()')).toBe('');
  });

  it('wraps words in quotes with OR', () => {
    const result = sanitizeFtsQuery('force majeure');
    expect(result).toContain('"force"');
    expect(result).toContain('"majeure"');
    expect(result).toContain(' OR ');
  });

  it('strips FTS5 operator characters (-, ", *)', () => {
    const result = sanitizeFtsQuery('term-ination "exact" match*');
    // Hyphens, quotes, asterisks should be stripped
    expect(result).not.toContain('-');
    expect(result).not.toContain('*');
    // The cleaned words should still be present
    expect(result).toContain('"term"');
  });

  it('strips backslashes', () => {
    const result = sanitizeFtsQuery('back\\slash');
    expect(result).not.toContain('\\');
  });

  it('filters out short words after stripping', () => {
    // "a" is too short after cleanup
    const result = sanitizeFtsQuery('the big a');
    expect(result).toContain('"the"');
    expect(result).toContain('"big"');
    // "a" is single char, filtered out
  });

  it('deduplicates words', () => {
    const result = sanitizeFtsQuery('test test test');
    const matches = result.match(/"test"/g);
    // Should appear exactly once (Set dedup in expandWithSynonyms)
    expect(matches?.length).toBe(1);
  });

  // ── Legal Synonym Expansion ────────────────────────────────────────

  it('expands indemnification with synonyms', () => {
    const result = sanitizeFtsQuery('indemnification');
    expect(result).toContain('"indemnification"');
    expect(result).toContain('"indemnity"');
    expect(result).toContain('"indemnify"');
  });

  it('expands termination with related terms', () => {
    const result = sanitizeFtsQuery('termination');
    expect(result).toContain('"termination"');
    // Should include at least some of: terminate, expiration, cancellation, etc.
    expect(result).toContain('"terminate"');
  });

  it('expands NDA with related terms', () => {
    const result = sanitizeFtsQuery('NDA');
    expect(result).toContain('"NDA"');
    // Should expand with "non disclosure", "nondisclosure"
    expect(result).toContain('"nondisclosure"');
  });

  it('expands arbitration with dispute resolution terms', () => {
    const result = sanitizeFtsQuery('arbitration');
    expect(result).toContain('"arbitration"');
    expect(result).toContain('"mediation"');
    expect(result).toContain('"ADR"');
  });

  it('does not expand non-legal terms', () => {
    const result = sanitizeFtsQuery('banana');
    expect(result).toBe('"banana"');
  });

  it('handles multi-word synonym phrases', () => {
    // "force majeure" is a synonym group with "act of God"
    const result = sanitizeFtsQuery('force majeure');
    expect(result).toContain('"force"');
    expect(result).toContain('"majeure"');
    // Multi-word synonyms from phrase matching are kept as complete phrases
    expect(result).toContain('"act of God"');
    expect(result).toContain('"unforeseeable circumstances"');
  });

  it('is case-insensitive for synonym matching', () => {
    const result = sanitizeFtsQuery('ARBITRATION');
    expect(result).toContain('"ARBITRATION"');
    expect(result).toContain('"mediation"');
  });

  // ── Edge Cases ─────────────────────────────────────────────────────

  it('handles very long queries', () => {
    const words = Array.from({ length: 100 }, (_, i) => `word${i}`);
    const result = sanitizeFtsQuery(words.join(' '));
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain('"word0"');
    expect(result).toContain('"word99"');
  });

  it('handles unicode characters', () => {
    const result = sanitizeFtsQuery('Vertrag Haftung');
    expect(result).toContain('"Vertrag"');
    expect(result).toContain('"Haftung"');
  });

  it('handles tabs and multiple spaces', () => {
    const result = sanitizeFtsQuery('  indemnity\t\tclaim  ');
    expect(result).toContain('"indemnity"');
    expect(result).toContain('"claim"');
  });

  it('handles numbers in queries', () => {
    const result = sanitizeFtsQuery('section 42 clause 10');
    expect(result).toContain('"section"');
    expect(result).toContain('"42"');
    expect(result).toContain('"clause"');
    expect(result).toContain('"10"');
  });
});
