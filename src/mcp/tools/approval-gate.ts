/**
 * Approval Gate MCP Tool — Human-in-the-loop decision points.
 *
 * v3: Refactored to use GateResolver abstraction instead of readline.
 * State lives in SessionState. Events emitted for visualization.
 *
 * Three mandatory gates: ethics_critical, meaning_critical, final_delivery.
 * Gate resolution is delegated to session.gateResolver — could be:
 * - ReadlineGateResolver (CLI mode)
 * - AsyncGateResolver (API mode — resolved by POST /sessions/:id/gate)
 * - AutoApproveGateResolver (testing)
 */

import { z } from 'zod';
import { tool } from '@anthropic-ai/claude-agent-sdk';
import type { HumanGateDecision } from '../../types/index.js';
import type { SessionState } from '../../session/session-state.js';
import { boundedPush } from '../../session/session-state.js';
import { eventTimestamp } from '../../events/event-bus.js';

export function createApprovalTools(session: SessionState) {
  const gateLabels: Record<string, string> = {
    ethics_critical: 'ETHICS CRITICAL',
    meaning_critical: 'MEANING CRITICAL',
    final_delivery: 'FINAL DELIVERY',
  };

  const requestApproval = tool(
    'request_approval',
    'Request human approval at a mandatory gate. Presents the decision to the user and waits for their response. MUST be called before proceeding past ethics analysis (if RED findings), before accepting CRITICAL meaning changes, and before final delivery.',
    {
      gate_type: z.enum(['ethics_critical', 'meaning_critical', 'final_delivery'])
        .describe('Type of approval gate'),
      summary: z.string()
        .describe('Human-readable summary of what needs approval'),
      details: z.string()
        .describe('Detailed information: evidence, quotes, agent debate outcomes'),
      proposed_action: z.string()
        .describe('What will happen if approved'),
    },
    async (args) => {
      // Emit gate requested event (visualization: alarm animation)
      session.events.emitEvent({
        type: 'gate_requested',
        gateType: args.gate_type,
        summary: args.summary,
        details: args.details,
        timestamp: eventTimestamp(),
      });

      // Delegate to the session's gate resolver (CLI, API, or auto-approve)
      const result = await session.gateResolver.resolve({
        gateType: args.gate_type,
        summary: args.summary,
        details: args.details,
        proposedAction: args.proposed_action,
      });

      const gateDecision: HumanGateDecision = {
        gateType: args.gate_type,
        timestamp: new Date().toISOString(),
        summary: args.summary,
        decision: result.decision,
        notes: result.notes,
      };
      boundedPush(session.gateDecisions, gateDecision);

      // Emit gate decided event (visualization: green check / red X)
      session.events.emitEvent({
        type: 'gate_decided',
        gateType: args.gate_type,
        decision: result.decision,
        notes: result.notes,
        timestamp: eventTimestamp(),
      });

      const resultText = result.decision === 'approve'
        ? `APPROVED: Proceeding with proposed action.`
        : result.decision === 'reject'
        ? `REJECTED: ${result.notes || 'No notes provided.'} The orchestrator should adjust the approach.`
        : `MODIFICATION REQUESTED: ${result.notes || 'No notes provided.'} The orchestrator should revise and re-submit.`;

      return {
        content: [{ type: 'text' as const, text: `Human Gate Decision [${gateLabels[args.gate_type]}]: ${resultText}` }],
      };
    }
  );

  return [requestApproval];
}
