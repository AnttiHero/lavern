/**
 * Unit Tests — Tool Converter (src/providers/tool-converter.ts)
 *
 * Tests the bridge between MCP tool definitions and OpenAI function format.
 */

import { describe, it, expect, vi } from 'vitest';
import { buildToolRegistry, type McpServer } from '../../src/providers/tool-converter.js';

function createMockMcpServer(tools: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }>, callResult?: { content: Array<{ type: string; text?: string }>; isError?: boolean }): McpServer {
  return {
    listTools: async () => ({ tools }),
    callTool: async () => callResult ?? { content: [{ type: 'text', text: 'OK' }] },
  };
}

describe('buildToolRegistry', () => {
  it('converts MCP tools to OpenAI function definitions', async () => {
    const server = createMockMcpServer([
      { name: 'debate_board', description: 'Post findings', inputSchema: { type: 'object', properties: { finding: { type: 'string' } } } },
      { name: 'score', description: 'Score document' },
    ]);

    const registry = await buildToolRegistry(server);
    expect(registry.definitions).toHaveLength(2);
    expect(registry.definitions[0].type).toBe('function');
    expect(registry.definitions[0].function.name).toBe('debate_board');
    expect(registry.definitions[0].function.description).toBe('Post findings');
    expect(registry.definitions[0].function.parameters).toEqual({
      type: 'object',
      properties: { finding: { type: 'string' } },
    });
  });

  it('uses fallback description when none provided', async () => {
    const server = createMockMcpServer([{ name: 'mystery_tool' }]);
    const registry = await buildToolRegistry(server);
    expect(registry.definitions[0].function.description).toBe('Tool: mystery_tool');
  });

  it('uses empty object schema when none provided', async () => {
    const server = createMockMcpServer([{ name: 'no_schema' }]);
    const registry = await buildToolRegistry(server);
    expect(registry.definitions[0].function.parameters).toEqual({ type: 'object', properties: {} });
  });

  it('callTool extracts text from successful result', async () => {
    const server = createMockMcpServer(
      [{ name: 'test' }],
      { content: [{ type: 'text', text: 'Result line 1' }, { type: 'text', text: 'Result line 2' }] },
    );
    const registry = await buildToolRegistry(server);
    const result = await registry.callTool('test', {});
    expect(result).toBe('Result line 1\nResult line 2');
  });

  it('callTool returns error text for isError responses', async () => {
    const server = createMockMcpServer(
      [{ name: 'test' }],
      { content: [{ type: 'text', text: 'Something broke' }], isError: true },
    );
    const registry = await buildToolRegistry(server);
    const result = await registry.callTool('test', {});
    expect(result).toContain('[TOOL ERROR]');
    expect(result).toContain('Something broke');
  });

  it('callTool handles empty error content', async () => {
    const server = createMockMcpServer(
      [{ name: 'test' }],
      { content: [], isError: true },
    );
    const registry = await buildToolRegistry(server);
    const result = await registry.callTool('test', {});
    expect(result).toContain('Unknown tool error');
  });

  it('callTool catches exceptions and returns error string', async () => {
    const server: McpServer = {
      listTools: async () => ({ tools: [{ name: 'throws' }] }),
      callTool: async () => { throw new Error('Connection lost'); },
    };
    const registry = await buildToolRegistry(server);
    const result = await registry.callTool('throws', {});
    expect(result).toContain('[TOOL ERROR]');
    expect(result).toContain('Connection lost');
  });

  it('callTool filters non-text content blocks', async () => {
    const server = createMockMcpServer(
      [{ name: 'test' }],
      { content: [{ type: 'image', text: undefined }, { type: 'text', text: 'Real content' }] },
    );
    const registry = await buildToolRegistry(server);
    const result = await registry.callTool('test', {});
    expect(result).toBe('Real content');
  });

  it('handles empty tool list', async () => {
    const server = createMockMcpServer([]);
    const registry = await buildToolRegistry(server);
    expect(registry.definitions).toEqual([]);
  });
});
