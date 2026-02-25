/**
 * Briefing Routes — LLM-powered intake analysis + conversational interview.
 *
 * POST /api/briefing/analyze    — Analyze client intake and generate engagement brief
 * POST /api/briefing/interview  — Conversational interview turn (SSE streaming)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { BriefingAnalyzeRequestSchema, BriefingAnalyzeResponseSchema } from '../briefing/briefing-schema.js';
import { analyzeBriefing } from '../briefing/briefing-analyzer.js';
import { InterviewTurnSchema } from '../briefing/interview-schema.js';
import { buildInterviewSystemPrompt, buildFinalizationSystemPrompt } from '../briefing/interview-prompt.js';
import { config } from '../../config.js';

/**
 * Load ANTHROPIC_API_KEY from .env if not already in process.env.
 */
function ensureApiKey(): string {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;

  try {
    const envPath = path.resolve(process.cwd(), '.env');
    const content = fs.readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const match = line.match(/^ANTHROPIC_API_KEY=(.+)/);
      if (match) {
        const key = match[1].trim();
        process.env.ANTHROPIC_API_KEY = key;
        return key;
      }
    }
  } catch { /* .env not found */ }

  throw new Error('ANTHROPIC_API_KEY not found in environment or .env file');
}

const API_KEY = ensureApiKey();
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const INTERVIEW_MODEL = config.routerModel; // Sonnet — old Haiku was too dumb for interviews

/**
 * Call Anthropic Messages API directly (non-streaming).
 */
async function callAnthropic(params: {
  system: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  maxTokens?: number;
}): Promise<string> {
  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: INTERVIEW_MODEL,
      max_tokens: params.maxTokens ?? 4096,
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

  const textBlock = data.content.find(b => b.type === 'text');
  return textBlock?.text ?? '';
}

/**
 * Stream Anthropic Messages API and forward SSE chunks to client.
 */
async function streamAnthropic(params: {
  system: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  maxTokens?: number;
  onText: (text: string) => void;
  isDisconnected: () => boolean;
}): Promise<void> {
  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: INTERVIEW_MODEL,
      max_tokens: params.maxTokens ?? 400,
      system: params.system,
      messages: params.messages,
      stream: true,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic API error (${res.status}): ${errText}`);
  }

  if (!res.body) throw new Error('No response body');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (params.isDisconnected()) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const jsonStr = line.slice(6).trim();
        if (!jsonStr) continue;

        try {
          const event = JSON.parse(jsonStr) as Record<string, unknown>;
          if (
            event.type === 'content_block_delta' &&
            (event.delta as Record<string, unknown>)?.type === 'text_delta'
          ) {
            const text = (event.delta as { text: string }).text;
            if (text) params.onText(text);
          }
        } catch {
          // Skip malformed JSON
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
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
      console.error('[BRIEFING] Analysis failed:', err);
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

        const text = await callAnthropic({
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
          console.error('[INTERVIEW] Finalization schema validation failed:', validated.error);
          throw new Error('Finalization did not return a valid structured response');
        }

        return reply.send(validated.data);
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
      // Set up SSE response
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });

      // Stream from Anthropic API using raw fetch + SSE parsing
      const apiRes = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
          'x-api-key': API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: INTERVIEW_MODEL,
          max_tokens: 400,
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

      // Pipe Anthropic SSE stream → parse content_block_delta → forward to client
      const reader = apiRes.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

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
              if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta' && event.delta.text) {
                reply.raw.write(`data: ${JSON.stringify({ type: 'text', content: event.delta.text })}\n\n`);
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
      console.error('[INTERVIEW] Turn failed:', err);
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
