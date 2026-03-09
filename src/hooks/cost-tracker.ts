/**
 * Cost Tracker & Halt-Check Hooks — Budget enforcement + emergency stop.
 *
 * v3: Refactored to factory pattern — state lives in SessionState.
 * v10: Added haltCheckHook — the "red button" mechanism.
 *
 * Both hooks fire as PreToolUse, checked before every tool invocation.
 * The haltCheckHook MUST be first in the array so it fires before cost checks.
 */

import type { HookInput, HookJSONOutput } from '@anthropic-ai/claude-agent-sdk';
import type { SessionState } from '../session/session-state.js';
import { eventTimestamp } from '../events/event-bus.js';

export function createCostHooks(session: SessionState) {
  // Track which budget warning thresholds have already fired to avoid spamming logs
  const warnedThresholds = new Set<string>();

  /**
   * Halt-check hook — the "red button" mechanism.
   * Fires before every tool use. If the session has been halted externally
   * (via DELETE /api/sessions/:id or session.halt()), returns { continue: false }
   * which stops the SDK query() loop immediately.
   */
  const haltCheckHook = async (
    _input: HookInput,
    _toolUseId: string | undefined,
    _options: { signal: AbortSignal }
  ): Promise<HookJSONOutput> => {
    if (session.isHalted()) {
      return {
        continue: false,
        stopReason: `Emergency stop: ${session.haltReason ?? 'Session halted'}`,
      };
    }
    return { continue: true };
  };

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

    // Early warning at 50% budget consumed (fires once per session)
    if (remaining < session.budgetUsd * 0.5 && session.accumulatedCost > 0 && !warnedThresholds.has('50pct')) {
      warnedThresholds.add('50pct');
      console.error(`[COST] 50%+ budget consumed: $${session.accumulatedCost.toFixed(2)} / $${session.budgetUsd.toFixed(2)} ($${remaining.toFixed(2)} remaining)`);
    }

    // Warning at 90% budget consumed (fires once per session)
    if (remaining < session.budgetUsd * 0.1 && !warnedThresholds.has('90pct')) {
      warnedThresholds.add('90pct');
      console.error(`[COST] Warning: Only $${remaining.toFixed(2)} remaining of $${session.budgetUsd.toFixed(2)} budget.`);
    }

    return { continue: true };
  };

  return { haltCheckHook, costTrackerHook };
}
