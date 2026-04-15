/**
 * Managed Agents → Lavern event mapper.
 *
 * The single seam that lets viz, archive, and delivery remain untouched.
 * A Managed Agents SSE envelope comes in; zero or more `ShemEvent`s go out.
 *
 * This is a PURE function: no session mutation, no I/O, no side effects.
 * The executor is responsible for feeding the output into `session.events`.
 *
 * Stage 0 scaffold: the mapping rules are STUBBED. Do not rely on them yet.
 * Real mappings land in Stage 2 (see docs/managed-agents-migration.md).
 */

import { eventTimestamp } from '../../events/event-bus.js';
import type { ShemEvent } from '../../events/event-bus.js';
import type { ManagedAgentsEvent } from './types.js';

export interface MapperContext {
  /** Lavern session ID — needed to tag emitted ShemEvents. */
  sessionId: string;
  /** Budget snapshot for `cost_update` events. */
  budgetUsd: number;
}

/**
 * Map one Managed SSE event to zero or more Lavern ShemEvents.
 *
 * Stage 0: returns [] for everything except `session.end`, which maps to
 * `session_end` so the contract shape is already exercised by typecheck.
 */
export function mapManagedEvent(
  event: ManagedAgentsEvent,
  ctx: MapperContext,
): ShemEvent[] {
  switch (event.type) {
    case 'session.end':
    case 'session.completed':
      return [
        {
          type: 'session_end',
          sessionId: ctx.sessionId,
          totalCost: 0,
          duration: 0,
          timestamp: eventTimestamp(),
        },
      ];

    // The rest are stubs — fill in during Stage 2.
    case 'agent.tool_use':
    case 'agent.mcp_tool_use':
    case 'agent.tool_result':
    case 'agent.turn_delta':
    case 'span.model_request_end':
    case 'session.status_idle':
    case 'session.error':
    default:
      return [];
  }
}
