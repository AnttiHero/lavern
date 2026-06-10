/**
 * Unit tests — Clarification gates (agent asks the user a question mid-analysis).
 *
 * Covers:
 * - GateDecision.answer round-trip through AsyncGateResolver
 * - AutoApproveGateResolver never fabricates an answer (rejects → assumptions)
 * - ask_user MCP tool: answer delivery, mid-question document attachment
 *   detection, skip handling, and gate decision recording
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AsyncGateResolver, AutoApproveGateResolver } from '../../src/gates/gate-resolver.js';
import { SessionState } from '../../src/session/session-state.js';
import { createClarificationTools } from '../../src/mcp/tools/clarification.js';
import type { ParsedDocument } from '../../src/documents/types.js';

const makeDoc = (id: string, name: string): ParsedDocument => ({
  id,
  name,
  mimeType: 'application/pdf',
  size: 1000,
  pageCount: 3,
  wordCount: 500,
  fullText: 'Test document text.',
  sections: [],
  tables: [],
  definedTerms: [],
  parseMethod: 'pdf-parse',
  parsedAt: new Date().toISOString(),
});

describe('AsyncGateResolver — clarification answers', () => {
  it('passes the free-text answer through submitDecision', async () => {
    const resolver = new AsyncGateResolver(0);
    const promise = resolver.resolve({
      gateType: 'clarification',
      summary: 'Which party is the client?',
      details: 'The motion record names two parties.',
      proposedAction: 'Answer in text.',
      question: 'Which party is the client?',
    });

    expect(resolver.getPendingGate()?.question).toBe('Which party is the client?');

    resolver.submitDecision({ decision: 'approve', answer: 'We are the responding party (defendant).' });
    const result = await promise;
    expect(result.decision).toBe('approve');
    expect(result.answer).toBe('We are the responding party (defendant).');
  });
});

describe('AutoApproveGateResolver — clarification', () => {
  it('rejects clarification gates instead of fabricating an answer', async () => {
    const resolver = new AutoApproveGateResolver();
    const result = await resolver.resolve({
      gateType: 'clarification',
      summary: 'Question',
      details: 'Context',
      proposedAction: 'Answer',
      question: 'Question',
    });

    expect(result.decision).toBe('reject');
    expect(result.answer).toBeUndefined();
    expect(result.notes).toContain('assumptions');
  });

  it('still auto-approves non-clarification gates', async () => {
    const resolver = new AutoApproveGateResolver();
    const result = await resolver.resolve({
      gateType: 'final_delivery',
      summary: 'Deliver',
      details: 'Details',
      proposedAction: 'Deliver',
    });
    expect(result.decision).toBe('approve');
  });
});

describe('ask_user MCP tool', () => {
  let session: SessionState;
  let askUser: any;

  beforeEach(() => {
    session = new SessionState('test-clarification', { gateResolver: new AsyncGateResolver(0) });
    const tools = createClarificationTools(session);
    askUser = tools.find((t: any) => t.name === 'ask_user');
  });

  it('returns the user answer and records the gate decision', async () => {
    const resolver = session.gateResolver as AsyncGateResolver;

    const pending = askUser.handler({
      question: 'Did you sign the agreement on March 3?',
      context: 'The affidavit and the exhibit disagree on the signing date.',
      answer_kind: 'either',
    });

    // Wait for the gate to become pending, then answer
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(resolver.hasPendingGate()).toBe(true);
    resolver.submitDecision({ decision: 'approve', answer: 'Yes, on March 3 at the office.' });

    const result = await pending;
    const text = result.content[0].text as string;
    expect(text).toContain('USER ANSWER');
    expect(text).toContain('Yes, on March 3 at the office.');

    expect(session.gateDecisions).toHaveLength(1);
    expect(session.gateDecisions[0].gateType).toBe('clarification');
    expect(session.gateDecisions[0].answer).toBe('Yes, on March 3 at the office.');
  });

  it('reports documents attached while the question was pending', async () => {
    const resolver = session.gateResolver as AsyncGateResolver;
    session.documents.push(makeDoc('doc-1', 'motion-record.pdf'));

    const pending = askUser.handler({
      question: 'Do you have the responding motion record?',
      context: 'Only the moving party record was provided.',
      answer_kind: 'documents',
    });

    await new Promise(resolve => setTimeout(resolve, 0));
    // Simulate POST /api/sessions/:id/documents while the gate is pending
    session.documents.push(makeDoc('doc-2', 'responding-motion-record.pdf'));
    resolver.submitDecision({ decision: 'approve', answer: 'Attached it now.' });

    const result = await pending;
    const text = result.content[0].text as string;
    // Only the doc that arrived while pending counts as new — not doc-1
    expect(text).toContain('NEW DOCUMENTS ATTACHED (1)');
    expect(text).toContain('responding-motion-record.pdf');
  });

  it('instructs the orchestrator to proceed on assumptions when skipped', async () => {
    session.gateResolver = new AutoApproveGateResolver();

    const result = await askUser.handler({
      question: 'Were you present at the meeting?',
      context: 'No document covers the meeting.',
      answer_kind: 'text',
    });

    const text = result.content[0].text as string;
    expect(text).toContain('NO ANSWER PROVIDED');
    expect(text).toContain('[A]');
  });

  it('emits gate_requested with the question and gate_decided with the answer', async () => {
    const resolver = session.gateResolver as AsyncGateResolver;

    const pending = askUser.handler({
      question: 'Q1?',
      context: 'Ctx',
      answer_kind: 'either',
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    resolver.submitDecision({ decision: 'approve', answer: 'A1' });
    await pending;

    const events = session.events.getEventsSince(0);
    const requested = events.find(e => e.type === 'gate_requested') as any;
    const decided = events.find(e => e.type === 'gate_decided') as any;
    expect(requested.gateType).toBe('clarification');
    expect(requested.question).toBe('Q1?');
    expect(decided.answer).toBe('A1');
  });
});
