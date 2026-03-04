/**
 * Unit Tests — Document Assembler (src/assembly/document-assembler.ts)
 *
 * Tests stripProcessText() — the preamble-stripping safety net that removes
 * orchestrator thinking from the beginning of assembled documents.
 */

import { describe, it, expect } from 'vitest';
import { stripProcessText } from '../../src/assembly/document-assembler.js';

describe('stripProcessText', () => {
  it('returns clean document unchanged', () => {
    const doc = '# Terms of Service\n\n## Section 1\n\nContent here.';
    expect(stripProcessText(doc)).toBe(doc);
  });

  it('strips "I\'ll" preamble before heading', () => {
    const input = "I'll create the document now.\n\n# Terms of Service\n\n## Section 1\n\nContent.";
    expect(stripProcessText(input)).toBe('# Terms of Service\n\n## Section 1\n\nContent.');
  });

  it('strips "Here is" preamble before heading', () => {
    const input = "Here is the revised document:\n\n# Contract\n\n## Parties\n\nAlice and Bob.";
    expect(stripProcessText(input)).toBe('# Contract\n\n## Parties\n\nAlice and Bob.');
  });

  it('strips "Based on" preamble before heading', () => {
    const input = "Based on the analysis, here is the deliverable.\n\n# Report\n\n## Summary\n\nFindings.";
    expect(stripProcessText(input)).toBe('# Report\n\n## Summary\n\nFindings.');
  });

  it('strips "Let me" preamble before heading', () => {
    const input = "Let me draft the document.\n\n# Agreement\n\n## Terms\n\nStuff.";
    expect(stripProcessText(input)).toBe('# Agreement\n\n## Terms\n\nStuff.');
  });

  it('strips multi-line preamble', () => {
    const input = "I'll create this document.\nLet me start with the key provisions.\n\n# Document\n\n## Content\n\nText.";
    expect(stripProcessText(input)).toBe('# Document\n\n## Content\n\nText.');
  });

  it('preserves non-process text before heading', () => {
    // If text before heading doesn't match process patterns, keep it
    const input = "CONFIDENTIAL DRAFT\n\n# Agreement\n\n## Section 1\n\nContent.";
    expect(stripProcessText(input)).toBe(input.trim());
  });

  it('handles whitespace-only input', () => {
    expect(stripProcessText('   ')).toBe('');
  });

  it('handles empty input', () => {
    expect(stripProcessText('')).toBe('');
  });

  it('handles document with no headings at all', () => {
    const input = "Just some plain text without any markdown headings.";
    expect(stripProcessText(input)).toBe(input);
  });

  it('strips "The analysis" preamble', () => {
    const input = "The analysis reveals several findings.\n\n# Review\n\n## Findings\n\nDetails.";
    expect(stripProcessText(input)).toBe('# Review\n\n## Findings\n\nDetails.');
  });

  it('strips "Below is" preamble', () => {
    const input = "Below is the completed document.\n\n# Report\n\n## Summary\n\nDone.";
    expect(stripProcessText(input)).toBe('# Report\n\n## Summary\n\nDone.');
  });
});
