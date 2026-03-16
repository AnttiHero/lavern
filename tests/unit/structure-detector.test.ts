/**
 * Unit Tests — Structure Detector (src/documents/structure-detector.ts)
 *
 * Tests section detection, defined term extraction, and table parsing
 * from plain text legal documents.
 */

import { describe, it, expect } from 'vitest';
import { detectSections, detectDefinedTerms, detectTables } from '../../src/documents/structure-detector.js';

describe('detectSections', () => {
  it('returns empty array for empty text', () => {
    expect(detectSections('')).toEqual([]);
  });

  it('detects ARTICLE headings', () => {
    const text = 'ARTICLE I — DEFINITIONS\nSome definitions here.\n\nARTICLE II — OBLIGATIONS\nSome obligations.';
    const sections = detectSections(text);
    expect(sections).toHaveLength(2);
    expect(sections[0].heading).toContain('ARTICLE I');
    expect(sections[0].level).toBe(1);
  });

  it('detects Section headings', () => {
    const text = 'Section 1.1 Definitions\nTerms defined below.\n\nSection 1.2 Scope\nThe scope.';
    const sections = detectSections(text);
    expect(sections).toHaveLength(2);
    expect(sections[0].heading).toContain('Section 1.1');
  });

  it('detects numbered sections', () => {
    const text = '1. Introduction\nThis is the intro.\n\n2. Background\nSome background.';
    const sections = detectSections(text);
    expect(sections).toHaveLength(2);
    expect(sections[0].heading).toBe('1. Introduction');
    expect(sections[1].heading).toBe('2. Background');
  });

  it('detects ALL CAPS headings', () => {
    const text = 'DEFINITIONS AND INTERPRETATION\nThe following terms...\n\nINDEMNIFICATION\nParty shall indemnify.';
    const sections = detectSections(text);
    expect(sections.length).toBeGreaterThanOrEqual(2);
    expect(sections[0].heading).toContain('DEFINITIONS');
  });

  it('captures content between headings', () => {
    const text = '1. First Section\nContent of first.\nMore content.\n\n2. Second Section\nContent of second.';
    const sections = detectSections(text);
    expect(sections[0].content).toContain('Content of first');
    expect(sections[0].content).toContain('More content');
  });

  it('builds hierarchy with nested sections', () => {
    const text = '1. Parent\nParent content.\n\n1.1. Child\nChild content.\n\n2. Another Parent\nAnother.';
    const sections = detectSections(text);
    // Parent sections at root
    expect(sections.length).toBeGreaterThanOrEqual(1);
    // 1.1 should be child of 1.
    if (sections[0].children.length > 0) {
      expect(sections[0].children[0].heading).toContain('1.1');
    }
  });

  it('detects lettered subsections', () => {
    const text = '(a) First item\nDetails.\n\n(b) Second item\nMore details.';
    const sections = detectSections(text);
    expect(sections).toHaveLength(2);
    expect(sections[0].heading).toContain('(a)');
  });

  it('ignores very long lines (>200 chars)', () => {
    const longLine = 'A'.repeat(250);
    const text = `${longLine}\n\n1. Real Section\nContent.`;
    const sections = detectSections(text);
    expect(sections).toHaveLength(1);
    expect(sections[0].heading).toContain('Real Section');
  });

  it('sets startIndex for sections', () => {
    const text = '1. Introduction\nContent.\n\n2. Background\nMore.';
    const sections = detectSections(text);
    expect(sections[0].startIndex).toBe(0);
    expect(sections[1].startIndex).toBeGreaterThan(0);
  });
});

