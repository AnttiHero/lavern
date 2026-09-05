/**
 * Shared message streaming logic for the query() result.
 *
 * Used by both orchestrator.ts (legal-design pipeline) and
 * executor.ts (generic workflows) to avoid duplication.
 *
 * v16: Per-turn cost estimation from assistant message usage data.
 * The SDK provides total_cost_usd only at the end. We now estimate
 * running cost from each assistant message's token usage so the
 * session status API shows non-zero cost during execution.
 */

import { compileAuditTrail } from '../hooks/audit-logger.js';
import { eventTimestamp } from '../events/event-bus.js';
import type { SessionState } from '../session/session-state.js';
import { createLogger } from './logger.js';

const logger = createLogger('STREAM');

// ── Token Pricing (per million tokens) ────────────────────────────────
// Source: Anthropic pricing as of 2025. Updated here if prices change.
export const PRICING: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  // Anthropic / Claude — current (Claude 5 generation).
  // Fable 5.1 — $10/$50; cache READS are 0.025x ($0.25/M), not the usual 0.1x.
  'claude-fable-5-1':           { input: 10.0, output: 50.0, cacheRead: 0.25, cacheWrite: 12.5 },
  // Opus 5 is a drop-in at Opus 4.8 pricing: $5/$25 per M.
  'claude-opus-5':              { input: 5.0,  output: 25.0, cacheRead: 0.5,  cacheWrite: 6.25 },
  // Sonnet 5 — $2/$10 is now the STANDARD rate (the scheduled Sep 2026 rise
  // to $3/$15 was cancelled), so logging at $3/$15 over-counted by 50%.
  'claude-sonnet-5':            { input: 2.0,  output: 10.0, cacheRead: 0.2,  cacheWrite: 2.5 },
  'claude-haiku-4-5':            { input: 1.0,  output: 5.0,  cacheRead: 0.1,  cacheWrite: 1.25 },
  // Legacy keys (kept for in-flight sessions + archived cost records).
  // NOTE: the whole Opus 4.x line is $5/$25 — the previous $15/$75 figures
  // here were wrong (Opus 3-era rates) and overstated costs 3x.
  'claude-opus-4-8':            { input: 5.0,  output: 25.0, cacheRead: 0.5,  cacheWrite: 6.25 },
  'claude-sonnet-4-5':          { input: 3.0,  output: 15.0, cacheRead: 0.3,  cacheWrite: 3.75 },
  'claude-opus-4-7':            { input: 5.0,  output: 25.0, cacheRead: 0.5,  cacheWrite: 6.25 },
  'claude-opus-4-6':            { input: 5.0,  output: 25.0, cacheRead: 0.5,  cacheWrite: 6.25 },
  'claude-sonnet-4-5-20250929': { input: 3.0,  output: 15.0, cacheRead: 0.3,  cacheWrite: 3.75 },
  'claude-haiku-3-5-20250929':  { input: 0.8,  output: 4.0,  cacheRead: 0.08, cacheWrite: 1.0 },
  // Mistral AI (EU-sovereign)
  'mistral-large-latest':       { input: 2.0,  output: 6.0,  cacheRead: 0,    cacheWrite: 0 },
  'mistral-medium-latest':      { input: 0.4,  output: 1.2,  cacheRead: 0,    cacheWrite: 0 },
  'mistral-small-latest':       { input: 0.1,  output: 0.3,  cacheRead: 0,    cacheWrite: 0 },
};

// Default pricing if model isn't in the table (use Sonnet pricing as safe middle ground)
const DEFAULT_PRICING: { input: number; output: number; cacheRead: number; cacheWrite: number } = {
  input: 3.0, output: 15.0, cacheRead: 0.3, cacheWrite: 3.75,
};

/**
 * Resolve pricing for a model id. Exact match first; then fall back to a known
 * family by prefix so dated/variant ids (e.g. "claude-opus-4-8-20260529") are
 * priced as their base model instead of silently dropping to Sonnet pricing.
 */
function pricingForModel(model?: string): { input: number; output: number; cacheRead: number; cacheWrite: number } {
  if (!model) return DEFAULT_PRICING;
  if (PRICING[model]) return PRICING[model];
  for (const key of Object.keys(PRICING)) {
    if (model.startsWith(key)) return PRICING[key];
  }
  return DEFAULT_PRICING;
}

/**
 * Estimate USD cost from a single assistant message's usage object.
 * The Anthropic Messages API returns token counts per response.
 */
function estimateTurnCost(usage: Record<string, number> | undefined, model?: string): number {
  if (!usage) return 0;

  const prices = pricingForModel(model);

  const inputTokens = usage.input_tokens ?? 0;
  const outputTokens = usage.output_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheCreate = usage.cache_creation_input_tokens ?? 0;

  // The Anthropic usage object reports these buckets as MUTUALLY EXCLUSIVE:
  // input_tokens is already the uncached input (it excludes both cache reads
  // and cache writes). The old code subtracted cacheRead from input_tokens,
  // double-discounting and undercounting the bill.
  return (
    (inputTokens * prices.input / 1_000_000) +
    (outputTokens * prices.output / 1_000_000) +
    (cacheRead * prices.cacheRead / 1_000_000) +
    (cacheCreate * prices.cacheWrite / 1_000_000)
  );
}

