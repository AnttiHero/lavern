/**
 * Scoring Engine MCP Tool — Computational functions for precise scoring.
 *
 * v2: Added readOnly annotations — scoring tools never modify state.
 *
 * Agents invoke these for calculations that are better computed than estimated:
 * Complexity Tax, readability scores, findability scores, before/after comparisons.
 */

import { z } from 'zod';
import { tool } from '@anthropic-ai/claude-agent-sdk';

export const calculateComplexityTax = tool(
  'calculate_complexity_tax',
  'Calculate the Complexity Tax for a document. Formula: (Word Count / 200) x Difficulty Multiplier x Re-read Factor. Returns minutes per reader and projected time savings.',
  {
    word_count: z.number().describe('Total word count of the document'),
    fk_grade: z.number().describe('Flesch-Kincaid grade level'),
    structure_quality: z.enum(['clear', 'confusing', 'very_poor']).describe('Overall structure quality affecting re-read factor'),
    user_count: z.number().optional().describe('Number of users who will read this document, for time savings calculation'),
  },
  async (args) => {
    const difficultyMultiplier =
      args.fk_grade <= 8 ? 1.0 :
      args.fk_grade <= 10 ? 1.3 :
      args.fk_grade <= 13 ? 1.7 :
      args.fk_grade <= 16 ? 2.2 : 3.0;

    const rereadFactor =
      args.structure_quality === 'clear' ? 1.0 :
      args.structure_quality === 'confusing' ? 1.5 : 2.0;

    const tax = (args.word_count / 200) * difficultyMultiplier * rereadFactor;
    const minutesPerReader = Math.round(tax * 10) / 10;

    let savingsNote = '';
    if (args.user_count) {
      const totalHours = Math.round((minutesPerReader * args.user_count) / 60);
      savingsNote = `\nAt ${args.user_count.toLocaleString()} users = ${totalHours} hours total reading time.`;
    }

    return {
      content: [{ type: 'text' as const, text: `Complexity Tax: ${minutesPerReader} min/reader (Word Count: ${args.word_count}, FK Grade: ${args.fk_grade}, Multiplier: ${difficultyMultiplier}x, Re-read: ${rereadFactor}x)${savingsNote}` }],
    };
  },
  { annotations: { readOnly: true } }
);

export const calculateReadabilityScore = tool(
  'calculate_readability_score',
  'Calculate the readability dimension score (0-4) based on FK grade, average sentence length, and passive voice percentage.',
  {
    fk_grade: z.number().describe('Flesch-Kincaid grade level'),
    avg_sentence_length: z.number().describe('Average words per sentence'),
    passive_voice_pct: z.number().describe('Percentage of sentences in passive voice (0-100)'),
    has_jargon_defined: z.boolean().optional().describe('Bonus: jargon defined on first use'),
    has_short_paragraphs: z.boolean().optional().describe('Bonus: short paragraphs (3-4 sentences)'),
    has_undefined_terms: z.boolean().optional().describe('Penalty: undefined technical terms'),
    has_double_negatives: z.boolean().optional().describe('Penalty: double negatives present'),
  },
  async (args) => {
    // Base score from FK grade
    const gradeScore =
      args.fk_grade <= 8 ? 4 :
      args.fk_grade <= 10 ? 3 :
      args.fk_grade <= 13 ? 2 :
      args.fk_grade <= 16 ? 1 : 0;

    // Sentence length score
    const sentenceScore =
      args.avg_sentence_length <= 18 ? 4 :
      args.avg_sentence_length <= 22 ? 3 :
      args.avg_sentence_length <= 30 ? 2 :
      args.avg_sentence_length <= 40 ? 1 : 0;

    // Passive voice score
    const passiveScore =
      args.passive_voice_pct < 10 ? 4 :
      args.passive_voice_pct <= 20 ? 3 :
      args.passive_voice_pct <= 35 ? 2 :
      args.passive_voice_pct <= 50 ? 1 : 0;

    // Average the three sub-scores
    let score = (gradeScore + sentenceScore + passiveScore) / 3;

    // Bonuses (+1, max 4)
    if (args.has_jargon_defined) score = Math.min(4, score + 0.5);
    if (args.has_short_paragraphs) score = Math.min(4, score + 0.5);

    // Penalties (-1)
    if (args.has_undefined_terms) score = Math.max(0, score - 1);
    if (args.has_double_negatives) score = Math.max(0, score - 1);

    score = Math.round(score * 10) / 10;

    const classification = score <= 1 ? 'RED' : score <= 2 ? 'YELLOW' : 'GREEN';

    return {
      content: [{ type: 'text' as const, text: `Readability Score: ${score}/4 (${classification})\n  FK Grade: ${args.fk_grade} (${gradeScore}/4)\n  Avg Sentence: ${args.avg_sentence_length} words (${sentenceScore}/4)\n  Passive Voice: ${args.passive_voice_pct}% (${passiveScore}/4)` }],
    };
  },
  { annotations: { readOnly: true } }
);

