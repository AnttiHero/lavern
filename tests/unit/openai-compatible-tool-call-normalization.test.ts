import { describe, expect, it } from 'vitest';
import { normalizeAssistantToolCallArguments } from '../../src/providers/mistral-executor.js';

describe('normalizeAssistantToolCallArguments', () => {
  it('replaces malformed tool-call argument strings with valid empty JSON', () => {
    const message = {
      role: 'assistant',
      content: null,
      tool_calls: [
        {
          id: 'call_bad',
          type: 'function',
          function: {
            name: 'post_finding',
            arguments: '{"content":',
          },
        },
      ],
    } as const;

    const normalized = normalizeAssistantToolCallArguments(message);

    expect(normalized.tool_calls?.[0]?.function.arguments).toBe('{}');
  });

  it('keeps already-valid tool-call argument strings unchanged', () => {
    const message = {
      role: 'assistant',
      content: null,
      tool_calls: [
        {
          id: 'call_ok',
          type: 'function',
          function: {
            name: 'post_finding',
            arguments: '{"content":"ok"}',
          },
        },
      ],
    } as const;

    expect(normalizeAssistantToolCallArguments(message)).toBe(message);
  });
});
