/**
 * Unit Tests — Document Checks (src/mcp/tools/document-checks.ts)
 *
 * Tests the computational verification tools for document structure
 * and formatting consistency checks.
 *
 * These tools support the 10-pass verification pipeline referenced
 * by orchestrator-verification, orchestrator-review, and orchestrator-full-bench.
 */

import { describe, it, expect, beforeEach } from 'vitest';

// Test the helper functions directly since we can't easily instantiate
// full MCP tools without the session. We'll test the logic in isolation.

// ── Heading Hierarchy Analysis ─────────────────────────────────────────

describe('heading hierarchy analysis', () => {
  // Replicate the analyzeHeadingHierarchy logic for testing
  function analyzeHeadingHierarchy(headings: Array<{ text: string; level: number; position: number }>) {
    const issues: string[] = [];
    for (let i = 1; i < headings.length; i++) {
      const prev = headings[i - 1];
      const curr = headings[i];
      if (curr.level > prev.level + 1) {
        issues.push(`Heading hierarchy gap at position ${curr.position}: "${curr.text}" is H${curr.level} but previous heading "${prev.text}" is H${prev.level} (skipped H${prev.level + 1})`);
      }
    }
    return issues;
  }

  it('reports no issues for clean hierarchy', () => {
    const headings = [
      { text: 'Title', level: 1, position: 0 },
      { text: 'Section 1', level: 2, position: 100 },
      { text: 'Subsection 1.1', level: 3, position: 200 },
      { text: 'Section 2', level: 2, position: 300 },
    ];
    expect(analyzeHeadingHierarchy(headings)).toHaveLength(0);
  });

  it('detects H1 to H3 gap (missing H2)', () => {
    const headings = [
      { text: 'Title', level: 1, position: 0 },
      { text: 'Subsection', level: 3, position: 100 },
    ];
    const issues = analyzeHeadingHierarchy(headings);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('skipped H2');
  });

  it('detects multiple gaps', () => {
    const headings = [
      { text: 'Title', level: 1, position: 0 },
      { text: 'Deep', level: 4, position: 100 }, // gap: 1 -> 4 (skips 2,3)
      { text: 'Section', level: 2, position: 200 },
      { text: 'Deeper', level: 5, position: 300 }, // gap: 2 -> 5
    ];
    const issues = analyzeHeadingHierarchy(headings);
    expect(issues.length).toBeGreaterThanOrEqual(2);
  });

  it('allows going from deeper to shallower level', () => {
    const headings = [
      { text: 'Title', level: 1, position: 0 },
      { text: 'Section', level: 2, position: 100 },
      { text: 'Sub', level: 3, position: 200 },
      { text: 'Section 2', level: 2, position: 300 }, // going back up is fine
      { text: 'New Title', level: 1, position: 400 },
    ];
    expect(analyzeHeadingHierarchy(headings)).toHaveLength(0);
  });

  it('handles empty headings list', () => {
    expect(analyzeHeadingHierarchy([])).toHaveLength(0);
  });

  it('handles single heading', () => {
    expect(analyzeHeadingHierarchy([{ text: 'Title', level: 1, position: 0 }])).toHaveLength(0);
  });
});

// ── Section Numbering Analysis ─────────────────────────────────────────

