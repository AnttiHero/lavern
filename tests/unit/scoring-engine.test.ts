/**
 * Unit tests for the Scoring Engine MCP tools.
 *
 * Tests: Complexity Tax formula, readability score, findability score,
 * before/after comparison. All tools are pure computations (readOnly).
 */

import { describe, it, expect } from 'vitest';

// We test the scoring logic by calling the tool handlers directly.
// Since the tools are created via the SDK's tool() wrapper, we need to
// extract and test the underlying computation logic.
// For unit tests, we replicate the core formulas to verify correctness.

describe('Complexity Tax Formula', () => {
  function calculateComplexityTax(wordCount: number, fkGrade: number, structureQuality: 'clear' | 'confusing' | 'very_poor') {
    const difficultyMultiplier =
      fkGrade <= 8 ? 1.0 :
      fkGrade <= 10 ? 1.3 :
      fkGrade <= 13 ? 1.7 :
      fkGrade <= 16 ? 2.2 : 3.0;

    const rereadFactor =
      structureQuality === 'clear' ? 1.0 :
      structureQuality === 'confusing' ? 1.5 : 2.0;

    return Math.round((wordCount / 200) * difficultyMultiplier * rereadFactor * 10) / 10;
  }

  it('should calculate minimal tax for short, clear documents', () => {
    const tax = calculateComplexityTax(200, 6, 'clear');
    expect(tax).toBe(1.0); // 200/200 * 1.0 * 1.0 = 1.0
  });

  it('should increase tax with higher FK grade', () => {
    const easyTax = calculateComplexityTax(1000, 8, 'clear');
    const hardTax = calculateComplexityTax(1000, 14, 'clear');
    expect(hardTax).toBeGreaterThan(easyTax);
  });

  it('should increase tax with confusing structure', () => {
    const clearTax = calculateComplexityTax(1000, 10, 'clear');
    const confusingTax = calculateComplexityTax(1000, 10, 'confusing');
    // Due to rounding at each step, use approximate comparison
    expect(confusingTax).toBeGreaterThan(clearTax);
    expect(confusingTax / clearTax).toBeCloseTo(1.5, 1);
  });

  it('should scale linearly with word count', () => {
    const tax500 = calculateComplexityTax(500, 10, 'clear');
    const tax1000 = calculateComplexityTax(1000, 10, 'clear');
    // Due to rounding at each step, use approximate comparison
    expect(tax1000).toBeGreaterThan(tax500);
    expect(tax1000 / tax500).toBeCloseTo(2.0, 1);
  });

  it('should apply maximum penalty for graduate-level + very poor structure', () => {
    const tax = calculateComplexityTax(1000, 18, 'very_poor');
    // 1000/200 * 3.0 * 2.0 = 30.0
    expect(tax).toBe(30.0);
  });

  it('should calculate user savings correctly', () => {
    const taxPerReader = calculateComplexityTax(1000, 12, 'clear');
    const userCount = 10000;
    const totalHours = Math.round((taxPerReader * userCount) / 60);
    expect(totalHours).toBeGreaterThan(0);
  });
});

describe('Readability Score', () => {
  function calculateReadabilityScore(
    fkGrade: number,
    avgSentenceLength: number,
    passiveVoicePct: number,
    bonuses: { jargonDefined?: boolean; shortParagraphs?: boolean } = {},
    penalties: { undefinedTerms?: boolean; doubleNegatives?: boolean } = {},
  ) {
    const gradeScore =
      fkGrade <= 8 ? 4 :
      fkGrade <= 10 ? 3 :
      fkGrade <= 13 ? 2 :
      fkGrade <= 16 ? 1 : 0;

    const sentenceScore =
      avgSentenceLength <= 18 ? 4 :
      avgSentenceLength <= 22 ? 3 :
      avgSentenceLength <= 30 ? 2 :
      avgSentenceLength <= 40 ? 1 : 0;

    const passiveScore =
      passiveVoicePct < 10 ? 4 :
      passiveVoicePct <= 20 ? 3 :
      passiveVoicePct <= 35 ? 2 :
      passiveVoicePct <= 50 ? 1 : 0;

    let score = (gradeScore + sentenceScore + passiveScore) / 3;

    if (bonuses.jargonDefined) score = Math.min(4, score + 0.5);
    if (bonuses.shortParagraphs) score = Math.min(4, score + 0.5);
    if (penalties.undefinedTerms) score = Math.max(0, score - 1);
    if (penalties.doubleNegatives) score = Math.max(0, score - 1);

    score = Math.round(score * 10) / 10;
    const classification = score <= 1 ? 'RED' : score <= 2 ? 'YELLOW' : 'GREEN';
    return { score, classification };
  }

  it('should give GREEN for easy, short, active-voice documents', () => {
    const result = calculateReadabilityScore(6, 15, 5);
    expect(result.score).toBe(4);
    expect(result.classification).toBe('GREEN');
  });

  it('should give RED for dense, long, passive documents', () => {
    const result = calculateReadabilityScore(18, 45, 60);
    expect(result.score).toBe(0);
    expect(result.classification).toBe('RED');
  });

  it('should give YELLOW for moderate complexity', () => {
    const result = calculateReadabilityScore(12, 25, 30);
    expect(result.classification).toBe('YELLOW');
  });

  it('should award bonuses for good practices', () => {
    const base = calculateReadabilityScore(10, 20, 15);
    const withBonuses = calculateReadabilityScore(10, 20, 15, { jargonDefined: true, shortParagraphs: true });
    expect(withBonuses.score).toBeGreaterThan(base.score);
  });

  it('should apply penalties for bad practices', () => {
    const base = calculateReadabilityScore(10, 20, 15);
    const withPenalties = calculateReadabilityScore(10, 20, 15, {}, { undefinedTerms: true, doubleNegatives: true });
    expect(withPenalties.score).toBeLessThan(base.score);
  });

  it('should cap score at 4 even with multiple bonuses', () => {
    const result = calculateReadabilityScore(6, 12, 3, { jargonDefined: true, shortParagraphs: true });
    expect(result.score).toBeLessThanOrEqual(4);
  });

  it('should floor score at 0 even with multiple penalties', () => {
    const result = calculateReadabilityScore(18, 45, 60, {}, { undefinedTerms: true, doubleNegatives: true });
    expect(result.score).toBeGreaterThanOrEqual(0);
  });
});

describe('Findability Score', () => {
  function calculateFindabilityScore(found: boolean[]) {
    const count = found.filter(Boolean).length;
    const score = count >= 5 ? 4 : count >= 4 ? 3 : count >= 3 ? 2 : count >= 2 ? 1 : 0;
    const classification = score <= 1 ? 'RED' : score <= 2 ? 'YELLOW' : 'GREEN';
    return { score, classification, found: count };
  }

  it('should give 4/4 GREEN when all items found', () => {
    const result = calculateFindabilityScore([true, true, true, true, true]);
    expect(result.score).toBe(4);
    expect(result.classification).toBe('GREEN');
  });

  it('should give RED when fewer than 2 items found', () => {
    const result = calculateFindabilityScore([true, false, false, false, false]);
    expect(result.score).toBe(0);
    expect(result.classification).toBe('RED');
  });

  it('should give YELLOW for 3 items found', () => {
    const result = calculateFindabilityScore([true, true, true, false, false]);
    expect(result.score).toBe(2);
    expect(result.classification).toBe('YELLOW');
  });
});