export const calculateFindabilityScore = tool(
  'calculate_findability_score',
  'Calculate the findability dimension score (0-4) based on how many key items can be found within target times.',
  {
    cancel_found: z.boolean().describe('Can "how to cancel" be found within 30 seconds?'),
    data_found: z.boolean().describe('Can "what data is collected" be found within 30 seconds?'),
    payment_found: z.boolean().describe('Can "payment/renewal terms" be found within 30 seconds?'),
    contact_found: z.boolean().describe('Can "contact for questions" be found within 15 seconds?'),
    obligations_found: z.boolean().describe('Can "main obligations" be found within 60 seconds?'),
  },
  async (args) => {
    const found = [args.cancel_found, args.data_found, args.payment_found, args.contact_found, args.obligations_found]
      .filter(Boolean).length;

    const score = found >= 5 ? 4 : found >= 4 ? 3 : found >= 3 ? 2 : found >= 2 ? 1 : 0;
    const classification = score <= 1 ? 'RED' : score <= 2 ? 'YELLOW' : 'GREEN';

    const missing = [];
    if (!args.cancel_found) missing.push('cancellation');
    if (!args.data_found) missing.push('data collection');
    if (!args.payment_found) missing.push('payment terms');
    if (!args.contact_found) missing.push('contact info');
    if (!args.obligations_found) missing.push('obligations');

    return {
      content: [{ type: 'text' as const, text: `Findability Score: ${score}/4 (${classification}) — ${found}/5 items found within target times.${missing.length > 0 ? `\n  Missing: ${missing.join(', ')}` : ''}` }],
    };
  },
  { annotations: { readOnly: true } }
);

export const compareBeforeAfter = tool(
  'compare_before_after',
  'Compare metrics before and after transformation to quantify improvement.',
  {
    original_word_count: z.number(),
    transformed_word_count: z.number(),
    original_fk_grade: z.number(),
    transformed_fk_grade: z.number(),
    original_avg_sentence: z.number(),
    transformed_avg_sentence: z.number(),
    original_passive_pct: z.number(),
    transformed_passive_pct: z.number(),
    user_count: z.number().optional().describe('Number of readers for time savings calculation'),
  },
  async (args) => {
    const origTax = (args.original_word_count / 200) *
      (args.original_fk_grade <= 8 ? 1.0 : args.original_fk_grade <= 10 ? 1.3 : args.original_fk_grade <= 13 ? 1.7 : args.original_fk_grade <= 16 ? 2.2 : 3.0);
    const newTax = (args.transformed_word_count / 200) *
      (args.transformed_fk_grade <= 8 ? 1.0 : args.transformed_fk_grade <= 10 ? 1.3 : args.transformed_fk_grade <= 13 ? 1.7 : args.transformed_fk_grade <= 16 ? 2.2 : 3.0);

    const taxReduction = Math.round((origTax - newTax) * 10) / 10;
    const wordReduction = args.original_word_count - args.transformed_word_count;
    const gradeImprovement = args.original_fk_grade - args.transformed_fk_grade;

    let savings = '';
    if (args.user_count) {
      const hoursSaved = Math.round((taxReduction * args.user_count) / 60);
      savings = `\nAt ${args.user_count.toLocaleString()} users: ~${hoursSaved} hours saved annually.`;
    }

    return {
      content: [{ type: 'text' as const, text: `## Before / After Comparison\n\n| Metric | Before | After | Change |\n|--------|--------|-------|--------|\n| Word Count | ${args.original_word_count} | ${args.transformed_word_count} | ${wordReduction > 0 ? '-' : '+'}${Math.abs(wordReduction)} |\n| FK Grade | ${args.original_fk_grade} | ${args.transformed_fk_grade} | ${gradeImprovement > 0 ? '-' : '+'}${Math.abs(gradeImprovement).toFixed(1)} |\n| Avg Sentence | ${args.original_avg_sentence} words | ${args.transformed_avg_sentence} words | ${(args.original_avg_sentence - args.transformed_avg_sentence).toFixed(1)} |\n| Passive Voice | ${args.original_passive_pct}% | ${args.transformed_passive_pct}% | ${(args.original_passive_pct - args.transformed_passive_pct).toFixed(1)}% |\n| Complexity Tax | ${origTax.toFixed(1)} min | ${newTax.toFixed(1)} min | -${taxReduction} min/reader |${savings}` }],
    };
  },
  { annotations: { readOnly: true } }
);

export const scoringEngineTools = [
  calculateComplexityTax,
  calculateReadabilityScore,
  calculateFindabilityScore,
  compareBeforeAfter,
];
