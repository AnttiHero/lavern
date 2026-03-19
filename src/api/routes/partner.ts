/**
 * Partner Routes — Managing partner consultation (conversational intake).
 *
 * POST /api/partner/consult — Conversational turn (SSE streaming) or
 *                              finalization (structured JSON recommendation).
 *
 * Pattern follows POST /api/briefing/interview exactly.
 */

import type { FastifyInstance } from 'fastify';
import { PartnerConsultSchema, PartnerRecommendationSchema } from '../partner/partner-schema.js';
import { buildPartnerSystemPrompt, buildPartnerFinalizationPrompt } from '../partner/partner-prompt.js';
import { config } from '../../config.js';
import { createApiKeyAccessor } from '../../utils/ensure-api-key.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('PARTNER');
const API_KEY_LAZY = createApiKeyAccessor('partner consultation');
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const PARTNER_MODEL = config.routerModel;

// ── Non-streaming Anthropic call ─────────────────────────────────────────

async function callAnthropic(params: {
  system: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  maxTokens?: number;
}): Promise<string> {
  const maxTokens = params.maxTokens ?? 4096;
  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': API_KEY_LAZY.value,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: PARTNER_MODEL,
      max_tokens: maxTokens,
      thinking: { type: 'enabled', budget_tokens: Math.min(2048, Math.floor(maxTokens * 0.5)) },
      system: params.system,
      messages: params.messages,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic API error (${res.status}): ${errText}`);
  }

  const data = await res.json() as {
    content: Array<{ type: string; text?: string }>;
  };

  const textBlock = Array.isArray(data.content)
    ? data.content.find(b => b.type === 'text')
    : undefined;
  return textBlock?.text ?? '';
}

// ── Route registration ───────────────────────────────────────────────────

export function registerPartnerRoutes(fastify: FastifyInstance): void {

  fastify.post('/api/partner/consult', async (request, reply) => {
    const parsed = PartnerConsultSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid request body',
        details: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`),
      });
    }

    const { documents, history, userMessage, finalize } = parsed.data;
    const turnNumber = history.filter(m => m.role === 'user').length;

    // Build conversation messages
    const allMessages = userMessage
      ? [...history, { role: 'user' as const, content: userMessage }]
      : history;

    // ── Finalization: structured recommendation (non-streaming) ────────
    if (finalize) {
      try {
        const systemPrompt = buildPartnerFinalizationPrompt({ documents });

        const transcript = allMessages
          .map(m => `${m.role === 'user' ? 'Client' : 'Partner'}: ${m.content}`)
          .join('\n\n');

        const text = await callAnthropic({
          system: systemPrompt,
          messages: [{
            role: 'user',
            content: `## Consultation Transcript\n\n${transcript}\n\n---\nBased on this consultation, produce your structured engagement recommendation. Return ONLY the JSON object.`,
          }],
        });

        // Parse structured JSON
        let jsonText = text.trim();
        if (jsonText.startsWith('```')) {
          jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
        }

        const rawResult = JSON.parse(jsonText);
        const validated = PartnerRecommendationSchema.safeParse(rawResult);

        if (!validated.success) {
          logger.error('Finalization schema validation failed', { error: validated.error });
          // Return raw result anyway — the frontend can handle partial data
          return reply.send(rawResult);
        }

        return reply.send(validated.data);
      } catch (err) {
        logger.error('Finalization failed', { error: err });
        return reply.status(500).send({
          error: 'Partner finalization failed',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // ── Conversational turn: SSE streaming ──────────────────────────────
    const systemPrompt = buildPartnerSystemPrompt({
      documents,
      turnNumber,
    });

    const apiMessages: Array<{ role: 'user' | 'assistant'; content: string }> =
      allMessages.length > 0
        ? allMessages.map(m => ({ role: m.role, content: m.content }))
        : [{ role: 'user', content: 'Begin the consultation.' }];

    // Ensure messages alternate properly
    if (apiMessages[0].role === 'assistant') {
      apiMessages.unshift({ role: 'user', content: '[Consultation begins]' });
    }

    // Take over the response
    reply.hijack();

    let clientDisconnected = false;
    reply.raw.on('close', () => { clientDisconnected = true; });

    try {
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });

      const apiRes = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
          'x-api-key': API_KEY_LAZY.value,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: PARTNER_MODEL,
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

      // Pipe SSE stream — filter thinking blocks
      const reader = apiRes.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let insideThinkingBlock = false;
      let insideThinkingTag = false;

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

                // Strip <thinking> tags emitted as raw text
                if (insideThinkingTag) {
                  const closeIdx = chunk.indexOf('</thinking>');
                  if (closeIdx !== -1) {
                    chunk = chunk.slice(closeIdx + '</thinking>'.length);
                    insideThinkingTag = false;
                  } else {
                    continue;
                  }
                }

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
      logger.error('Turn failed', { error: err });
      const errMsg = err instanceof Error ? err.message : String(err);
      if (!reply.raw.headersSent) {
        reply.raw.writeHead(500, { 'Content-Type': 'application/json' });
        reply.raw.end(JSON.stringify({ error: 'Partner consultation failed', message: errMsg }));
      } else {
        reply.raw.write(`data: ${JSON.stringify({ type: 'error', content: errMsg })}\n\n`);
        reply.raw.end();
      }
    }
  });
}
