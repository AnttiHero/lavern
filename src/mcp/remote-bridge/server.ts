/**
 * Remote MCP Bridge — JSON-RPC 2.0 Server.
 *
 * Speaks the MCP JSON-RPC 2.0 protocol over HTTP so the Anthropic Managed
 * Agents runtime can treat our server as a remote MCP server. The bridge
 * exposes the Counsel-workflow tool subset only (see `tool-allowlist.ts`).
 *
 * Stage 1 scope (this file):
 *   - JSON-RPC envelope: `initialize`, `tools/list`, `tools/call`
 *   - Auth: static shared secret + X-Lavern-Session-Id header (session-auth.ts)
 *   - Allowlist enforcement: anything outside COUNSEL_REMOTE_TOOLS is denied
 *   - `tools/call` is **not yet wired to live execution** — it returns a
 *     structured `not_yet_wired` error. Stage 2 replaces the stub with an
 *     actual dispatch into the in-process MCP tool handlers.
 *
 * Why a stub in Stage 1?
 *   The in-process MCP tools close over `SessionState`. Wiring live execution
 *   here requires reflecting the tool registry out of `createShemMcpServer`
 *   (which is built per-session, per-template) and replaying calls against
 *   the right session. That's an invasive change — keeping it separate from
 *   the transport/auth/allowlist surface lets us review each concern
 *   independently and ship the bridge behind its feature flag before we
 *   depend on it.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { SessionManager } from '../../session/session-manager.js';
import type { SessionState } from '../../session/session-state.js';
import { authenticateBridgeRequest } from './session-auth.js';
import { isRemoteToolAllowed } from './tool-allowlist.js';
import { buildCounselToolsListing, dispatchCounselTool } from './dispatcher.js';
import { createLogger } from '../../utils/logger.js';
import { config } from '../../config.js';

const logger = createLogger('MCP-BRIDGE');

/** MCP protocol version we advertise during `initialize`. Managed Agents
 *  documentation pins this in the `managed-agents-2026-04-01` beta header. */
const MCP_PROTOCOL_VERSION = '2025-06-18';

// ── JSON-RPC 2.0 envelope types ────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

type JsonRpcId = string | number | null;

interface JsonRpcSuccessResponse {
  jsonrpc: '2.0';
  id: JsonRpcId;
  result: unknown;
}

interface JsonRpcErrorResponse {
  jsonrpc: '2.0';
  id: JsonRpcId;
  error: { code: number; message: string; data?: unknown };
}

type JsonRpcResponse = JsonRpcSuccessResponse | JsonRpcErrorResponse;

/** MCP/JSON-RPC error codes we use. -32000..-32099 is reserved for
 *  implementation-defined server errors per the JSON-RPC 2.0 spec. */
const RPC_ERR = {
  PARSE: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL: -32603,
  // Implementation-defined
  TOOL_NOT_ALLOWED: -32001,
  TOOL_NOT_WIRED: -32002,
  TOOL_NOT_FOUND: -32003,
  HANDLER_ERROR: -32004,
} as const;

function rpcError(id: JsonRpcId, code: number, message: string, data?: unknown): JsonRpcErrorResponse {
  return { jsonrpc: '2.0', id, error: data === undefined ? { code, message } : { code, message, data } };
}

function rpcSuccess(id: JsonRpcId, result: unknown): JsonRpcSuccessResponse {
  return { jsonrpc: '2.0', id, result };
}

// ── Method handlers ────────────────────────────────────────────────────

function handleInitialize(id: JsonRpcId): JsonRpcResponse {
  return rpcSuccess(id, {
    protocolVersion: MCP_PROTOCOL_VERSION,
    capabilities: {
      // We only expose tools; no prompts, resources, or sampling.
      tools: { listChanged: false },
    },
    serverInfo: {
      name: 'lavern-mcp-bridge',
      version: config.version,
    },
  });
}

function handleToolsList(id: JsonRpcId, session: SessionState): JsonRpcResponse {
  // Stage 2: real names + JSON-Schema'd input schemas derived from the
  // in-process tool registry (see dispatcher.ts).
  return rpcSuccess(id, { tools: buildCounselToolsListing(session) });
}

