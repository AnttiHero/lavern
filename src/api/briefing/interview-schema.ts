/**
 * Interview Schema — Zod schemas for the conversational interview endpoint.
 *
 * Request: multi-turn conversation state sent each turn.
 * Response: SSE streaming for conversation turns; structured JSON for finalization.
 *
 * The finalization response reuses BriefingAnalyzeResponseSchema so the
 * interview result plugs directly into the downstream analysis pipeline.
 */

import { z } from 'zod';

// ── Request Schema ────────────────────────────────────────────────────

export const InterviewTurnSchema = z.object({
  /** Which workflow the interview is for (review, roundtable, adversarial, etc.) */
  workflowId: z.string(),

  /** Selected interviewer persona ID (margaret, james, amara, rafael) */
  interviewerId: z.string().optional(),

  /** Uploaded documents — content truncated to first 3000 chars by frontend */
  documents: z.array(z.object({
    name: z.string(),
    content: z.string(),
  })).default([]),

  /** Full conversation history (assistant + user messages) */
  history: z.array(z.object({
    role: z.enum(['assistant', 'user']),
    content: z.string(),
  })).max(30).default([]),

  /** User's latest answer (empty/absent on first turn to get opening question) */
  userMessage: z.string().optional(),

  /** When true, synthesize the conversation into a structured engagement brief */
  finalize: z.boolean().default(false),
});

export type InterviewTurnRequest = z.infer<typeof InterviewTurnSchema>;
