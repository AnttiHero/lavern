/**
 * Unit Tests — Anonymization (src/claw/anonymize.ts)
 *
 * Tests anonymize(), deanonymize(), and deanonymizeFindings()
 * for PII replacement, round-trip reversal, and edge cases.
 */

import { describe, it, expect } from 'vitest';
import { anonymize, deanonymize, deanonymizeFindings } from '../../src/claw/anonymize.js';

// ── anonymize() — Party Names ──────────────────────────────────────────

describe('anonymize — party names', () => {
  it('replaces defined terms with [PARTY_N] placeholders', () => {
    const text = 'Acme Corp agrees to provide services to Globex Inc.';
    const result = anonymize(text, ['Acme Corp', 'Globex Inc']);
    // Longest term is processed first, so Globex Inc (10 chars) → PARTY_1, Acme Corp (9 chars) → PARTY_2
    expect(result.anonymizedText).toBe('[PARTY_2] agrees to provide services to [PARTY_1].');
    expect(result.stats.parties).toBe(2);
  });

  it('same entity gets same placeholder across multiple occurrences', () => {
    const text = 'Acme Corp shall pay. Acme Corp shall also deliver.';
    const result = anonymize(text, ['Acme Corp']);
    expect(result.anonymizedText).toBe('[PARTY_1] shall pay. [PARTY_1] shall also deliver.');
    expect(result.stats.parties).toBe(1);
    expect(result.mappings.length).toBe(1);
  });

  it('skips common legal terms (Agreement, Services, etc.)', () => {
    const text = 'The Agreement governs the Services provided.';
    const result = anonymize(text, ['Agreement', 'Services', 'Confidential Information', 'Effective Date', 'Term', 'Party', 'Parties']);
    expect(result.anonymizedText).toBe(text);
    expect(result.stats.parties).toBe(0);
  });

  it('handles unicode/accented party names', () => {
    const text = 'Societe Generale and Muller GmbH entered into this agreement.';
    const result = anonymize(text, ['Societe Generale', 'Muller GmbH']);
    expect(result.anonymizedText).toContain('[PARTY_1]');
    expect(result.anonymizedText).toContain('[PARTY_2]');
    expect(result.stats.parties).toBe(2);
  });

  it('handles no defined terms gracefully', () => {
    const text = 'This is a simple document.';
    const result = anonymize(text);
    expect(result.stats.parties).toBe(0);
  });
});

// ── anonymize() — Monetary Amounts ─────────────────────────────────────

describe('anonymize — monetary amounts', () => {
  it('replaces $-prefixed amounts', () => {
    const text = 'The penalty shall be $1,000,000.';
    const result = anonymize(text);
    expect(result.anonymizedText).toContain('[AMOUNT_');
    expect(result.anonymizedText).not.toContain('$1,000,000');
    expect(result.stats.amounts).toBeGreaterThanOrEqual(1);
  });

  it('replaces EUR-prefixed amounts', () => {
    const text = 'The fee is EUR 5,000.';
    const result = anonymize(text);
    expect(result.anonymizedText).toContain('[AMOUNT_');
    expect(result.anonymizedText).not.toContain('EUR 5,000');
  });

  it('replaces USD-prefixed amounts', () => {
    const text = 'Total liability capped at USD 50,000.';
    const result = anonymize(text);
    expect(result.anonymizedText).toContain('[AMOUNT_');
    expect(result.anonymizedText).not.toContain('USD 50,000');
  });

  it('replaces euro symbol amounts', () => {
    const text = 'Payment of \u20AC5,000 is due.';
    const result = anonymize(text);
    expect(result.anonymizedText).toContain('[AMOUNT_');
    expect(result.stats.amounts).toBeGreaterThanOrEqual(1);
  });

  it('assigns unique placeholders to different amounts', () => {
    const text = 'First fee: $10,000. Second fee: $20,000.';
    const result = anonymize(text);
    expect(result.stats.amounts).toBe(2);
  });
});

// ── anonymize() — Dates ────────────────────────────────────────────────

describe('anonymize — dates', () => {
  it('replaces long-form dates (January 15, 2024)', () => {
    const text = 'Effective as of January 15, 2024.';
    const result = anonymize(text);
    expect(result.anonymizedText).toContain('[DATE_');
    expect(result.anonymizedText).not.toContain('January 15, 2024');
  });

  it('replaces slash dates (01/15/2024)', () => {
    const text = 'Signed on 01/15/2024.';
    const result = anonymize(text);
    expect(result.anonymizedText).toContain('[DATE_');
    expect(result.anonymizedText).not.toContain('01/15/2024');
  });

  it('replaces ISO dates (2024-01-15)', () => {
    const text = 'Deadline: 2024-01-15.';
    const result = anonymize(text);
    expect(result.anonymizedText).toContain('[DATE_');
    expect(result.anonymizedText).not.toContain('2024-01-15');
  });

  it('replaces ordinal dates (15th day of January, 2024)', () => {
    const text = 'The 15th day of January, 2024.';
    const result = anonymize(text);
    expect(result.anonymizedText).toContain('[DATE_');
    expect(result.stats.dates).toBeGreaterThanOrEqual(1);
  });
});

// ── anonymize() — Email Addresses ──────────────────────────────────────