async function handleToolsCall(
  id: JsonRpcId,
  session: SessionState,
  params: Record<string, unknown> | undefined,
): Promise<JsonRpcResponse> {
  const toolName = typeof params?.name === 'string' ? params.name : null;
  if (!toolName) {
    return rpcError(id, RPC_ERR.INVALID_PARAMS, 'Missing required param "name"');
  }
  if (!isRemoteToolAllowed(toolName)) {
    return rpcError(id, RPC_ERR.TOOL_NOT_ALLOWED, `Tool "${toolName}" is not exposed by the remote bridge`);
  }

  const rawArgs = params?.arguments;
  const outcome = await dispatchCounselTool(session, toolName, rawArgs);

  switch (outcome.kind) {
    case 'ok':
      return rpcSuccess(id, outcome.result);
    case 'not_allowed':
      // Defense-in-depth — should've been caught above, but if the allowlist
      // was mutated between checks we still return a clean refusal.
      return rpcError(id, RPC_ERR.TOOL_NOT_ALLOWED, `Tool "${outcome.toolName}" is not exposed by the remote bridge`);
    case 'not_found':
      return rpcError(id, RPC_ERR.TOOL_NOT_FOUND, `Tool "${outcome.toolName}" is allow-listed but not registered for this session`);
    case 'invalid_args':
      return rpcError(id, RPC_ERR.INVALID_PARAMS, `Invalid arguments for "${outcome.toolName}": ${outcome.message}`);
    case 'handler_error':
      return rpcError(id, RPC_ERR.HANDLER_ERROR, `Tool "${outcome.toolName}" failed: ${outcome.message}`);
  }
}

// ── Request dispatch ───────────────────────────────────────────────────

async function dispatch(rpc: JsonRpcRequest, session: SessionState): Promise<JsonRpcResponse> {
  const id = rpc.id ?? null;
  switch (rpc.method) {
    case 'initialize':
      return handleInitialize(id);
    case 'tools/list':
      return handleToolsList(id, session);
    case 'tools/call':
      return await handleToolsCall(id, session, rpc.params);
    case 'notifications/initialized':
      // JSON-RPC notifications have no `id` and expect no response. Fastify
      // needs something to send; we return a 204-equivalent empty success.
      return rpcSuccess(id, {});
    default:
      return rpcError(id, RPC_ERR.METHOD_NOT_FOUND, `Method "${rpc.method}" is not supported by this bridge`);
  }
}

function isJsonRpcRequest(body: unknown): body is JsonRpcRequest {
  if (!body || typeof body !== 'object') return false;
  const b = body as Record<string, unknown>;
  return b.jsonrpc === '2.0' && typeof b.method === 'string';
}

/**
 * Register the bridge endpoint on an already-configured Fastify instance.
 * Caller is responsible for gating registration behind the feature flag
 * (see `index.ts`).
 */
export function registerBridgeServer(
  fastify: FastifyInstance,
  sessionManager: SessionManager,
): void {
  fastify.post('/api/mcp/bridge', async (request: FastifyRequest, reply: FastifyReply) => {
    const auth = authenticateBridgeRequest(request, sessionManager);
    if (!auth.ok) {
      logger.warn('bridge auth failed', { code: auth.code, status: auth.status });
      return reply.status(auth.status).send({
        jsonrpc: '2.0',
        id: null,
        error: { code: RPC_ERR.INVALID_REQUEST, message: auth.error, data: { code: auth.code } },
      });
    }

    const body = request.body;
    if (!isJsonRpcRequest(body)) {
      return reply.status(400).send(rpcError(null, RPC_ERR.INVALID_REQUEST, 'Request is not a valid JSON-RPC 2.0 envelope'));
    }

    try {
      const response = await dispatch(body, auth.session);
      logger.info('bridge call', {
        method: body.method,
        sessionId: auth.session.id,
        tool: typeof body.params?.name === 'string' ? body.params.name : undefined,
      });
      return reply.send(response);
    } catch (err) {
      logger.error('bridge dispatch error', { error: err });
      return reply.status(500).send(rpcError(body.id ?? null, RPC_ERR.INTERNAL, 'Bridge dispatch error'));
    }
  });
}
