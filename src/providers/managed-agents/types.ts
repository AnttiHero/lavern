/**
 * Managed Agents — SSE envelope types.
 *
 * Minimal, intentionally incomplete. We only declare the subset of the beta
 * stream envelope that our mapper actually consumes. The full schema lives
 * in Anthropic's docs; mirroring it here would invite drift.
 *
 * See `docs/managed-agents-migration.md` for the migration plan.
 * Stage: 0 (scaffolding) — no runtime consumers yet.
 */

/** Beta API header value. Pinned; bump deliberately after reviewing changelog. */
export const MANAGED_AGENTS_BETA_HEADER = 'managed-agents-2026-04-01';

/** Base envelope for all SSE events emitted by the beta. */
export interface ManagedAgentsEventBase {
  /** Monotonic event ID — used for resume/backfill cursors. */
  event_id: string;
  /** ISO 8601 timestamp. */
  timestamp: string;
  /** Event type discriminant. */
  type: string;
}

/** Session entered an idle state — may include a gate request. */
export interface ManagedAgentsStatusIdleEvent extends ManagedAgentsEventBase {
  type: 'session.status_idle';
  /** When present, the session is waiting for client action (gate, confirmation, etc.). */
  stop_reason?: {
    type: 'requires_action' | 'end_turn' | 'max_tokens' | string;
    /** Event IDs the session is waiting on (e.g., tool_use events needing confirmation). */
    requires_action?: { event_ids: string[] };
  };
}

/** Agent decided to call a tool. */
export interface ManagedAgentsToolUseEvent extends ManagedAgentsEventBase {
  type: 'agent.tool_use' | 'agent.mcp_tool_use';
  tool_use_id: string;
  tool_name: string;
  input: Record<string, unknown>;
}

/** Tool finished (or was denied). */
export interface ManagedAgentsToolResultEvent extends ManagedAgentsEventBase {
  type: 'agent.tool_result';
  tool_use_id: string;
  is_error: boolean;
  content: unknown;
}

/** Model call finished; includes token usage. Shape partially undocumented. */
export interface ManagedAgentsModelRequestEndEvent extends ManagedAgentsEventBase {
  type: 'span.model_request_end';
  model_usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

/** Assistant text delta — streamed as the model thinks. */
export interface ManagedAgentsTurnDeltaEvent extends ManagedAgentsEventBase {
  type: 'agent.turn_delta';
  delta: { text?: string };
}

/** Session finished. */
export interface ManagedAgentsSessionEndEvent extends ManagedAgentsEventBase {
  type: 'session.end' | 'session.completed';
  /** Cumulative session-level usage, if the beta surfaces it on end. */
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

/** Error inside the session runtime (not a tool error). */
export interface ManagedAgentsErrorEvent extends ManagedAgentsEventBase {
  type: 'session.error';
  error: { type: string; message: string };
}

export type ManagedAgentsEvent =
  | ManagedAgentsStatusIdleEvent
  | ManagedAgentsToolUseEvent
  | ManagedAgentsToolResultEvent
  | ManagedAgentsModelRequestEndEvent
  | ManagedAgentsTurnDeltaEvent
  | ManagedAgentsSessionEndEvent
  | ManagedAgentsErrorEvent
  | ManagedAgentsEventBase; // catch-all for events we ignore

/** Confirmation response we send back to steer a gated tool call. */
export interface ToolConfirmationPayload {
  type: 'user.tool_confirmation';
  tool_use_id: string;
  result: 'allow' | 'deny';
  deny_message?: string;
}
