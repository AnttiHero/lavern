/**
 * Challenge Routes — The Lavern Challenge.
 *
 * POST /api/challenge — Upload two documents, get a blind comparison from Sonnet.
 *
 * Simple: no sessions, no workflows, no waiting.
 * User uploads two documents (Lavern-created + challenger),
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
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('CHALLENGE');

// ── Schema ───────────────────────────────────────────────────────────────

const ChallengeSchema = z.object({
  /** Full text of the Lavern-created document. */
  lavernText: z.string().min(50).max(200_000),
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
  assignment: { A: 'human' | 'lavern'; B: 'human' | 'lavern' };
  winner: 'human' | 'lavern' | 'tie';
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
    const lavernIsA = Math.random() > 0.5;
    const docA = lavernIsA ? body.lavernText : body.humanText;
    const docB = lavernIsA ? body.humanText : body.lavernText;
    const assignment: { A: 'human' | 'lavern'; B: 'human' | 'lavern' } = {
      A: lavernIsA ? 'lavern' : 'human',
      B: lavernIsA ? 'human' : 'lavern',
    };

    try {
      // Call Opus 4.7 directly via Anthropic SDK. The system prompt already
      // mandates JSON-only output (see buildComparisonSystemPrompt); the
      // downstream cleanup at lines 110-126 strips fences/thinking and
      // extracts the outermost {...} block, so we don't need to use an
      // assistant-prefill message to force JSON.
      //
      // Why prefill is gone: newer Opus models (4.7+) reject the
      // `[{user}, {assistant: "{"}]` shape with HTTP 400 "This model does
      // not support assistant message prefill. The conversation must end
      // with a user message." Relying on the system prompt + post-process
      // cleanup is both more robust and works on every model line.
      const systemPrompt = buildComparisonSystemPrompt();
      const userPrompt = buildComparisonUserPrompt(docA, docB);

      const response = await getClient().messages.create({
        model: 'claude-opus-4-7',
        max_tokens: 4096,
        system: systemPrompt,
        messages: [
          { role: 'user', content: userPrompt },
        ],
      });

      // Extract text from response
      let responseText = '';
      for (const block of response.content) {
        if (block.type === 'text') {
          responseText += block.text;
        }
      }

      if (responseText.length === 0) {
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
      const dimensions: ComparisonDimension[] = (Array.isArray(parsed.dimensions) ? parsed.dimensions : []).map((d) => {
        const meta = CHALLENGE_DIMENSIONS.find(cd => cd.name === d.name);
        const sA = Number(d.scoreA);
        const sB = Number(d.scoreB);
        return {
          name: d.name ?? 'Unknown',
          description: meta?.description ?? '',
          scoreA: Number.isFinite(sA) ? Math.round(Math.max(0, Math.min(100, sA))) : 0,
          scoreB: Number.isFinite(sB) ? Math.round(Math.max(0, Math.min(100, sB))) : 0,
          weight: meta?.weight ?? (1 / 6),
        };
      });

      // Clamp overall scores to 0-100 and guard against NaN
      const rawA = Number(parsed.overallA);
      const rawB = Number(parsed.overallB);
      const overallA = Number.isFinite(rawA) ? Math.round(Math.max(0, Math.min(100, rawA))) : 0;
      const overallB = Number.isFinite(rawB) ? Math.round(Math.max(0, Math.min(100, rawB))) : 0;

      // Determine winner
      const lavernScore = assignment.A === 'lavern' ? overallA : overallB;
      const humanScore = assignment.A === 'human' ? overallA : overallB;

      let winner: 'human' | 'lavern' | 'tie';
      if (lavernScore > humanScore) {
        winner = 'lavern';
      } else if (humanScore > lavernScore) {
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
      logger.error('Blind comparison failed', { error: err });
      return reply.status(500).send({
        error: 'Blind comparison failed. Please try again.',
      });
    }
  });
}
