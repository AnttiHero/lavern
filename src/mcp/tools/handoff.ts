/**
 * Handoff MCP Tools — Structured phase-transition summaries.
 *
 * Inspired by agency-agents' 7-template handoff system.
 * Provides two tools:
 * - submit_handoff: Record a structured summary before advancing to next step
 * - get_handoffs: Retrieve handoff history for context at start of new phase
 *
 * Handoffs are stored in session state and emitted as events for WebSocket streaming.
 */

import { z } from 'zod';
import { tool } from '@anthropic-ai/claude-agent-sdk';
import type { SessionState } from '../../session/session-state.js';
import { boundedPush } from '../../session/session-state.js';
import type { HandoffSummary, HandoffType } from '../../types/workflow.js';
import { eventTimestamp } from '../../events/event-bus.js';

export function createHandoffTools(session: SessionState) {
  const submitHandoff = tool(
    'submit_handoff',
    'Record a structured handoff summary before advancing to the next workflow step. Call this BEFORE calling advance_step to capture what happened and what the next phase needs to know.',
    {
      from_step: z.string()
        .describe('The step being completed'),
      to_step: z.string()
        .describe('The step being transitioned to'),
      from_agent: z.string()
        .describe('Role of the primary agent in the completing step'),
      type: z.enum(['standard', 'qa_pass', 'qa_fail', 'escalation', 'gate_approval', 'gate_rejection'])
        .describe('Type of handoff: standard (normal transition), qa_pass/qa_fail (quality gate result), escalation (unresolved issue), gate_approval/gate_rejection (human gate result)'),
      summary: z.string()
        .describe('Human-readable summary of what was accomplished in this step'),
      deliverables: z.array(z.string())
        .describe('List of what was produced (findings posted, documents analyzed, debates resolved, etc.)'),
      open_items: z.array(z.string()).optional()
        .describe('Unresolved issues the next phase needs to address'),
      confidence_score: z.number().min(0).max(1)
        .describe('Confidence in the work product (0–1). Based on evidence quality, not self-assessment.'),
    },
    async (args) => {
      const handoff: HandoffSummary = {
        id: `H-${String(session.handoffs.length + 1).padStart(3, '0')}`,
        fromStep: args.from_step,
        toStep: args.to_step,
        fromAgent: args.from_agent,
        type: args.type as HandoffType,
        summary: args.summary,
        deliverables: args.deliverables,
        openItems: args.open_items ?? [],
        confidenceScore: args.confidence_score,
        timestamp: new Date().toISOString(),
      };

      // Store in session-level handoff array
      boundedPush(session.handoffs, handoff);

      // Also store in generic workflow state if present
      if (session.genericWorkflow) {
        boundedPush(session.genericWorkflow.handoffs, handoff);
      }

      // Emit event for WebSocket streaming
      session.events.emitEvent({
        type: 'phase_handoff',
        handoffId: handoff.id,
        fromStep: handoff.fromStep,
        toStep: handoff.toStep,
        handoffType: handoff.type,
        summary: handoff.summary,
        confidenceScore: handoff.confidenceScore,
        timestamp: eventTimestamp(),
      });

      return {
        content: [{
          type: 'text' as const,
          text: `✅ Handoff ${handoff.id} recorded: ${handoff.fromStep} → ${handoff.toStep} [${handoff.type}] (confidence: ${handoff.confidenceScore})\n\nDeliverables: ${handoff.deliverables.join(', ')}${handoff.openItems.length > 0 ? `\nOpen items: ${handoff.openItems.join(', ')}` : ''}`,
        }],
      };
    }
  );

  const getHandoffs = tool(
    'get_handoffs',
    'Retrieve all recorded handoff summaries for this session. Call at the start of each new workflow phase to understand what happened in prior steps and what needs attention.',
    {
      from_step: z.string().optional()
        .describe('Filter handoffs from a specific step'),
      type: z.enum(['standard', 'qa_pass', 'qa_fail', 'escalation', 'gate_approval', 'gate_rejection']).optional()
        .describe('Filter handoffs by type'),
    },
    async (args) => {
      let handoffs = session.handoffs;
      if (args.from_step) {
        handoffs = handoffs.filter(h => h.fromStep === args.from_step);
      }
      if (args.type) {
        handoffs = handoffs.filter(h => h.type === args.type);
      }

      if (handoffs.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: 'No handoff summaries recorded yet. This is expected at the start of the first step.',
          }],
        };
      }

      const text = handoffs.map(h =>
        `### ${h.id}: ${h.fromStep} → ${h.toStep} [${h.type.toUpperCase()}]\n` +
        `**Agent**: ${h.fromAgent} | **Confidence**: ${h.confidenceScore}\n` +
        `**Summary**: ${h.summary}\n` +
        `**Deliverables**: ${h.deliverables.join(', ')}\n` +
        (h.openItems.length > 0 ? `**Open Items**: ${h.openItems.join(', ')}\n` : '') +
        `_${h.timestamp}_`
      ).join('\n\n---\n\n');

      return {
        content: [{
          type: 'text' as const,
          text: `## Handoff History (${handoffs.length})\n\n${text}`,
        }],
      };
    },
    { annotations: { readOnly: true } }
  );

  return [submitHandoff, getHandoffs];
}
