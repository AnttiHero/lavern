/**
 * Briefing Analyzer Schemas — Zod schemas for the /api/briefing/analyze endpoint.
 *
 * The response schema is used as structured output for the LLM call,
 * following the same pattern as RouterClassificationSchema.
 */

import { z } from 'zod';

// ── Request Schema ────────────────────────────────────────────────────

export const BriefingAnalyzeRequestSchema = z.object({
  workflowId: z.string(),
  documents: z.array(z.object({
    name: z.string(),
    content: z.string(),
  })).default([]),
  answers: z.record(z.string(), z.string()).default({}),
  followUpAnswers: z.record(z.string(), z.string()).optional(),
  finalInstructions: z.string().optional(),
});

export type BriefingAnalyzeRequest = z.infer<typeof BriefingAnalyzeRequestSchema>;

// ── Response Schema (structured output for LLM) ──────────────────────

export const BriefingAnalyzeResponseSchema = z.object({
  sufficiency: z.object({
    score: z.number().min(0).max(100),
    verdict: z.enum(['insufficient', 'adequate', 'strong']),
    gaps: z.array(z.string()),
    ambiguities: z.array(z.string()),
  }),
  followUpQuestions: z.array(z.object({
    id: z.string(),
    text: z.string(),
    hint: z.string(),
    category: z.enum(['context', 'scope', 'constraints', 'objectives']),
    required: z.boolean(),
  })),
  engagementBrief: z.object({
    summary: z.string(),
    objective: z.string(),
    documentAnalysis: z.string().nullable(),
    scopeAndConstraints: z.string(),
    riskFactors: z.array(z.string()),
    successCriteria: z.array(z.string()),
    specialInstructions: z.string(),
  }),
});

export type BriefingAnalyzeResponse = z.infer<typeof BriefingAnalyzeResponseSchema>;
