/**
 * Shared message streaming logic for the query() result.
 *
 * Used by both orchestrator.ts (legal-design pipeline) and
 * executor.ts (generic workflows) to avoid duplication.
 */

import { compileAuditTrail } from '../hooks/audit-logger.js';
import { eventTimestamp } from '../events/event-bus.js';
import type { SessionState } from '../session/session-state.js';

export interface StreamOptions {
  session: SessionState;
  documentLabel: string;
  workflowLabel?: string;
  logLevel: string;
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
  const { session, documentLabel, workflowLabel, logLevel } = options;
  const label = workflowLabel ? `SESSION COMPLETE (${workflowLabel})` : 'SESSION COMPLETE';

  for await (const message of result) {
    if (!('type' in message)) continue;

    switch (message.type) {
      case 'system':
        if (logLevel === 'debug') {
          console.error('[SYSTEM] Session initialized');
        }
        break;

      case 'assistant':
        if (message.message?.content) {
          for (const block of message.message.content) {
            if ('text' in block) {
              process.stdout.write(block.text);
              // Capture final output for agent API responses
              session.finalOutput += block.text;
            }
          }
          process.stdout.write('\n');
        }
        break;

      case 'result':
        if ('subtype' in message && message.subtype === 'success') {
          const totalCost = (message as Record<string, unknown>).total_cost_usd as number ?? 0;
          const totalTurns = (message as Record<string, unknown>).total_turns as number ?? 0;

          // Write cost back to session state (was previously never written!)
          session.updateCost(totalCost);

          const auditTrail = compileAuditTrail(session, documentLabel, totalCost, totalTurns);

          session.events.emitEvent({
            type: 'session_end',
            sessionId: session.id,
            totalCost,
            duration: 0,
            timestamp: eventTimestamp(),
          });

          console.log('\n' + '\u2550'.repeat(60));
          console.log(label);
          console.log(`Cost: $${totalCost.toFixed?.(2) ?? 'unknown'}`);
          console.log(`Duration: ${(message as Record<string, unknown>).duration_ms ?? 'unknown'}ms`);
          console.log(`Entries logged: ${auditTrail.agentActivity.length}`);
          if (auditTrail.subagentActivities.length > 0) {
            console.log(`Subagents tracked: ${auditTrail.subagentActivities.length}`);
          }
          console.log('\u2550'.repeat(60));
        } else if ('errors' in message) {
          console.error('\nSession ended with errors:', (message as Record<string, unknown>).errors);
        }
        break;
    }
  }
}