describe('anonymize — emails', () => {
  it('replaces email addresses', () => {
    const text = 'Contact us at legal@acme-corp.com for questions.';
    const result = anonymize(text);
    expect(result.anonymizedText).toContain('[EMAIL_1]');
    expect(result.anonymizedText).not.toContain('legal@acme-corp.com');
    expect(result.stats.emails).toBe(1);
  });

  it('replaces multiple emails', () => {
    const text = 'Notice to alice@example.com and bob@example.org.';
    const result = anonymize(text);
    expect(result.stats.emails).toBe(2);
  });
});

// ── anonymize() — Phone Numbers ────────────────────────────────────────

describe('anonymize — phones', () => {
  it('replaces US-format phone numbers', () => {
    const text = 'Call +1 (555) 123-4567 for support.';
    const result = anonymize(text);
    expect(result.anonymizedText).toContain('[PHONE_');
    expect(result.anonymizedText).not.toContain('555');
    expect(result.stats.phones).toBeGreaterThanOrEqual(1);
  });
});

// ── anonymize() — Structure Preservation ───────────────────────────────

describe('anonymize — structure preservation', () => {
  it('preserves section numbers and headings', () => {
    const text = '## Section 4.2 — Indemnification\n\n4.2.1 The Licensee shall indemnify...';
    const result = anonymize(text, ['Licensee']);
    expect(result.anonymizedText).toContain('## Section 4.2');
    expect(result.anonymizedText).toContain('4.2.1');
    expect(result.anonymizedText).toContain('[PARTY_1]');
  });
});

// ── anonymize() — Determinism & Stats ──────────────────────────────────

describe('anonymize — determinism and stats', () => {
  it('is deterministic (same input = same output)', () => {
    const text = 'Acme Corp pays $500,000 on January 1, 2025.';
    const terms = ['Acme Corp'];
    const r1 = anonymize(text, terms);
    const r2 = anonymize(text, terms);
    expect(r1.anonymizedText).toBe(r2.anonymizedText);
    expect(r1.mappings).toEqual(r2.mappings);
    expect(r1.stats).toEqual(r2.stats);
  });

  it('stats accurately reflect unique entity counts', () => {
    const text = 'Acme Corp and Globex Inc signed on January 1, 2025 for $100,000. Contact: info@acme.com.';
    const result = anonymize(text, ['Acme Corp', 'Globex Inc']);
    expect(result.stats.parties).toBe(2);
    expect(result.stats.amounts).toBeGreaterThanOrEqual(1);
    expect(result.stats.dates).toBeGreaterThanOrEqual(1);
    expect(result.stats.emails).toBe(1);
  });
});

// ── deanonymize() — Round-trip ─────────────────────────────────────────

describe('deanonymize', () => {
  it('perfectly reverses anonymization (round-trip)', () => {
    const original = 'Acme Corp shall pay Globex Inc $1,000,000 by January 15, 2025.';
    const { anonymizedText, mappings } = anonymize(original, ['Acme Corp', 'Globex Inc']);
    const restored = deanonymize(anonymizedText, mappings);
    expect(restored).toBe(original);
  });

  it('handles multiple occurrences of same entity', () => {
    const original = 'Acme Corp agrees. Acme Corp shall also comply. Acme Corp warrants.';
    const { anonymizedText, mappings } = anonymize(original, ['Acme Corp']);
    expect(anonymizedText).not.toContain('Acme Corp');
    const restored = deanonymize(anonymizedText, mappings);
    expect(restored).toBe(original);
  });

  it('is a no-op when no mappings exist', () => {
    const text = 'Plain text without entities.';
    expect(deanonymize(text, [])).toBe(text);
  });
});

// ── deanonymizeFindings() ──────────────────────────────────────────────

describe('deanonymizeFindings', () => {
  it('replaces placeholders in content and evidence', () => {
    const { mappings } = anonymize('Acme Corp owes $500,000.', ['Acme Corp']);
    const findings = [
      { content: 'Risk: [PARTY_1] clause is broad', evidence: 'See [AMOUNT_1] cap' },
    ];
    const result = deanonymizeFindings(findings, mappings);
    expect(result[0].content).toContain('Acme Corp');
    expect(result[0].evidence).toContain('$500,000');
  });

  it('preserves undefined evidence', () => {
    const { mappings } = anonymize('Acme Corp.', ['Acme Corp']);
    const findings = [{ content: '[PARTY_1] is liable' }];
    const result = deanonymizeFindings(findings, mappings);
    expect(result[0].content).toContain('Acme Corp');
    expect(result[0].evidence).toBeUndefined();
  });

  it('returns empty array for empty input', () => {
    expect(deanonymizeFindings([], [])).toEqual([]);
  });
});

// ── Edge Cases ─────────────────────────────────────────────────────────

describe('anonymize — edge cases', () => {
  it('handles empty text', () => {
    const result = anonymize('', ['Acme']);
    expect(result.anonymizedText).toBe('');
    expect(result.mappings).toEqual([]);
    expect(result.stats.parties).toBe(0);
  });

  it('handles text with no matching entities', () => {
    const text = 'This document contains no recognizable entities.';
    const result = anonymize(text);
    expect(result.anonymizedText).toBe(text);
    expect(result.mappings).toEqual([]);
  });

  it('handles text that is entirely entities', () => {
    const text = 'Acme Corp';
    const result = anonymize(text, ['Acme Corp']);
    expect(result.anonymizedText).toBe('[PARTY_1]');
    expect(result.stats.parties).toBe(1);
  });
});
