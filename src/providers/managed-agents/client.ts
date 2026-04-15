/**
 * Managed Agents HTTP client — thin wrapper around the beta endpoints.
 *
 * Stage 0 scaffold: not yet used. All methods throw until Stage 2 wires the
 * executor. The shape is frozen here so the executor can be written against
 * a stable contract once we have a key to pre-flight against.
 */

import { MANAGED_AGENTS_BETA_HEADER } from './types.js';

const API_BASE = 'https://api.anthropic.com';

export interface ManagedClientOptions {
  apiKey: string;
  /** Override the base URL (e.g., for a proxy or staging). */
  baseUrl?: string;
  /** Optional org ID for multi-org keys. */
  organizationId?: string;
  /** Per-request timeout; long-running SSE is handled separately. */
  timeoutMs?: number;
}

export interface CreateAgentInput {
  name: string;
  system_prompt: string;
  model: string;
  tools?: unknown[]; // Shape matches the beta MCP/tool config; kept loose on purpose.
  callable_agents?: string[]; // Multi-agent preview only.
}

export interface CreateSessionInput {
  agent_id: string;
  messages?: unknown[]; // Initial user turn.
  vault_ids?: string[]; // OAuth vaults for remote MCP servers.
  metadata?: Record<string, string>;
}

export class ManagedAgentsClient {
  constructor(private readonly options: ManagedClientOptions) {}

  private headers(): Record<string, string> {
    return {
      'x-api-key': this.options.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': MANAGED_AGENTS_BETA_HEADER,
      'content-type': 'application/json',
      ...(this.options.organizationId
        ? { 'anthropic-organization-id': this.options.organizationId }
        : {}),
    };
  }

  /** Create (or upsert) an agent definition. */
  async createAgent(_input: CreateAgentInput): Promise<{ id: string }> {
    throw new Error('ManagedAgentsClient.createAgent not yet implemented (Stage 2)');
  }

  /** Start a new session against an existing agent. */
  async createSession(_input: CreateSessionInput): Promise<{ id: string }> {
    throw new Error('ManagedAgentsClient.createSession not yet implemented (Stage 2)');
  }

  /** Subscribe to the SSE stream for a session. Returns an async iterator. */
  async *streamSession(_sessionId: string): AsyncIterable<unknown> {
    throw new Error('ManagedAgentsClient.streamSession not yet implemented (Stage 2)');
  }

  /** Fetch event history (for resume-after-restart backfill). */
  async getEvents(
    _sessionId: string,
    _opts?: { sinceEventId?: string; limit?: number },
  ): Promise<{ events: unknown[]; has_more: boolean }> {
    throw new Error('ManagedAgentsClient.getEvents not yet implemented (Stage 2)');
  }

  /** Send a user event (text input, tool_confirmation, etc.). */
  async postEvent(_sessionId: string, _payload: unknown): Promise<void> {
    throw new Error('ManagedAgentsClient.postEvent not yet implemented (Stage 2)');
  }

  /** Halt a running session. */
  async cancelSession(_sessionId: string): Promise<void> {
    throw new Error('ManagedAgentsClient.cancelSession not yet implemented (Stage 2)');
  }
}

/** Silences the unused-base warning until the real impl lands. */
export const _API_BASE = API_BASE;
