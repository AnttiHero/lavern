/**
 * Remote MCP Bridge — Live Tool Dispatch (Stage 2).
 *
 * Stage 1 shipped the JSON-RPC transport, auth, and allowlist — but
 * `tools/call` returned a `not_yet_wired` stub. This module lights up the
 * rest: it reflects the in-process MCP tool registry into a session-scoped
 * dispatcher, validates arguments against each tool's Zod schema, and
 * returns the tool's `CallToolResult` verbatim.
 *
 * Design notes:
 *
 *   - **Prefix handling.** The Agent SDK registers tools with un-prefixed
 *     names (`search_knowledge_base`). The MCP protocol exposes them with
 *     a `mcp__<server>__` prefix (`mcp__shem__search_knowledge_base`). The
 *     Counsel allowlist stores the prefixed form, so we strip the prefix
 *     at dispatch time before matching the internal tool.
 *
 *   - **Session scoping.** Every tool closes over the `SessionState` it was
 *     created with (event bus, memoryDir, debate state). The bridge is
 *     therefore session-scoped too: each inbound request carries an
 *     `X-Lavern-Session-Id` that session-auth resolves to a live
 *     SessionState, and the dispatcher builds the registry against THAT
 *     state for THAT request.
 *
 *   - **Counsel subset only.** Stage 2 only wires the 12 Counsel tools (see
 *     tool-allowlist.ts). Attempting to register a debate-board or
 *     approval-gate tool would require machinery the Counsel workflow
 *     doesn't need, and would broaden the remote attack surface. Stage 3+
 *     explicitly extends the registry when we expand to Review/Adversarial.
 */

import { z } from 'zod';
import type { SdkMcpToolDefinition } from '@anthropic-ai/claude-agent-sdk';
import type { SessionState } from '../../session/session-state.js';
import { createWorkflowTools } from '../tools/workflow-engine.js';
import { createMemoryTools } from '../tools/memory-system.js';
import { createKnowledgeBaseTools } from '../tools/knowledge-base.js';
import { createHandoffTools } from '../tools/handoff.js';
import { createFeedbackLoopTools } from '../tools/feedback-loop.js';
import { COUNSEL_REMOTE_TOOLS, isRemoteToolAllowed } from './tool-allowlist.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('MCP-BRIDGE-DISPATCH');

/** MCP protocol prefix we use for this server. Must match the `name` field
 *  in `createSdkMcpServer({ name: 'shem', ... })` over in `server.ts`. */
const PREFIX = 'mcp__shem__';

/** Strip the canonical MCP prefix from a prefixed name. Returns the input
 *  unchanged if the prefix is absent — callers should have rejected that
 *  via `isRemoteToolAllowed` before getting here. */
function stripPrefix(name: string): string {
  return name.startsWith(PREFIX) ? name.slice(PREFIX.length) : name;
}

/**
 * Build the dispatchable Counsel tool registry for a live session.
 *
 * Keyed by the internal (un-prefixed) tool name. Keeping the map tight to
 * the allowlist means a factory regression that accidentally exposes a new
 * tool can't widen our remote surface — it just goes unrouted.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildCounselToolRegistry(session: SessionState): Map<string, SdkMcpToolDefinition<any>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const all: Array<SdkMcpToolDefinition<any>> = [
    ...createWorkflowTools(session),
    ...createMemoryTools(session),
    ...createKnowledgeBaseTools(session),
    ...createHandoffTools(session),
    // Provides query_anti_patterns — the remaining Counsel read-only lookup.
    ...createFeedbackLoopTools(session),
  ];

  const allowedInternalNames = new Set(COUNSEL_REMOTE_TOOLS.map(stripPrefix));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const registry = new Map<string, SdkMcpToolDefinition<any>>();
  for (const t of all) {
    if (allowedInternalNames.has(t.name)) registry.set(t.name, t);
  }
  return registry;
}

// ── Dispatch result types ──────────────────────────────────────────────

export type DispatchOutcome =
  | { kind: 'ok'; result: unknown }
  | { kind: 'not_allowed'; toolName: string }
  | { kind: 'not_found'; toolName: string }
  | { kind: 'invalid_args'; toolName: string; message: string }
  | { kind: 'handler_error'; toolName: string; message: string };

/**
 * Dispatch a single `tools/call` request against a live session.
 *
 * - Rejects non-allowlisted tools before touching the registry (defense in
 *   depth — the JSON-RPC server also checks, but a bug in either layer
 *   alone must not be enough to open the surface).
 * - Parses args with the tool's Zod shape so malformed callers get a
 *   structured `invalid_args` rather than an uncaught handler exception.
 * - Wraps handler execution in try/catch so a misbehaving tool doesn't
 *   propagate a raw error object across the HTTP boundary.
 */
export async function dispatchCounselTool(
  session: SessionState,
  prefixedToolName: string,
  rawArgs: unknown,
): Promise<DispatchOutcome> {
  if (!isRemoteToolAllowed(prefixedToolName)) {
    return { kind: 'not_allowed', toolName: prefixedToolName };
  }

  const internalName = stripPrefix(prefixedToolName);
  const registry = buildCounselToolRegistry(session);
  const tool = registry.get(internalName);
  if (!tool) {
    // Allow-listed but not in the live registry — means a factory regression
    // or a mismatch between the allowlist and the real Counsel tool set.
    // Surface distinctly from not_allowed so ops can tell them apart.
    logger.warn('bridge dispatch: allowlisted tool missing from registry', { internalName });
    return { kind: 'not_found', toolName: prefixedToolName };
  }

  // The SDK stores `inputSchema` as a raw Zod shape (AnyZodRawShape). Wrap
  // it in z.object() to get a real schema we can safeParse against.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const schema = z.object(tool.inputSchema as any);
  const parsed = schema.safeParse(rawArgs ?? {});
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    return { kind: 'invalid_args', toolName: prefixedToolName, message };
  }

  try {
    const result = await tool.handler(parsed.data, undefined);
    return { kind: 'ok', result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('bridge dispatch: handler threw', { internalName, message });
    return { kind: 'handler_error', toolName: prefixedToolName, message };
  }
}

/**
 * Produce the `tools/list` payload for the Counsel subset.
 *
 * Emits the MCP-prefixed names + JSON-Schema'd inputSchema so the Managed
 * Agents runtime (and any generic MCP client) can build request bodies
 * without a hand-written schema lookup.
 */
export function buildCounselToolsListing(session: SessionState): Array<{
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}> {
  const registry = buildCounselToolRegistry(session);
  return COUNSEL_REMOTE_TOOLS.map((prefixedName) => {
    const internal = stripPrefix(prefixedName);
    const tool = registry.get(internal);
    if (!tool) {
      // Graceful degradation: keep emitting a permissive schema so the
      // absence of one tool doesn't break the whole listing.
      return {
        name: prefixedName,
        description: '(registry miss — tool unavailable for this session)',
        inputSchema: { type: 'object', properties: {}, additionalProperties: true },
      };
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const schema = z.object(tool.inputSchema as any);
    // z.toJSONSchema lives on the module in Zod v4 (see types/output-schemas.ts).
    // Cast because the SDK's AnyZodRawShape generic is loose.
    const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>;
    return {
      name: prefixedName,
      description: tool.description,
      inputSchema: jsonSchema,
    };
  });
}
