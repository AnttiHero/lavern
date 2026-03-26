/**
 * Cost Tracker & Halt-Check Hooks — Budget enforcement + emergency stop.
 *
 * v3: Refactored to factory pattern — state lives in SessionState.
 * v10: Added haltCheckHook — the "red button" mechanism.
 * v21: Added pre-flight cost estimation — rejects calls that would exceed budget.
 *
 * Both hooks fire as PreToolUse, checked before every tool invocation.
 * The haltCheckHook MUST be first in the array so it fires before cost checks.
 */

import type { HookInput, HookJSONOutput } from '@anthropic-ai/claude-agent-sdk';
import type { SessionState } from '../session/session-state.js';
import { eventTimestamp } from '../events/event-bus.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('COST');

// ── Cost Estimation ─────────────────────────────────────────────────────
// Per-tool cost estimates in USD. These are rough approximations based on
// typical token counts for each tool invocation. Used for pre-flight checks.

const TOOL_COST_ESTIMATES: Record<string, number> = {
  // Heavy tools (agent invocations, LLM calls)
  'post_finding':     0.02,
  'post_challenge':   0.02,
  'post_response':    0.02,
  'resolve_debate':   0.03,
  'score_document':   0.05,
  'run_verification': 0.05,
  'compile_report':   0.04,
  // Medium tools (read/write operations)
  'read_document':    0.01,
  'search_knowledge': 0.01,
  'save_memory':      0.005,
  'read_memory':      0.005,
  // Light tools (metadata, status)
  'get_workflow':     0.001,
  'list_findings':    0.001,
  'get_scores':       0.001,
};

/** Default cost estimate for unknown tools. */
const DEFAULT_TOOL_COST = 0.01;

/**
 * Estimate cost for a tool invocation.
 * Strips MCP namespace prefix (e.g., 'mcp__shem__post_finding' → 'post_finding').
 */
export function estimateToolCost(toolName: string): number {
  // MCP tools arrive as 'mcp__shem__toolname' — strip the prefix for lookup
  const shortName = toolName.replace(/^mcp__[^_]+__/, '');
  return TOOL_COST_ESTIMATES[shortName] ?? DEFAULT_TOOL_COST;
}

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
    // Circuit breaker: pause check — wait loop until resumed or halted
    if (session.isPaused()) {
      // Wait up to 5 minutes for resume, checking every 2 seconds
      const maxWaitMs = 5 * 60 * 1000;
      const started = Date.now();
      while (session.isPaused() && !session.isHalted() && Date.now() - started < maxWaitMs) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      if (session.isHalted()) {
        return { continue: false, stopReason: `Halted while paused: ${session.haltReason}` };
      }
      if (session.isPaused()) {
        // Timed out waiting — halt the session
        session.halt('Paused for too long (5 minutes). Session halted to preserve resources.');
        return { continue: false, stopReason: 'Session halted after 5-minute pause timeout' };
      }
    }
    return { continue: true };
  };

  const costTrackerHook = async (
    input: HookInput,
    _toolUseId: string | undefined,
    _options: { signal: AbortSignal }
  ): Promise<HookJSONOutput> => {
    const remaining = session.budgetUsd - session.accumulatedCost;

    if (remaining <= 0) {
      logger.error('Budget exceeded', { cost: session.accumulatedCost.toFixed(2), budget: session.budgetUsd.toFixed(2) });
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

    // Pre-flight check: estimate cost of this tool call and reject if it would exceed budget
    const toolName = 'tool_name' in input ? (input as { tool_name?: string }).tool_name : undefined;
    if (toolName) {
      const estimatedCost = estimateToolCost(toolName);
      if (session.accumulatedCost + estimatedCost > session.budgetUsd) {
        logger.error('Pre-flight rejection', { toolName, estimatedCost: estimatedCost.toFixed(3), remaining: remaining.toFixed(2) });
        session.events.emitEvent({
          type: 'cost_update',
          totalUsd: session.accumulatedCost,
          budgetUsd: session.budgetUsd,
          timestamp: eventTimestamp(),
        });
        return {
          continue: false,
          stopReason: `Insufficient budget: ${toolName} estimated at $${estimatedCost.toFixed(3)}, only $${remaining.toFixed(2)} remaining of $${session.budgetUsd.toFixed(2)}.`,
        };
      }
    }

    // Early warning at 50% budget consumed (fires once per session)
    if (remaining < session.budgetUsd * 0.5 && session.accumulatedCost > 0 && !warnedThresholds.has('50pct')) {
      warnedThresholds.add('50pct');
      logger.error('50%+ budget consumed', { cost: session.accumulatedCost.toFixed(2), budget: session.budgetUsd.toFixed(2), remaining: remaining.toFixed(2) });
    }

    // Warning at 90% budget consumed (fires once per session)
    if (remaining < session.budgetUsd * 0.1 && !warnedThresholds.has('90pct')) {
      warnedThresholds.add('90pct');
      logger.warn('Low budget remaining', { remaining: remaining.toFixed(2), budget: session.budgetUsd.toFixed(2) });
    }

    return { continue: true };
  };

  return { haltCheckHook, costTrackerHook };
}
