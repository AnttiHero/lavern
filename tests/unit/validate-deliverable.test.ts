/**
 * Unit Tests — Validate Deliverable (src/assembly/validate-deliverable.ts)
 *
 * These safety gates prevent process dumps from reaching end users.
 * Every pattern here represents a real failure mode observed in production.
 */

import { describe, it, expect } from 'vitest';
import { isProcessDump, validateDeliverable } from '../../src/assembly/validate-deliverable.js';

// ── Helper: Build a valid document ─────────────────────────────────────────

function makeValidDoc(heading = '# Terms of Service'): string {
  return [
    heading,
    '',
    '## Section 1: Definitions',
    '',
    'This agreement establishes the terms and conditions governing the use of services provided by the Company. ' +
    'All parties agree to the following provisions which shall remain in effect for the duration specified herein. ' +
    'The definitions set forth in this section shall apply throughout the entirety of this document unless otherwise noted.',
    '',
    '## Section 2: Obligations',
    '',
    'The service provider shall deliver all contracted services in accordance with industry standards and best practices. ' +
    'Payment terms are net 30 days from the date of invoice. Late payments shall incur interest at a rate of 1.5% per month.',
    '',
    '## Section 3: Termination',
    '',
    'Either party may terminate this agreement upon 30 days written notice. ' +
    'In the event of material breach, the non-breaching party may terminate immediately upon written notice.',
  ].join('\n');
}

// ── isProcessDump() ────────────────────────────────────────────────────────

describe('isProcessDump', () => {
  // Agent reasoning patterns
  const agentPatterns = [
    "I'll start by reviewing the document",
    "I will analyze the contract now",
    "Let me examine the clauses",
    "I need to check the termination clause",
    "I see several issues with this contract",
    "I can see that the indemnification is missing",
    "I have reviewed the document thoroughly",
    "I've completed the analysis",
  ];

  it.each(agentPatterns)('rejects agent reasoning: "%s"', (text) => {
    expect(isProcessDump(text)).toBe(true);
  });

  // Transition patterns
  const transitionPatterns = [
    "First, let me review the key provisions",
    "Now, I'll move on to the liability section",
    "Now let me check the indemnification",
    "Next, I need to examine the warranties",
  ];

  it.each(transitionPatterns)('rejects transitions: "%s"', (text) => {
    expect(isProcessDump(text)).toBe(true);
  });

  // Affirmation patterns
  const affirmationPatterns = [
    "OK, I see the issue here",
    "Okay, let me review this",
    "Sure, I can analyze that",
    "Certainly, here is the analysis",
    "Good. Now let me check the next clause",
    "Good — the analysis is progressing well",
    "Great, the document is ready",
    "Excellent work on the review",
    "Perfect, now moving to the next section",
  ];

  it.each(affirmationPatterns)('rejects affirmations: "%s"', (text) => {
    expect(isProcessDump(text)).toBe(true);
  });

  // Preamble patterns
  const preamblePatterns = [
    "Here is the completed document",
    "Here's the revised Terms of Service",
    "Based on my analysis, here are the findings",
    "The analysis reveals several critical issues",
    "Below is the restructured agreement",
    "What follows is a comprehensive review",
    "The following document has been prepared",
  ];

  it.each(preamblePatterns)('rejects preambles: "%s"', (text) => {
    expect(isProcessDump(text)).toBe(true);
  });

  // Agent coordination patterns
  const coordinationPatterns = [
    "Clean slate — starting fresh analysis",
    "The specialist has completed the review",
    "Both specialists agree on the findings",
    "Let me check the debate board",
    "I'll start the verification process",
    "I'll now dispatch the next agent",
  ];

  it.each(coordinationPatterns)('rejects coordination: "%s"', (text) => {
    expect(isProcessDump(text)).toBe(true);
  });

  // MCP tool patterns
  const toolPatterns = [
    "get_current_step returned step 3",
    "advance_step completed successfully",
    "post_finding for the liability clause",
    "dispatching the contract reviewer",
    "running in parallel with three agents",
    "permission issue with the tool",
    "tool Read has issue reading the file",
    "subagent completed the analysis",
    "debate board shows 3 findings",
  ];

  it.each(toolPatterns)('rejects tool references: "%s"', (text) => {
    expect(isProcessDump(text)).toBe(true);
  });

  // Valid documents that should NOT be flagged
  it('accepts document starting with heading', () => {
    expect(isProcessDump('# Terms of Service\n\nThis agreement...')).toBe(false);
  });

  it('accepts document with numbered heading', () => {
    expect(isProcessDump('# 1. Introduction\n\nThe parties agree...')).toBe(false);
  });

  it('accepts document that mentions process words AFTER the heading', () => {
    const doc = '# Contract Review\n\nI will note that the indemnification clause needs revision.';
    expect(isProcessDump(doc)).toBe(false);
  });

  it('handles leading whitespace', () => {
    expect(isProcessDump('   I\'ll review this now')).toBe(true);
    expect(isProcessDump('   # Terms of Service')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isProcessDump('')).toBe(false);
  });
});

