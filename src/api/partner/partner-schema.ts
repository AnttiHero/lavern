/**
 * Partner Consultation Schemas — Zod validation for partner mode API.
 */

import { z } from 'zod';

/** Input schema for POST /api/partner/consult */
export const PartnerConsultSchema = z.object({
  /** Conversation history */
  history: z.array(z.object({
    role: z.enum(['assistant', 'user']),
    content: z.string(),
  })).max(20).default([]),

  /** Current user message (omit on first turn to get opening greeting) */
  userMessage: z.string().optional(),

  /** Attached documents */
  documents: z.array(z.object({
    name: z.string(),
    content: z.string(),
  })).default([]),

  /** Set true to finalize: partner returns structured recommendation */
  finalize: z.boolean().default(false),
});

/** Structured output from partner finalization */
export const PartnerRecommendationSchema = z.object({
  workflowId: z.string(),
  requestType: z.string(),
  intensity: z.enum(['standard', 'maximal', 'maximum']),
  budgetUsd: z.number(),
  teamRoles: z.array(z.string()),
  briefingMemo: z.string(),
  reasoning: z.string(),
});

export type PartnerConsultInput = z.infer<typeof PartnerConsultSchema>;
export type PartnerRecommendation = z.infer<typeof PartnerRecommendationSchema>;
