/**
 * Challenge Routes — The Marble Challenge.
 *
 * POST /api/challenge — Upload two documents, get a blind comparison from Opus.
 *
 * Simple: no sessions, no workflows, no waiting.
 * User uploads two documents (Marble-created + human-created),
 * Opus scores both blind, returns scores. One API call. ~$0.50.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { validateBody } from '../middleware/validation.js';
import { query as sdkQuery } from '@anthropic-ai/claude-agent-sdk';
import {
  CHALLENGE_DIMENSIONS,
  buildComparisonSystemPrompt,
  buildComparisonUserPrompt,
} from './challenge-prompt.js';

// ── Schema ───────────────────────────────────────────────────────────────

const ChallengeSchema = z.object({
  /** Full text of the Marble-created document. */
  marbleText: z.string().min(50).max(200_000),
  /** Full text of the human-created document. */
  humanText: z.string().min(50).max(200_000),
});

type ChallengeBody = z.infer<typeof ChallengeSchema>;

// ── Response Types ───────────────────────────────────────────────────────

interface ComparisonDimension {
  name: string;
  description: string;
  scoreA: number;
  scoreB: number;
  weight: number;
}

interface ComparisonResult {
  dimensions: ComparisonDimension[];
  overallA: number;
  overallB: number;
  assignment: { A: 'human' | 'marble'; B: 'human' | 'marble' };
  winner: 'human' | 'marble' | 'tie';
  summary: string;
}

// ── Route Registration ──────────────────────────────────────────────────

export function registerChallengeRoutes(
  fastify: FastifyInstance,
): void {

  // ── POST /api/challenge — Blind comparison ────────────────────────────

  fastify.post('/api/challenge', async (request, reply) => {
    const body = validateBody<ChallengeBody>(ChallengeSchema, request, reply);
    if (!body) return;

    // Randomly assign A/B — coin flip so the judge doesn't know which is which
    const marbleIsA = Math.random() > 0.5;
    const docA = marbleIsA ? body.marbleText : body.humanText;
    const docB = marbleIsA ? body.humanText : body.marbleText;
    const assignment: { A: 'human' | 'marble'; B: 'human' | 'marble' } = {
      A: marbleIsA ? 'marble' : 'human',
      B: marbleIsA ? 'human' : 'marble',
    };

    try {
      // Call Opus for blind comparison
      const systemPrompt = buildComparisonSystemPrompt();
      const userPrompt = buildComparisonUserPrompt(docA, docB);

      const result = sdkQuery({
        prompt: userPrompt,
        options: {
          systemPrompt,
          model: 'claude-sonnet-4-5-20250929',
          maxTurns: 1,
        },
      });

      // Consume the async generator
      let responseText = '';
      for await (const message of result) {
        if (!('type' in message)) continue;
        if (message.type === 'assistant' && message.message?.content) {
          for (const block of message.message.content) {
            if ('text' in block) {
              responseText += block.text;
            }
          }
        }
        if (message.type === 'result') {
          if ('subtype' in message && message.subtype !== 'success') {
            const errors = (message as Record<string, unknown>).errors;
            throw new Error(`Comparison failed: ${JSON.stringify(errors)}`);
          }
        }
      }

      if (!responseText) {
        throw new Error('No response from judge');
      }

      // Parse the JSON response from Opus
      // Strip markdown code fences if present
      let cleanJson = responseText.trim();
      if (cleanJson.startsWith('```')) {
        cleanJson = cleanJson.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }

      const parsed = JSON.parse(cleanJson) as {
        dimensions: Array<{
          name: string;
          scoreA: number;
          scoreB: number;
          evidenceA?: string;
          evidenceB?: string;
        }>;
        overallA: number;
        overallB: number;
        summary: string;
      };

      // Build comparison result with dimension metadata
      const dimensions: ComparisonDimension[] = parsed.dimensions.map((d) => {
        const meta = CHALLENGE_DIMENSIONS.find(cd => cd.name === d.name);
        return {
          name: d.name,
          description: meta?.description ?? '',
          scoreA: Math.round(Math.max(0, Math.min(100, d.scoreA))),
          scoreB: Math.round(Math.max(0, Math.min(100, d.scoreB))),
          weight: meta?.weight ?? (1 / 6),
        };
      });

      const overallA = Math.round(parsed.overallA);
      const overallB = Math.round(parsed.overallB);

      // Determine winner
      const marbleScore = assignment.A === 'marble' ? overallA : overallB;
      const humanScore = assignment.A === 'human' ? overallA : overallB;

      let winner: 'human' | 'marble' | 'tie';
      if (marbleScore > humanScore) {
        winner = 'marble';
      } else if (humanScore > marbleScore) {
        winner = 'human';
      } else {
        winner = 'tie';
      }

      const comparisonResult: ComparisonResult = {
        dimensions,
        overallA,
        overallB,
        assignment,
        winner,
        summary: parsed.summary,
      };

      return reply.send(comparisonResult);

    } catch (err) {
      console.error('[CHALLENGE] Blind comparison failed:', err);
      return reply.status(500).send({
        error: 'Blind comparison failed',
        details: err instanceof Error ? err.message : String(err),
      });
    }
  });
}
