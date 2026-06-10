/**
 * Briefing Routes — LLM-powered intake analysis + conversational interview.
 *
 * POST /api/briefing/analyze    — Analyze client intake and generate engagement brief
 * POST /api/briefing/interview  — Conversational interview turn (SSE streaming)
 */

import type { FastifyInstance } from 'fastify';
import { BriefingAnalyzeRequestSchema, BriefingAnalyzeResponseSchema } from '../briefing/briefing-schema.js';
import { analyzeBriefing } from '../briefing/briefing-analyzer.js';
import { InterviewTurnSchema } from '../briefing/interview-schema.js';
import { buildInterviewSystemPrompt, buildFinalizationSystemPrompt } from '../briefing/interview-prompt.js';
import { config } from '../../config.js';
import { createApiKeyAccessor } from '../../utils/ensure-api-key.js';
import { createLogger } from '../../utils/logger.js';
import { crossProviderChat } from '../../providers/cross-provider-chat.js';

const logger = createLogger('BRIEFING');
const API_KEY_LAZY = createApiKeyAccessor('interview calls');
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
// Streaming model alias — Sonnet 4.5 covers the router tier on Anthropic.
// Only the Anthropic streaming branch reads this (non-streaming paths use
// `crossProviderChat({ tier: 'sonnet' })` which resolves the same model).
const INTERVIEW_MODEL = config.routerModel;

/**
 * Run a multi-turn briefing call against the active provider.
 *
 * Used for the non-streaming finalization step. The streaming
 * conversational turn (below) still hits Anthropic directly when
 * config.provider === 'anthropic'; other providers fall back to a
 * one-shot crossProviderChat call wrapped in an SSE envelope so the
 * route surface stays identical.
 */
async function callProvider(params: {
  system: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  maxTokens?: number;
}): Promise<string> {
  const { text } = await crossProviderChat({
    system: params.system,
    messages: params.messages,
    tier: 'sonnet', // INTERVIEW_MODEL was config.routerModel — same tier
    maxTokens: params.maxTokens ?? 4096,
  });
  return text;
}