export interface StreamOptions {
  session: SessionState;
  documentLabel: string;
  workflowLabel?: string;
  logLevel: string;
  /** When true, don't emit session_end — caller will emit after post-processing (e.g. assembly). */
  suppressSessionEnd?: boolean;
}

/**
 * Stream messages from a query() result to the console,
 * handle the result event (audit trail, session_end), and
 * throw on errors.
 */
/**
 * How the SDK query ended. 'completed' is the ONLY outcome that means the
 * model finished its own turn normally; everything else is an explicit
 * terminal state that the executor must not treat as a finished review.
 */
export interface StreamOutcome {
  outcome: 'completed' | 'interrupted' | 'failed';
  subtype?: string;
  errors?: unknown;
}

export async function streamMessages(
  result: AsyncIterable<any>,
  options: StreamOptions,
): Promise<StreamOutcome> {
  const { session, documentLabel, workflowLabel, logLevel, suppressSessionEnd } = options;
  const label = workflowLabel ? `SESSION COMPLETE (${workflowLabel})` : 'SESSION COMPLETE';
  // Start from the session's running total: a retried or second query must ADD
  // to what earlier queries cost, never restart the meter at zero.
  const baselineCost = session.accumulatedCost;
  let estimatedCost = baselineCost;
  // No result message at all (process died, stream cut) is a failure, not a completion.
  let streamOutcome: StreamOutcome = { outcome: 'failed', subtype: 'no_result' };

  for await (const message of result) {
    if (!('type' in message)) continue;

    switch (message.type) {
      case 'system':
        if (logLevel === 'debug') {
          logger.error('Session initialized');
        }
        break;

      case 'assistant': {
        if (message.message?.content) {
          for (const block of message.message.content) {
            // Only capture text blocks — filter out thinking blocks (type: 'thinking')
            // which also have a .text property but contain internal reasoning
            if (block.type === 'text' && 'text' in block) {
              process.stdout.write(block.text);
              // Capture final output for agent API responses
              session.finalOutput += block.text;
            }
          }
          process.stdout.write('\n');
        }

        // Per-turn cost estimation from token usage
        const usage = message.message?.usage;
        if (usage) {
          const turnCost = estimateTurnCost(usage, message.message?.model);
          estimatedCost += turnCost;
          session.updateCost(estimatedCost);

          if (logLevel === 'debug') {
            logger.error('Turn cost estimate', { turnCost: turnCost.toFixed(4), runningCost: estimatedCost.toFixed(4) });
          }
        }
        break;
      }

      case 'result': {
        // Extract final cost from SDK result — available on BOTH success and error results
        const totalCost = (message as Record<string, unknown>).total_cost_usd as number ?? 0;
        const totalTurns = (message as Record<string, unknown>).num_turns as number ?? 0;

        // Our per-turn estimate is the authoritative figure: it uses actual
        // token usage at Lavern's current price table. The pinned SDK bundle
        // has NO pricing for the Claude 5 family and silently falls back to a
        // $3/$15 rate, so its total_cost_usd under-bills Opus 5 work by ~40%
        // (observed live: $12.83 estimated -> $7.60 after the overwrite).
        // Only when we saw no usage at all is the SDK figure used — and then
        // ADDED to the pre-query baseline, since it is query-scoped.
        // This query's cost for the audit bundle: ours when we have it.
        const queryCost = estimatedCost > baselineCost ? estimatedCost - baselineCost : totalCost;
        if (estimatedCost > baselineCost) {
          if (totalCost > 0 && logLevel === 'debug') {
            logger.error('SDK total_cost_usd ignored in favour of usage-based estimate', {
              sdk: totalCost.toFixed(4), estimated: (estimatedCost - baselineCost).toFixed(4),
            });
          }
        } else if (totalCost > 0) {
          session.updateCost(baselineCost + totalCost);
        }

        if ('subtype' in message && message.subtype === 'success') {
          streamOutcome = { outcome: 'completed', subtype: 'success' };
          const auditTrail = compileAuditTrail(session, documentLabel, queryCost, totalTurns);

          if (!suppressSessionEnd) {
            session.events.emitEvent({
              type: 'session_end',
              sessionId: session.id,
              totalCost,
              duration: 0,
              timestamp: eventTimestamp(),
            });
          }

          logger.info('Session complete', {
            label,
            cost: totalCost.toFixed?.(2) ?? 'unknown',
            durationMs: (message as Record<string, unknown>).duration_ms ?? 'unknown',
            entriesLogged: auditTrail.agentActivity.length,
            subagentsTracked: auditTrail.subagentActivities.length,
          });
        } else {
          // Error result — still capture cost and emit session_end
          const errors = (message as Record<string, unknown>).errors;
          const subtype = (message as Record<string, unknown>).subtype as string;
          logger.error('Session ended with error', { subtype, errors });
          // Max-turn / budget-style stops are interruptions; anything else failed.
          streamOutcome = { outcome: /max_turns|max_budget|budget/.test(subtype ?? '') ? 'interrupted' : 'failed', subtype, errors };

          if (!suppressSessionEnd) {
            session.events.emitEvent({
              type: 'session_end',
              sessionId: session.id,
              totalCost,
              duration: 0,
              timestamp: eventTimestamp(),
            });
          }

          // Still compile audit trail for error cases
          compileAuditTrail(session, documentLabel, queryCost, totalTurns);
        }
        break;
      }
    }
  }
  return streamOutcome;
}
