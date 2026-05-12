/**
 * Unit Tests — Challenge route (src/api/routes/challenge.ts)
 *
 * Regression test: the Lavern Challenge blind-comparison endpoint must not
 * use Anthropic's "assistant message prefill" pattern. Newer Opus models
 * (4.7+) reject conversations that end with role='assistant' with HTTP 400
 * "This model does not support assistant message prefill. The conversation
 * must end with a user message."
 *
 * The fix relies on the system prompt mandating JSON-only output + the
 * route's post-response cleanup (fence stripping, brace-matching extraction)
 * to recover valid JSON without prefill. This test pins the call shape so
 * a future refactor cannot silently reintroduce the prefill.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

// Hoisted mock spy so the @anthropic-ai/sdk mock factory can close over it.
const { mockMessagesCreate } = vi.hoisted(() => ({ mockMessagesCreate: vi.fn() }));

vi.mock('@anthropic-ai/sdk', () => {
  // v4 vitest strictness: vi.fn() used as a constructor must be a regular
  // function (not an arrow) — arrows are not [[Construct]]-able.
  const Anthropic = vi.fn().mockImplementation(function (this: unknown) {
    return { messages: { create: mockMessagesCreate } };
  });
  return { default: Anthropic };
});

// Import the route registration AFTER mocks land.
import { registerChallengeRoutes } from '../../src/api/routes/challenge.js';

function makeJudgeResponse(scores: { A: number; B: number } = { A: 80, B: 70 }) {
  // Mirror Anthropic's content-block response shape.
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        dimensions: [
          { name: 'Plain-Language', scoreA: scores.A, scoreB: scores.B, evidenceA: '', evidenceB: '' },
          { name: 'Accuracy',       scoreA: scores.A, scoreB: scores.B, evidenceA: '', evidenceB: '' },
          { name: 'Completeness',   scoreA: scores.A, scoreB: scores.B, evidenceA: '', evidenceB: '' },
          { name: 'Tone',           scoreA: scores.A, scoreB: scores.B, evidenceA: '', evidenceB: '' },
          { name: 'Structure',      scoreA: scores.A, scoreB: scores.B, evidenceA: '', evidenceB: '' },
          { name: 'Citations',      scoreA: scores.A, scoreB: scores.B, evidenceA: '', evidenceB: '' },
        ],
        overallA: scores.A,
        overallB: scores.B,
        summary: 'Both documents are competent; A is slightly more accessible.',
      }),
    }],
  };
}

describe('POST /api/challenge — Anthropic call shape', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    mockMessagesCreate.mockReset();
    mockMessagesCreate.mockResolvedValue(makeJudgeResponse());
    app = Fastify();
    registerChallengeRoutes(app);
    await app.ready();
  });

  async function fireChallenge() {
    return app.inject({
      method: 'POST',
      url: '/api/challenge',
      headers: { 'content-type': 'application/json' },
      payload: {
        lavernText: 'A' + 'a'.repeat(60), // > 50 chars (Zod min)
        humanText: 'B' + 'b'.repeat(60),
      },
    });
  }

  it('does NOT include an assistant prefill message (regression: HTTP 400 on Opus 4.7+)', async () => {
    const resp = await fireChallenge();
    expect(resp.statusCode).toBe(200);

    expect(mockMessagesCreate).toHaveBeenCalledTimes(1);
    const callArgs = mockMessagesCreate.mock.calls[0][0] as {
      messages: Array<{ role: string; content: unknown }>;
    };

    // The bug: messages used to end with `{ role: 'assistant', content: '{' }`.
    // The fix: the last (and only) message must be from the user.
    expect(callArgs.messages.length).toBeGreaterThanOrEqual(1);
    const lastMessage = callArgs.messages[callArgs.messages.length - 1];
    expect(lastMessage.role).toBe('user');

    // And no assistant-role message anywhere in the conversation.
    const assistantMessages = callArgs.messages.filter(m => m.role === 'assistant');
    expect(assistantMessages).toHaveLength(0);
  });

  it('passes the system prompt as a top-level `system` field (not inline)', async () => {
    await fireChallenge();
    const callArgs = mockMessagesCreate.mock.calls[0][0] as {
      system?: string;
      messages: Array<{ role: string; content: unknown }>;
    };
    expect(typeof callArgs.system).toBe('string');
    expect(callArgs.system!.length).toBeGreaterThan(50);
    // The system prompt mandates JSON-only output — the test pins that
    // expectation here so we notice if it ever degrades.
    expect(callArgs.system!.toUpperCase()).toContain('JSON');
  });

  it('returns a structured comparison result with a winner', async () => {
    const resp = await fireChallenge();
    expect(resp.statusCode).toBe(200);
    const body = JSON.parse(resp.payload);
    expect(body).toHaveProperty('dimensions');
    expect(body).toHaveProperty('overallA');
    expect(body).toHaveProperty('overallB');
    expect(body).toHaveProperty('assignment');
    expect(body).toHaveProperty('winner');
    expect(['human', 'lavern', 'tie']).toContain(body.winner);
  });

  it('surfaces a 500 error from the judge cleanly (not the raw stack)', async () => {
    mockMessagesCreate.mockRejectedValueOnce(new Error('judge unreachable'));
    const resp = await fireChallenge();
    expect(resp.statusCode).toBe(500);
    const body = JSON.parse(resp.payload);
    expect(body.error).toBeTruthy();
    // Don't leak internal error details to the user
    expect(body.error).not.toContain('judge unreachable');
  });
});