export function registerBriefingRoutes(fastify: FastifyInstance): void {

  // ── POST /api/briefing/analyze ──────────────────────────────────────

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
      logger.error('Analysis failed', {
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
        name: err instanceof Error ? err.name : undefined,
      });
      return reply.status(500).send({
        error: 'Briefing analysis failed',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // ── POST /api/briefing/interview ────────────────────────────────────

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

    // Build conversation messages for the Anthropic API
    const allMessages = userMessage
      ? [...history, { role: 'user' as const, content: userMessage }]
      : history;

    // ── Finalization: structured output (non-streaming) ───────────────
    if (finalize) {
      try {
        const systemPrompt = buildFinalizationSystemPrompt({ workflowId, documents });

        const transcript = allMessages
          .map(m => `${m.role === 'user' ? 'Client' : 'Interviewer'}: ${m.content}`)
          .join('\n\n');

        const text = await callProvider({
          system: systemPrompt,
          messages: [{
            role: 'user',
            content: `## Interview Transcript\n\n${transcript}\n\n---\nSynthesize the above into the structured engagement brief. Respond with valid JSON matching the required schema. Return ONLY the JSON object, no markdown fencing or explanation.`,
          }],
        });

        // Parse structured JSON from response
        let jsonText = text.trim();
        if (jsonText.startsWith('```')) {
          jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
        }

        const rawResult = JSON.parse(jsonText);
        const validated = BriefingAnalyzeResponseSchema.safeParse(rawResult);

        if (!validated.success) {
          logger.error('Finalization schema validation failed', {
            issues: validated.error.issues,
          });
          throw new Error('Finalization did not return a valid structured response');
        }

        return reply.send(validated.data);
      } catch (err) {
        logger.error('Finalization failed', {
          message: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
          name: err instanceof Error ? err.name : undefined,
        });
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

    // Build Anthropic messages array
    const apiMessages: Array<{ role: 'user' | 'assistant'; content: string }> =
      allMessages.length > 0
        ? allMessages.map(m => ({ role: m.role, content: m.content }))
        : [{ role: 'user', content: 'Begin the interview.' }];

    // Ensure messages alternate properly (Anthropic requires user→assistant→user...)
    if (apiMessages[0].role === 'assistant') {
      apiMessages.unshift({ role: 'user', content: '[Interview begins]' });
    }

    // Tell Fastify we're taking over the response completely
    reply.hijack();

    // Track client disconnect via the response socket (not request — request.raw.close fires on hijack)
    let clientDisconnected = false;
    reply.raw.on('close', () => { clientDisconnected = true; });

    try {
      // Set up SSE response (shared by both provider branches)
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });

      // ── Non-Anthropic providers: one-shot fallback ──────────────────
      // Anthropic-native streaming with extended thinking blocks (below)
      // doesn't translate to Mistral / local Ollama. For those providers
      // we run a single crossProviderChat call and emit the whole reply
      // as one SSE text event. Same on-wire envelope, no streaming UX.
      // The "no model data crosses to api.anthropic.com" guarantee holds.
      // (`managed` keeps the native streaming path below — it uses the
      // Anthropic API under the hood.)
      if (config.provider !== 'anthropic' && config.provider !== 'managed') {
        try {
          const { text } = await crossProviderChat({
            system: systemPrompt,
            messages: apiMessages,
            tier: 'sonnet',
            maxTokens: 1600,
          });
          // Strip any <thinking>…</thinking> tags the model may have
          // emitted — some local models leak the scratchpad into output.
          const cleaned = (text ?? '').replace(/<thinking>[\s\S]*?<\/thinking>/g, '').trim();
          if (!clientDisconnected && cleaned) {
            reply.raw.write(`data: ${JSON.stringify({ type: 'text', content: cleaned })}\n\n`);
          }
          if (!clientDisconnected) {
            reply.raw.write(`data: ${JSON.stringify({ type: 'done', turn: turnNumber + 1 })}\n\n`);
          }
        } catch (err) {
          if (!clientDisconnected) {
            reply.raw.write(`data: ${JSON.stringify({
              type: 'error',
              content: err instanceof Error ? err.message : String(err),
            })}\n\n`);
          }
        }
        reply.raw.end();
        return;
      }

      // ── Anthropic / managed: native token-by-token SSE streaming ─────
      // Stream from Anthropic API using raw fetch + SSE parsing.
      // Enable extended thinking so the model reasons internally (filtered out)
      // and produces a clean conversational response.
      const apiRes = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
          'x-api-key': API_KEY_LAZY.value,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: INTERVIEW_MODEL,
          max_tokens: 1600,
          thinking: { type: 'enabled', budget_tokens: 1024 },
          system: systemPrompt,
          messages: apiMessages,
          stream: true,
        }),
      });

      if (!apiRes.ok) {
        const errText = await apiRes.text();
        reply.raw.write(`data: ${JSON.stringify({ type: 'error', content: `API error: ${errText}` })}\n\n`);
        reply.raw.end();
        return;
      }

      if (!apiRes.body) {
        reply.raw.write(`data: ${JSON.stringify({ type: 'error', content: 'No response body' })}\n\n`);
        reply.raw.end();
        return;
      }

      // Pipe Anthropic SSE stream → parse content_block_delta → forward to client.
      // Track content block types to skip thinking blocks; also strip any
      // <thinking>…</thinking> tags the model might emit as raw text.
      const reader = apiRes.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let insideThinkingBlock = false;   // API-level thinking content block
      let insideThinkingTag = false;     // Model-emitted <thinking> raw text

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done || clientDisconnected) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const jsonStr = line.slice(6).trim();
            if (!jsonStr) continue;

            try {
              const event = JSON.parse(jsonStr);

              // Track content block type (text vs thinking)
              if (event.type === 'content_block_start') {
                insideThinkingBlock = event.content_block?.type === 'thinking';
              }

              if (
                event.type === 'content_block_delta' &&
                event.delta?.type === 'text_delta' &&
                event.delta.text &&
                !insideThinkingBlock
              ) {
                let chunk: string = event.delta.text;

                // Strip <thinking>…</thinking> tags emitted as raw text
                if (insideThinkingTag) {
                  const closeIdx = chunk.indexOf('</thinking>');
                  if (closeIdx !== -1) {
                    chunk = chunk.slice(closeIdx + '</thinking>'.length);
                    insideThinkingTag = false;
                  } else {
                    continue; // still inside thinking tag — skip entire chunk
                  }
                }

                // Check if a new <thinking> tag opens in this chunk
                const openIdx = chunk.indexOf('<thinking>');
                if (openIdx !== -1) {
                  const before = chunk.slice(0, openIdx);
                  const afterOpen = chunk.slice(openIdx + '<thinking>'.length);
                  const closeIdx = afterOpen.indexOf('</thinking>');
                  if (closeIdx !== -1) {
                    chunk = before + afterOpen.slice(closeIdx + '</thinking>'.length);
                  } else {
                    chunk = before;
                    insideThinkingTag = true;
                  }
                }

                if (chunk) {
                  reply.raw.write(`data: ${JSON.stringify({ type: 'text', content: chunk })}\n\n`);
                }
              }
            } catch { /* skip malformed */ }
          }
        }
      } finally {
        reader.releaseLock();
      }

      if (!clientDisconnected) {
        reply.raw.write(`data: ${JSON.stringify({ type: 'done', turn: turnNumber + 1 })}\n\n`);
      }
      reply.raw.end();
    } catch (err) {
      logger.error('Interview turn failed', {
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
        name: err instanceof Error ? err.name : undefined,
      });
      const errMsg = err instanceof Error ? err.message : String(err);
      if (!reply.raw.headersSent) {
        reply.raw.writeHead(500, { 'Content-Type': 'application/json' });
        reply.raw.end(JSON.stringify({ error: 'Interview turn failed', message: errMsg }));
      } else {
        reply.raw.write(`data: ${JSON.stringify({ type: 'error', content: errMsg })}\n\n`);
        reply.raw.end();
      }
    }
  });
}