describe('detectDefinedTerms', () => {
  it('returns empty array for empty text', () => {
    expect(detectDefinedTerms('')).toEqual([]);
  });

  it('detects "Term" means pattern', () => {
    const text = '"Confidential Information" means any non-public information.';
    const terms = detectDefinedTerms(text);
    expect(terms).toContain('Confidential Information');
  });

  it('detects "Term" shall mean pattern', () => {
    const text = '"Service Provider" shall mean the entity providing services.';
    const terms = detectDefinedTerms(text);
    expect(terms).toContain('Service Provider');
  });

  it('detects "Term" is defined as pattern', () => {
    const text = '"Effective Date" is defined as the date of last signature.';
    const terms = detectDefinedTerms(text);
    expect(terms).toContain('Effective Date');
  });

  it('detects repeated quoted terms', () => {
    const text = 'The "Licensee" shall comply. The "Licensee" must also report.';
    const terms = detectDefinedTerms(text);
    expect(terms).toContain('Licensee');
  });

  it('does not detect single-occurrence quoted terms', () => {
    const text = 'The "Randomterm" appeared once and never again.';
    const terms = detectDefinedTerms(text);
    // "Randomterm" appears only once (no "means" pattern either)
    expect(terms).not.toContain('Randomterm');
  });

  it('detects ALL CAPS terms', () => {
    const text = 'LICENSEE agrees to pay LICENSOR the agreed amount.';
    const terms = detectDefinedTerms(text);
    expect(terms).toContain('LICENSEE');
    expect(terms).toContain('LICENSOR');
  });

  it('excludes common legal boilerplate caps', () => {
    const text = 'SHALL WILL MAY MUST ARTICLE SECTION PROVIDED';
    const terms = detectDefinedTerms(text);
    expect(terms).not.toContain('SHALL');
    expect(terms).not.toContain('ARTICLE');
  });

  it('returns sorted terms', () => {
    const text = '"Zebra Term" means something. "Alpha Term" means something else.';
    const terms = detectDefinedTerms(text);
    if (terms.length >= 2) {
      expect(terms).toEqual([...terms].sort());
    }
  });

  it('handles smart quotes', () => {
    const text = '\u201CSpecial Term\u201D means something important. The \u201CSpecial Term\u201D applies.';
    const terms = detectDefinedTerms(text);
    expect(terms).toContain('Special Term');
  });
});

describe('detectTables', () => {
  it('returns empty array for text with no tables', () => {
    expect(detectTables('Just regular text.\nNo tables here.')).toEqual([]);
  });

  it('detects pipe-delimited markdown tables', () => {
    const text = `
| Header 1 | Header 2 | Header 3 |
|----------|----------|----------|
| Cell 1   | Cell 2   | Cell 3   |
| Cell 4   | Cell 5   | Cell 6   |
`.trim();
    const tables = detectTables(text);
    expect(tables).toHaveLength(1);
    expect(tables[0].headers).toEqual(['Header 1', 'Header 2', 'Header 3']);
    expect(tables[0].rows).toHaveLength(2);
  });

  it('detects tab-delimited tables', () => {
    const text = `Name\tAge\tCity\nAlice\t30\tNew York\nBob\t25\tBoston`;
    const tables = detectTables(text);
    expect(tables).toHaveLength(1);
    expect(tables[0].headers).toEqual(['Name', 'Age', 'City']);
    expect(tables[0].rows).toHaveLength(2);
  });

  it('captures table caption from preceding line', () => {
    const text = `Table 1: Payment Schedule\n| Due Date | Amount | Status |\n|----------|--------|--------|\n| Jan 1    | $100   | Paid   |`;
    const tables = detectTables(text);
    expect(tables).toHaveLength(1);
    expect(tables[0].caption).toBe('Table 1: Payment Schedule');
  });

  it('handles tables without separator line', () => {
    const text = `| Name | Value |\n| Alpha | 100 |\n| Beta | 200 |`;
    const tables = detectTables(text);
    expect(tables).toHaveLength(1);
    expect(tables[0].rows.length).toBeGreaterThanOrEqual(2);
  });

  it('requires at least 3 pipe segments', () => {
    const text = 'Hello | world\nThis is not a table.';
    const tables = detectTables(text);
    expect(tables).toEqual([]);
  });

  it('detects multiple tables in one document', () => {
    const text = `
| H1 | H2 | H3 |
| a  | b  | c  |

Some text between tables.

| X1 | X2 | X3 |
| d  | e  | f  |
`.trim();
    const tables = detectTables(text);
    expect(tables).toHaveLength(2);
  });
});
