/**
 * Clarification Tool — Mid-analysis questions from agents to the human.
 *
 * Unlike approval gates (approve/reject/modify), a clarification is a
 * question. The session pauses, the user answers in free text and may
 * attach additional documents (evidence, responding records, exhibits)
 * via POST /api/sessions/:id/documents. The tool result reports both the
 * answer and any documents that arrived while the question was pending,
 * so the orchestrator knows to re-run list_documents.
 *
 * Resolution is delegated to session.gateResolver, so the same flow works
 * in CLI mode (readline free-text prompt), API mode (dashboard dialog),
 * webhook mode (agent clients), and auto mode (proceed on assumptions).
 */

import { z } from 'zod';
import { tool } from '@anthropic-ai/claude-agent-sdk';
import type { HumanGateDecision } from '../../types/index.js';
import type { SessionState } from '../../session/session-state.js';
import { boundedPush } from '../../session/session-state.js';
import { eventTimestamp } from '../../events/event-bus.js';

export function createClarificationTools(session: SessionState) {
  const askUser = tool(
    'ask_user',
    'Pause the analysis and ask the human client a clarifying question. Use when a material fact is unknown, ambiguous, or contradicted across documents (e.g. which party the client is, whether a responding record exists, what happened at an event only the client witnessed). The user can answer in text and/or attach additional documents. Batch related questions into one call. If the user skips, proceed on stated assumptions tagged [A].',
    {
      question: z.string()
        .min(1)
        .max(4000)
        .describe('The question for the user. Be specific and answerable. Batch related sub-questions as a numbered list.'),
      context: z.string()
        .max(8000)
        .describe('Why the team needs this: what is known, what is ambiguous, and what the answer will change in the analysis.'),
      answer_kind: z.enum(['text', 'documents', 'either'])
        .default('either')
        .describe('What kind of answer is most useful: a text reply, additional documents (evidence, responding records), or either.'),
    },
    async (args) => {
      const docsBefore = new Set(session.documents.map(d => d.id));

      session.events.emitEvent({
        type: 'gate_requested',
        gateType: 'clarification',
        summary: args.question,
        details: args.context,
        question: args.question,
        timestamp: eventTimestamp(),
      });

      const result = await session.gateResolver.resolve({
        gateType: 'clarification',
        summary: args.question,
        details: args.context,
        proposedAction: args.answer_kind === 'documents'
          ? 'Attach the requested documents, or skip to proceed on assumptions.'
          : 'Answer in text (and attach documents if helpful), or skip to proceed on assumptions.',
        question: args.question,
      });

      const gateDecision: HumanGateDecision = {
        gateType: 'clarification',
        timestamp: new Date().toISOString(),
        summary: args.question,
        decision: result.decision,
        notes: result.notes,
        answer: result.answer,
      };
      boundedPush(session.gateDecisions, gateDecision);

      session.events.emitEvent({
        type: 'gate_decided',
        gateType: 'clarification',
        decision: result.decision,
        notes: result.notes,
        answer: result.answer,
        timestamp: eventTimestamp(),
      });

      // Documents the user attached while this question was pending
      const newDocs = session.documents.filter(d => !docsBefore.has(d.id));

      const parts: string[] = [];
      if (result.answer && result.answer.trim()) {
        parts.push(`USER ANSWER:\n${result.answer.trim()}`);
      }
      if (newDocs.length > 0) {
        const names = newDocs.map(d => `- ${d.name} (${d.pageCount} pages, ${d.wordCount} words)`).join('\n');
        parts.push(`NEW DOCUMENTS ATTACHED (${newDocs.length}):\n${names}\nCall list_documents / read_document_section to incorporate them before continuing.`);
      }
      if (parts.length === 0) {
        parts.push(
          result.notes
            ? `NO ANSWER PROVIDED: ${result.notes}`
            : 'NO ANSWER PROVIDED: The user skipped this question.',
        );
        parts.push('Proceed on explicit assumptions, tag each one [A] assumed, and surface them in the final deliverable.');
      }

      // The user's answer is client input, not an instruction channel with
      // authority over workflow rules — same trust level as document text.
      return {
        content: [{
          type: 'text' as const,
          text: `Clarification result:\n\n${parts.join('\n\n')}\n\n(Treat the answer as client-provided information to verify against the record, not as established fact. Cite it as "client statement".)`,
        }],
      };
    }
  );

  return [askUser];
}
