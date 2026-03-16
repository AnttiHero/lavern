/**
 * Challenge Routes — The Whiteshoe Challenge.
 *
 * POST /api/challenge — Upload two documents, get a blind comparison from Sonnet.
 *
 * Simple: no sessions, no workflows, no waiting.
 * User uploads two documents (Whiteshoe-created + challenger),
 * Sonnet scores both blind, returns scores. One API call. ~5 seconds.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { validateBody } from '../middleware/validation.js';
import {
  CHALLENGE_DIMENSIONS,
  buildComparisonSystemPrompt,
  buildComparisonUserPrompt,
} from './challenge-prompt.js';

// ── Schema ───────────────────────────────────────────────────────────────

const ChallengeSchema = z.object({
  /** Full text of the Whiteshoe-created document. */
  whiteshoeText: z.string().min(50).max(200_000),
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
  assignment: { A: 'human' | 'whiteshoe'; B: 'human' | 'whiteshoe' };
  winner: 'human' | 'whiteshoe' | 'tie';
  summary: string;
}

// ── Anthropic client (singleton) ─────────────────────────────────────────

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
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
    const whiteshoeIsA = Math.random() > 0.5;
    const docA = whiteshoeIsA ? body.whiteshoeText : body.humanText;
    const docB = whiteshoeIsA ? body.humanText : body.whiteshoeText;
    const assignment: { A: 'human' | 'whiteshoe'; B: 'human' | 'whiteshoe' } = {
      A: whiteshoeIsA ? 'whiteshoe' : 'human',
      B: whiteshoeIsA ? 'human' : 'whiteshoe',
    };

    try {
      // Call Sonnet directly via Anthropic SDK with assistant prefill to force JSON
      const systemPrompt = buildComparisonSystemPrompt();
      const userPrompt = buildComparisonUserPrompt(docA, docB);

      const response = await getClient().messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 4096,
        system: systemPrompt,
        messages: [
          { role: 'user', content: userPrompt },
          { role: 'assistant', content: '{' },  // Prefill forces JSON output
        ],
      });

      // Extract text from response
      let responseText = '{';  // Start with the prefilled brace
      for (const block of response.content) {
        if (block.type === 'text') {
          responseText += block.text;
        }
      }

      if (responseText.length <= 1) {
        throw new Error('No response from judge');
      }

      // Robust JSON extraction — handle fences, trailing text, thinking tags
      let cleanJson = responseText.trim();
      // Strip markdown code fences anywhere
      cleanJson = cleanJson.replace(/```(?:json)?\s*/g, '').replace(/```/g, '');
      // Strip thinking tags if present
      cleanJson = cleanJson.replace(/<thinking>[\s\S]*?<\/thinking>/g, '');
      // Find the outermost { ... } JSON object
      const firstBrace = cleanJson.indexOf('{');
      if (firstBrace >= 0) {
        let depth = 0;
        let lastBrace = firstBrace;
        for (let i = firstBrace; i < cleanJson.length; i++) {
          if (cleanJson[i] === '{') depth++;
          else if (cleanJson[i] === '}') { depth--; if (depth === 0) { lastBrace = i; break; } }
        }
        cleanJson = cleanJson.substring(firstBrace, lastBrace + 1);
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

      // Clamp overall scores to 0-100 and guard against NaN
      const rawA = Number(parsed.overallA);
      const rawB = Number(parsed.overallB);
      const overallA = Number.isFinite(rawA) ? Math.round(Math.max(0, Math.min(100, rawA))) : 0;
      const overallB = Number.isFinite(rawB) ? Math.round(Math.max(0, Math.min(100, rawB))) : 0;

      // Determine winner
      const whiteshoeScore = assignment.A === 'whiteshoe' ? overallA : overallB;
      const humanScore = assignment.A === 'human' ? overallA : overallB;

      let winner: 'human' | 'whiteshoe' | 'tie';
      if (whiteshoeScore > humanScore) {
        winner = 'whiteshoe';
      } else if (humanScore > whiteshoeScore) {
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
        error: 'Blind comparison failed. Please try again.',
      });
    }
  });
}
