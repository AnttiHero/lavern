/**
 * Tool Converter — Bridges MCP tool definitions to OpenAI function format.
 *
 * The MCP server (`createShemMcpServer`) wraps all 21 tool modules using
 * the Claude Agent SDK's `tool()` function. These tools use Zod schemas
 * for parameters and return `{ content: [{ type: 'text', text: '...' }] }`.
 *
 * For the Mistral path we need:
 * 1. OpenAI-format function definitions (for the API request)
 * 2. A way to call the tools (execute handler, get text back)
 *
 * The MCP server already provides both via its standard interface:
 * - `server.listTools()` → tool names + JSON schemas
 * - `server.callTool(name, args)` → execute and get result
 *
 * This module wraps those interfaces into a clean API for the executor.
 */

import type { MistralToolDefinition } from './mistral.js';

// ── Types ───────────────────────────────────────────────────────────────

/**
 * A resolved tool registry ready for the Mistral executor.
 */
export interface ToolRegistry {
  /** OpenAI function definitions (for the API request) */
  definitions: MistralToolDefinition[];
  /** Call a tool by name, returns text result */
  callTool: (name: string, args: Record<string, unknown>) => Promise<string>;
}

// ── MCP Server Interface ────────────────────────────────────────────────
// The createSdkMcpServer returns an opaque object. We define the minimal
// interface we need to interact with it.

interface McpToolInfo {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface McpServer {
  listTools: () => Promise<{ tools: McpToolInfo[] }> | { tools: McpToolInfo[] };
  callTool: (request: { name: string; arguments: Record<string, unknown> }) => Promise<{
    content: Array<{ type: string; text?: string }>;
    isError?: boolean;
  }>;
}

// ── Converter ───────────────────────────────────────────────────────────

/**
 * Build a ToolRegistry from an MCP server instance.
 *
 * Extracts tool definitions and wraps the callTool interface.
 * This is the primary bridge between the Claude Agent SDK's MCP tools
 * and the OpenAI-compatible function calling format.
 */
export async function buildToolRegistry(mcpServer: McpServer): Promise<ToolRegistry> {
  // Get all registered tools from the MCP server
  const listResult = await mcpServer.listTools();
  const tools = listResult.tools;

  // Convert to OpenAI function format
  const definitions: MistralToolDefinition[] = tools.map(t => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description ?? `Tool: ${t.name}`,
      parameters: t.inputSchema ?? { type: 'object', properties: {} },
    },
  }));

  // Wrap callTool with text extraction
  const callTool = async (name: string, args: Record<string, unknown>): Promise<string> => {
    try {
      const result = await mcpServer.callTool({ name, arguments: args });

      if (result.isError) {
        const errorText = result.content
          .filter(c => c.type === 'text' && c.text)
          .map(c => c.text!)
          .join('\n');
        return `[TOOL ERROR] ${errorText || 'Unknown tool error'}`;
      }

      return result.content
        .filter(c => c.type === 'text' && c.text)
        .map(c => c.text!)
        .join('\n');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return `[TOOL ERROR] ${name} failed: ${message}`;
    }
  };

  return { definitions, callTool };
}