// ── validateDeliverable() ──────────────────────────────────────────────────

describe('validateDeliverable', () => {
  it('rejects empty string', () => {
    const result = validateDeliverable('');
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('empty');
  });

  it('rejects null-ish input', () => {
    expect(validateDeliverable(null as unknown as string).valid).toBe(false);
    expect(validateDeliverable(undefined as unknown as string).valid).toBe(false);
  });

  it('rejects text shorter than 500 chars', () => {
    const shortDoc = '# Title\n\n## Section\n\n## Another\n\nShort text.';
    expect(shortDoc.length).toBeLessThan(500);
    const result = validateDeliverable(shortDoc);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('too_short');
  });

  it('rejects text not starting with heading', () => {
    const noHeading = 'This is a long document without a heading. '.repeat(20) +
      '\n## Section 1\n\n## Section 2\n\n## Section 3';
    expect(noHeading.length).toBeGreaterThan(500);
    const result = validateDeliverable(noHeading);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('no_heading');
  });

  it('rejects process dump even if long enough and has headings', () => {
    // Process dump that technically starts with # but isProcessDump catches it
    // validateDeliverable checks heading first, then process dump
    // So a pure process dump without # heading fails on no_heading first
    const processDump = "I'll start by reviewing the contract. " +
      'First, let me check the indemnification clause. '.repeat(20) +
      '\n# Heading\n## Sub1\n## Sub2\n## Sub3';
    expect(processDump.length).toBeGreaterThan(500);
    const result = validateDeliverable(processDump);
    expect(result.valid).toBe(false);
    // Fails on no_heading because it doesn't start with #
    expect(result.reason).toBe('no_heading');
  });

  it('rejects process dump that starts with heading-like pattern', () => {
    // A document that starts with # but the body is entirely process text
    const sneakyDump = "# Analysis\n\n" +
      "I'll start by reviewing the contract. ".repeat(15) +
      '\n## Sub1\n## Sub2\n## Sub3';
    expect(sneakyDump.length).toBeGreaterThan(500);
    // v19: The full-text process contamination scan now catches this even though
    // it starts with a heading — the body paragraphs are all process text.
    const result = validateDeliverable(sneakyDump);
    expect(result.valid).toBe(false);
    // Could be 'process_contamination' or 'thin_content' depending on structure
    expect(['process_contamination', 'thin_content']).toContain(result.reason);
  });

  it('rejects text with fewer than 3 headings', () => {
    const fewHeadings = '# Title\n\n## Only One Sub\n\n' +
      'This is a document with only two headings but lots of content. '.repeat(15);
    expect(fewHeadings.length).toBeGreaterThan(500);
    const result = validateDeliverable(fewHeadings);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('no_structure');
  });

  it('accepts a well-structured document', () => {
    const doc = makeValidDoc();
    expect(doc.length).toBeGreaterThan(500);
    const result = validateDeliverable(doc);
    expect(result.valid).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('accepts document with many headings', () => {
    const sections = Array.from({ length: 10 }, (_, i) =>
      `## Section ${i + 1}\n\nContent for section ${i + 1} with enough text to pass the content density validation check. This section covers important legal provisions and analysis that the client needs to review carefully before proceeding.`
    ).join('\n\n');
    const doc = `# Master Agreement\n\n${sections}`;
    expect(validateDeliverable(doc).valid).toBe(true);
  });

  it('handles document with leading whitespace', () => {
    const doc = '  \n' + makeValidDoc();
    const result = validateDeliverable(doc);
    expect(result.valid).toBe(true);
  });
});
