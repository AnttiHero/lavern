/**
 * Unit Tests — Reader Templates (src/claw/reader-templates.ts)
 *
 * Lighthouse Phase 6: per-document-type per-clause prompts. Watchman picks
 * the documentType, Reader uses the matching template. The article claims
 * eight specialised templates exist (jv / nda / employment / lease / loan /
 * saas / policy / generic). These tests prove that claim:
 *
 *   - readerTemplate() returns each documented type
 *   - Each template is materially different (not stubs sharing one body)
 *   - Each template includes the common output schema + rules so the
 *     synthesis step doesn't break when the template changes
 *   - Unknown / undefined / non-string inputs fall back to generic
 *   - Fallback never throws and always returns a non-empty prompt
 */

import { describe, it, expect } from 'vitest';
import { readerTemplate, READER_TEMPLATES } from '../../src/claw/reader-templates.js';
import type { WatchmanDocumentType } from '../../src/claw/types.js';

const ALL_TYPES: WatchmanDocumentType[] = [
  'jv', 'nda', 'employment', 'lease', 'loan', 'saas', 'policy', 'other',
];

describe('readerTemplate · type coverage', () => {
  it('returns a non-empty prompt for every Watchman document type', () => {
    for (const t of ALL_TYPES) {
      const tmpl = readerTemplate(t);
      expect(typeof tmpl).toBe('string');
      expect(tmpl.length).toBeGreaterThan(200);
    }
  });

  it('exposes one template per WatchmanDocumentType in READER_TEMPLATES', () => {
    for (const t of ALL_TYPES) {
      expect(READER_TEMPLATES[t]).toBeDefined();
    }
    expect(Object.keys(READER_TEMPLATES).length).toBe(ALL_TYPES.length);
  });
});

describe('readerTemplate · differentiation (templates are not stubs)', () => {
  it('every contract-type template is distinct from the generic template', () => {
    const generic = readerTemplate('other');
    for (const t of ALL_TYPES.filter(x => x !== 'other')) {
      const specific = readerTemplate(t);
      expect(specific).not.toBe(generic);
    }
  });

  it('every contract-type template differs from every other contract-type template', () => {
    const seen = new Map<string, WatchmanDocumentType>();
    for (const t of ALL_TYPES) {
      const tmpl = readerTemplate(t);
      const prior = seen.get(tmpl);
      expect(prior, `templates for ${t} and ${prior} are identical`).toBeUndefined();
      seen.set(tmpl, t);
    }
  });
});

describe('readerTemplate · domain-specific signals', () => {
  // A specialised template should mention domain-specific risk vocabulary
  // the generic prompt would NOT mention. These string searches let us
  // catch a copy-paste regression where a template was overwritten with
  // generic content.

  it('jv template mentions JV-specific concepts', () => {
    const tmpl = readerTemplate('jv').toLowerCase();
    expect(tmpl).toMatch(/joint venture|operator|non-operator|cash call|reserved matter/);
  });

  it('nda template mentions confidentiality + carve-outs', () => {
    const tmpl = readerTemplate('nda').toLowerCase();
    expect(tmpl).toMatch(/confidential|carve-out|residual/);
  });

  it('employment template mentions vesting / non-compete / arbitration', () => {
    const tmpl = readerTemplate('employment').toLowerCase();
    expect(tmpl).toMatch(/vesting|non-compete|arbitration|severance/);
  });

  it('lease template mentions rent / SNDA / casualty', () => {
    const tmpl = readerTemplate('lease').toLowerCase();
    expect(tmpl).toMatch(/rent|snda|casualty|cam|tenant/);
  });

  it('loan template mentions covenants / SOFR / events of default', () => {
    const tmpl = readerTemplate('loan').toLowerCase();
    expect(tmpl).toMatch(/covenant|sofr|events of default|leverage/);
  });

  it('saas template mentions SLA / data ownership / DPA', () => {
    const tmpl = readerTemplate('saas').toLowerCase();
    expect(tmpl).toMatch(/service level|uptime|data|dpa|subprocessor/);
  });

  it('policy template mentions consumer / arbitration / dark pattern', () => {
    const tmpl = readerTemplate('policy').toLowerCase();
    expect(tmpl).toMatch(/consumer|arbitration|dark[\s-]pattern|tracking|cookie/);
  });
});

describe('readerTemplate · common contract', () => {
  it('every template includes the common output schema (so synthesis works)', () => {
    for (const t of ALL_TYPES) {
      const tmpl = readerTemplate(t);
      expect(tmpl).toContain('clauseRiskSummary');
      expect(tmpl).toContain('operative_text');
      expect(tmpl).toContain('concerns');
      expect(tmpl).toContain('favoursWhom');
    }
  });

  it('every template includes the common rules (so output stays grounded)', () => {
    for (const t of ALL_TYPES) {
      const tmpl = readerTemplate(t);
      // Common rules call out severity scale + anchor requirement
      expect(tmpl.toLowerCase()).toMatch(/critical/);
      expect(tmpl.toLowerCase()).toMatch(/severity/);
    }
  });
});

describe('readerTemplate · fallback safety', () => {
  it('falls back to generic for an unknown string type', () => {
    const generic = readerTemplate('other');
    expect(readerTemplate('cryptocurrency-thing')).toBe(generic);
    expect(readerTemplate('FRANCHISE')).toBe(generic);
    expect(readerTemplate('')).toBe(generic);
  });

  it('falls back to generic for undefined input', () => {
    const generic = readerTemplate('other');
    expect(readerTemplate(undefined)).toBe(generic);
  });

  it('falls back to generic for non-string input (defensive)', () => {
    const generic = readerTemplate('other');
    // @ts-expect-error — deliberately passing wrong type
    expect(readerTemplate(null)).toBe(generic);
    // @ts-expect-error — deliberately passing wrong type
    expect(readerTemplate(42)).toBe(generic);
    // @ts-expect-error — deliberately passing wrong type
    expect(readerTemplate({})).toBe(generic);
  });

  it('never throws on adversarial input', () => {
    // @ts-expect-error — deliberately passing wrong type
    expect(() => readerTemplate(Symbol('x'))).not.toThrow();
    expect(() => readerTemplate('a'.repeat(1000))).not.toThrow();
    expect(() => readerTemplate('../../../etc/passwd')).not.toThrow();
  });
});
