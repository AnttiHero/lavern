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
  // Anthropic / Claude — current (4.7 generation)
  'claude-opus-4-7':            { input: 15.0, output: 75.0, cacheRead: 1.5,  cacheWrite: 18.75 },
  'claude-sonnet-4-5':          { input: 3.0,  output: 15.0, cacheRead: 0.3,  cacheWrite: 3.75 },
  'claude-haiku-4-5':            { input: 1.0,  output: 5.0,  cacheRead: 0.1,  cacheWrite: 1.25 },
  // Legacy keys (kept for in-flight sessions + archived cost records)
  'claude-opus-4-6':            { input: 15.0, output: 75.0, cacheRead: 1.5,  cacheWrite: 18.75 },
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
 * Estimate USD cost from a single assistant message's usage object.
 * The Anthropic Messages API returns token counts per response.
 */
function estimateTurnCost(usage: Record<string, number> | undefined, model?: string): number {
  if (!usage) return 0;

  const prices = (model ? PRICING[model] : undefined) ?? DEFAULT_PRICING;

  const inputTokens = usage.input_tokens ?? 0;
  const outputTokens = usage.output_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheCreate = usage.cache_creation_input_tokens ?? 0;

  // Non-cached input = total input minus cache-read tokens (cacheCreate is billed separately)
  const regularInput = Math.max(0, inputTokens - cacheRead);

  return (
    (regularInput * prices.input / 1_000_000) +
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
export async function streamMessages(
  result: AsyncIterable<any>,
  options: StreamOptions,
): Promise<void> {
  const { session, documentLabel, workflowLabel, logLevel, suppressSessionEnd } = options;
  const label = workflowLabel ? `SESSION COMPLETE (${workflowLabel})` : 'SESSION COMPLETE';
  let estimatedCost = 0;

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

        // Final authoritative cost from the SDK replaces our estimate
        if (totalCost > 0) {
          session.updateCost(totalCost);
        }

        if ('subtype' in message && message.subtype === 'success') {
          const auditTrail = compileAuditTrail(session, documentLabel, totalCost, totalTurns);

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
          compileAuditTrail(session, documentLabel, totalCost, totalTurns);
        }
        break;
      }
    }
  }
}
