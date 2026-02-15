/**
 * Cost Tracker Hook — Monitors spending against the budget cap.
 *
 * v3: Refactored to factory pattern — state lives in SessionState.
 * Events emitted for visualization (cost_update).
 */

import type { HookInput, HookJSONOutput } from '@anthropic-ai/claude-agent-sdk';
import type { SessionState } from '../session/session-state.js';
import { eventTimestamp } from '../events/event-bus.js';

export function createCostHooks(session: SessionState) {
  const costTrackerHook = async (
    _input: HookInput,
    _toolUseId: string | undefined,
    _options: { signal: AbortSignal }
  ): Promise<HookJSONOutput> => {
    const remaining = session.budgetUsd - session.accumulatedCost;

    if (remaining <= 0) {
      console.error(`[COST] Budget exceeded! $${session.accumulatedCost.toFixed(2)} / $${session.budgetUsd.toFixed(2)}`);
      session.events.emitEvent({
        type: 'cost_update',
        totalUsd: session.accumulatedCost,
        budgetUsd: session.budgetUsd,
        timestamp: eventTimestamp(),
      });
      return {
        continue: false,
        stopReason: `Budget limit of $${session.budgetUsd.toFixed(2)} exceeded. Accumulated cost: $${session.accumulatedCost.toFixed(2)}.`,
      };
    }

    if (remaining < session.budgetUsd * 0.1) {
      console.error(`[COST] Warning: Only $${remaining.toFixed(2)} remaining of $${session.budgetUsd.toFixed(2)} budget.`);
    }

    return { continue: true };
  };

  return { costTrackerHook };
}
