/**
 * Unit Tests — stripProcessText (src/assembly/document-assembler.ts)
 *
 * Tests the preamble stripping logic that removes process/thinking text
 * from assembled documents. If this breaks, deliverables will contain
 * "I'll start by..." preamble leaking through to clients.
 */

import { describe, it, expect, vi } from 'vitest';
import { stripProcessText } from '../../src/assembly/document-assembler.js';

describe('stripProcessText', () => {
  it('returns clean text starting with heading unchanged', () => {
    const clean = '# Contract Review\n\nThis document covers...';
    expect(stripProcessText(clean)).toBe(clean);
  });

  it('strips "I\'ll" preamble before heading', () => {
    const input = "I'll start by reviewing the contract.\n\n# Contract Review\n\nThis document covers...";
    expect(stripProcessText(input)).toBe("# Contract Review\n\nThis document covers...");
  });

  it('strips "Let me" preamble', () => {
    const input = "Let me analyze this document carefully.\n\n## Analysis\n\nThe contract contains...";
    expect(stripProcessText(input)).toBe("## Analysis\n\nThe contract contains...");
  });

  it('strips "Here is" preamble', () => {
    const input = "Here is the reviewed contract:\n\n# Contract Review\n\nSection 1...";
    expect(stripProcessText(input)).toBe("# Contract Review\n\nSection 1...");
  });

  it('strips "Based on" preamble', () => {
    const input = "Based on my analysis of the findings:\n\n# Risk Assessment\n\nOverall risk is...";
    expect(stripProcessText(input)).toBe("# Risk Assessment\n\nOverall risk is...");
  });

  it('strips "Below is" preamble', () => {
    const input = "Below is the redesigned document:\n\n# Terms of Service\n\nEffective date...";
    expect(stripProcessText(input)).toBe("# Terms of Service\n\nEffective date...");
  });

  it('preserves text before heading that does not look like process text', () => {
    // A subtitle or metadata before the heading shouldn't be stripped
    const input = "Version 2.0 — Updated 2026-03-15\n\n# Contract Review\n\nThis document...";
    expect(stripProcessText(input)).toBe(input.trim());
  });

  it('handles text with no heading (returns as-is)', () => {
    const input = "This is just plain text with no markdown headings.";
    expect(stripProcessText(input)).toBe(input);
  });

  it('handles empty string', () => {
    expect(stripProcessText('')).toBe('');
  });

  it('handles whitespace-only string', () => {
    expect(stripProcessText('   \n\n   ')).toBe('');
  });

  it('trims surrounding whitespace', () => {
    const input = '  \n\n# Title\n\nContent  \n';
    expect(stripProcessText(input)).toBe('# Title\n\nContent');
  });

  it('strips "I\'ve reviewed" preamble', () => {
    const input = "I've reviewed all the expert findings and debate resolutions.\n\n# Legal Analysis\n\nContent...";
    expect(stripProcessText(input)).toBe("# Legal Analysis\n\nContent...");
  });
});
