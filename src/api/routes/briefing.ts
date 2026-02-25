/**
 * Briefing Routes — LLM-powered intake analysis + conversational interview.
 *
 * POST /api/briefing/analyze    — Analyze client intake and generate engagement brief
 * POST /api/briefing/interview  — Conversational interview turn (SSE streaming)
 */

import type { FastifyInstance } from 'fastify';
import { query as sdkQuery } from '@anthropic-ai/claude-agent-sdk';
import { BriefingAnalyzeRequestSchema, BriefingAnalyzeResponseSchema } from '../briefing/briefing-schema.js';
import { analyzeBriefing } from '../briefing/briefing-analyzer.js';
import { InterviewTurnSchema } from '../briefing/interview-schema.js';
import { buildInterviewSystemPrompt, buildFinalizationSystemPrompt } from '../briefing/interview-prompt.js';
import { zodToOutputFormat } from '../../types/output-schemas.js';

export function registerBriefingRoutes(fastify: FastifyInstance): void {

  // ── POST /api/briefing/analyze ──────────────────────────────────────
  //
  // Accepts client intake data (documents, Q&A, instructions) and returns:
  // - Sufficiency assessment (how ready is this for the agents?)
  // - Follow-up questions (what's missing?)
  // - Structured engagement brief (the master prompt)

  fastify.post('/api/briefing/analyze', async (request, reply) => {
    const parsed = BriefingAnalyzeRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid request body',
        details: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`),
      });
    }

    try {
      const result = await analyzeBriefing(parsed.data);
      return reply.send(result);
    } catch (err) {
      console.error('[BRIEFING] Analysis failed:', err);
      return reply.status(500).send({
        error: 'Briefing analysis failed',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // ── POST /api/briefing/interview ────────────────────────────────────
  //
  // Conversational interview powered by Haiku. Each call sends the full
  // conversation history + the user's latest answer. Returns:
  //   - SSE stream for normal turns (acknowledgment + next question)
  //   - JSON for finalization (structured engagement brief)

  fastify.post('/api/briefing/interview', async (request, reply) => {
    const parsed = InterviewTurnSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid request body',
        details: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`),
      });
    }

    const { workflowId, interviewerId, documents, history, userMessage, finalize } = parsed.data;
    const turnNumber = history.filter(m => m.role === 'user').length;
    const maxTurns = 8;

    // ── Finalization: structured output (non-streaming) ───────────────
    if (finalize) {
      try {
        const systemPrompt = buildFinalizationSystemPrompt({ workflowId, documents });

        // Build the full transcript as the user prompt
        const allMessages = userMessage
          ? [...history, { role: 'user' as const, content: userMessage }]
          : history;

        const transcript = allMessages
          .map(m => `${m.role === 'user' ? 'Client' : 'Interviewer'}: ${m.content}`)
          .join('\n\n');

        const prompt = `## Interview Transcript\n\n${transcript}\n\n---\nSynthesize the above into the structured engagement brief.`;

        const result = sdkQuery({
          prompt,
          options: {
            systemPrompt,
            model: 'claude-haiku-3-5-20250929',
            maxTurns: 1,
            outputFormat: zodToOutputFormat(BriefingAnalyzeResponseSchema),
          },
        });

        // Consume the async generator to get structured result
        let analysisResult = null;

        for await (const message of result) {
          if ('type' in message && message.type === 'result') {
            const resultMessage = message as Record<string, unknown>;
            if (resultMessage.subtype === 'success' && resultMessage.structured_output) {
              const validated = BriefingAnalyzeResponseSchema.safeParse(resultMessage.structured_output);
              if (validated.success) {
                analysisResult = validated.data;
              }
            }
          }
        }

        if (!analysisResult) {
          throw new Error('Finalization did not return a valid structured response');
        }

        return reply.send(analysisResult);
      } catch (err) {
        console.error('[INTERVIEW] Finalization failed:', err);
        return reply.status(500).send({
          error: 'Interview finalization failed',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // ── Conversational turn: SSE streaming ────────────────────────────
    const systemPrompt = buildInterviewSystemPrompt({
      workflowId,
      interviewerId,
      documents,
      turnNumber,
      maxTurns,
    });

    // Build prompt from conversation history
    const allMessages = userMessage
      ? [...history, { role: 'user' as const, content: userMessage }]
      : history;

    const prompt = allMessages.length > 0
      ? allMessages
          .map(m => `${m.role === 'user' ? 'Client' : 'Interviewer'}: ${m.content}`)
          .join('\n\n')
      : 'Begin the interview.';

    // Track client disconnect
    let clientDisconnected = false;
    request.raw.on('close', () => { clientDisconnected = true; });

    try {
      // Set up SSE response
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });

      const result = sdkQuery({
        prompt,
        options: {
          systemPrompt,
          model: 'claude-haiku-3-5-20250929',
          maxTurns: 1,
        },
      });

      for await (const message of result) {
        if (clientDisconnected) break;
        if (!('type' in message)) continue;

        if (message.type === 'assistant' && message.message?.content) {
          for (const block of message.message.content) {
            if ('text' in block) {
              reply.raw.write(`data: ${JSON.stringify({ type: 'text', content: block.text })}\n\n`);
            }
          }
        }

        if (message.type === 'result') {
          if ('subtype' in message && message.subtype !== 'success') {
            const errors = (message as Record<string, unknown>).errors;
            reply.raw.write(`data: ${JSON.stringify({ type: 'error', content: `Generation failed: ${JSON.stringify(errors)}` })}\n\n`);
          }
        }
      }

      if (!clientDisconnected) {
        reply.raw.write(`data: ${JSON.stringify({ type: 'done', turn: turnNumber + 1 })}\n\n`);
      }
      reply.raw.end();
    } catch (err) {
      console.error('[INTERVIEW] Turn failed:', err);
      if (!reply.raw.headersSent) {
        return reply.status(500).send({
          error: 'Interview turn failed',
          message: err instanceof Error ? err.message : String(err),
        });
      }
      reply.raw.write(`data: ${JSON.stringify({ type: 'error', content: err instanceof Error ? err.message : String(err) })}\n\n`);
      reply.raw.end();
    }
  });
}