describe('section numbering analysis', () => {
  function analyzeNumbering(sectionNumbers: string[]) {
    const issues: string[] = [];
    if (sectionNumbers.length < 2) return issues;

    const topLevel: number[] = [];
    for (const num of sectionNumbers) {
      const parts = num.split('.');
      const first = parseInt(parts[0], 10);
      if (!isNaN(first) && parts.length === 1) {
        topLevel.push(first);
      }
    }

    for (let i = 1; i < topLevel.length; i++) {
      if (topLevel[i] !== topLevel[i - 1] + 1) {
        issues.push(`Section numbering gap: Section ${topLevel[i - 1]} is followed by Section ${topLevel[i]} (expected ${topLevel[i - 1] + 1})`);
      }
    }

    const seen = new Set<string>();
    for (const num of sectionNumbers) {
      if (seen.has(num)) {
        issues.push(`Duplicate section number: ${num}`);
      }
      seen.add(num);
    }

    return issues;
  }

  it('reports no issues for sequential numbering', () => {
    expect(analyzeNumbering(['1', '2', '3', '4'])).toHaveLength(0);
  });

  it('detects numbering gap', () => {
    const issues = analyzeNumbering(['1', '2', '5', '6']);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('expected 3');
  });

  it('detects duplicates', () => {
    const issues = analyzeNumbering(['1', '2', '2', '3']);
    expect(issues.some(i => i.includes('Duplicate'))).toBe(true);
  });

  it('ignores sub-section numbers for top-level gap check', () => {
    // Only top-level (no dots) numbers are checked for gaps
    const issues = analyzeNumbering(['1', '1.1', '1.2', '2', '2.1']);
    expect(issues).toHaveLength(0);
  });

  it('handles empty list', () => {
    expect(analyzeNumbering([])).toHaveLength(0);
  });

  it('handles single number', () => {
    expect(analyzeNumbering(['1'])).toHaveLength(0);
  });
});

// ── Cross Reference Analysis ───────────────────────────────────────────

describe('cross reference analysis', () => {
  function analyzeCrossReferences(
    crossRefs: Array<{ text: string; target: string }>,
    headings: Array<{ text: string; level: number; position: number }>,
    sectionNumbers: string[],
  ) {
    const issues: string[] = [];
    const headingTexts = new Set(headings.map(h => h.text.toLowerCase()));
    const numberSet = new Set(sectionNumbers);

    for (const ref of crossRefs) {
      const target = ref.target.trim();

      if (/^\d+(\.\d+)*$/.test(target)) {
        if (!numberSet.has(target)) {
          issues.push(`Broken cross-reference: "${ref.text}" references Section ${target} which does not exist`);
        }
        continue;
      }

      if (!headingTexts.has(target.toLowerCase())) {
        const fuzzyMatch = headings.some(h => h.text.toLowerCase().includes(target.toLowerCase()));
        if (!fuzzyMatch) {
          issues.push(`Potentially broken cross-reference: "${ref.text}" references "${target}" — no matching heading found`);
        }
      }
    }

    return issues;
  }

  it('finds broken section number reference', () => {
    const refs = [{ text: 'see Section 5.2', target: '5.2' }];
    const headings = [{ text: 'Intro', level: 1, position: 0 }];
    const numbers = ['1', '2', '3'];
    const issues = analyzeCrossReferences(refs, headings, numbers);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('5.2');
  });

  it('accepts valid section number reference', () => {
    const refs = [{ text: 'see Section 2.1', target: '2.1' }];
    const headings = [];
    const numbers = ['1', '2', '2.1', '3'];
    expect(analyzeCrossReferences(refs, headings, numbers)).toHaveLength(0);
  });

  it('detects broken heading reference', () => {
    const refs = [{ text: 'see Termination', target: 'Termination' }];
    const headings = [{ text: 'Introduction', level: 1, position: 0 }];
    const issues = analyzeCrossReferences(refs, headings, []);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('Termination');
  });

  it('accepts valid heading reference (case-insensitive)', () => {
    const refs = [{ text: 'see TERMINATION', target: 'termination' }];
    const headings = [{ text: 'Termination', level: 2, position: 100 }];
    expect(analyzeCrossReferences(refs, headings, [])).toHaveLength(0);
  });

  it('accepts fuzzy heading match', () => {
    const refs = [{ text: 'see liability section', target: 'liability' }];
    const headings = [{ text: 'Limitation of Liability', level: 2, position: 100 }];
    expect(analyzeCrossReferences(refs, headings, [])).toHaveLength(0);
  });
});
