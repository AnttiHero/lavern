import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionState } from '../../src/session/session-state.js';
import { assembleMistralDocument } from '../../src/providers/mistral-assembler.js';

const chatMock = vi.hoisted(() => vi.fn());

vi.mock('../../src/providers/openai-compatible.js', () => ({
  getOpenAICompatibleSettings: () => ({
    provider: 'minimax',
    label: 'MiniMax',
    apiKeyEnv: 'MINIMAX_API_KEY',
    apiKey: 'test-key',
    baseUrl: 'https://example.test/v1',
    defaultModel: 'MiniMax-M3',
    routerModel: 'MiniMax-M3',
    assemblyModel: 'MiniMax-M3',
    pricing: {},
    defaultPricing: { input: 0, output: 0 },
    requestDefaults: {},
  }),
  openAICompatibleChat: chatMock,
}));

function longParagraph(label: string): string {
  return `${label}: This intake hold is the client-facing deliverable for a large forensic accounting matter. ` +
    'It records the status, the reason specialist work is paused, the blockers that must be answered, ' +
    'and the next operational steps. The text is intentionally substantive so validation treats it as a real document. '.repeat(10);
}

function makeSessionWithFinalOutput(): SessionState {
  const session = new SessionState('openai-compat-assembly-test');
  session.provider = 'minimax';
  session.workflowTemplateId = 'review';
  session.finalOutput = [
    "I'll coordinate the workflow and then produce the status package.",
    '',
    '---',
    '',
    '# Status - Intake Complete, Specialist Analysis On Hold',
    '',
    '**Workflow state**: Step 1 intake is complete. Step 2 specialist analysis was reached mechanically, but execution is deliberately on hold.',
    '',
    longParagraph('Summary'),
    '',
    '**What I have done**:',
    '',
    '- Catalogued the forensic accounting report and recorded the parties, scope, report structure, and conflict surface.',
    '- Logged the intake-hold finding so the audit trail explains why specialist analysis was not dispatched.',
    '',
    '**What I need from you to release the hold**:',
    '',
    longParagraph('Blockers'),
    '',
    '**Effort estimates for honest budgeting**:',
    '',
    longParagraph('Next steps'),
  ].join('\n');
  return session;
}

function substantiveDocument(): string {
  return [
    '# Review Package',
    '',
    '## Executive Summary',
    longParagraph('Executive summary'),
    '',
    '## Key Findings',
    longParagraph('Key findings'),
    '',
    '## Next Steps',
    longParagraph('Next steps'),
  ].join('\n');
}

describe('OpenAI-compatible document assembler', () => {
  beforeEach(() => {
    chatMock.mockReset();
  });

  it('extracts a completed finalOutput deliverable before calling MiniMax assembly', async () => {
    chatMock.mockRejectedValue(new Error('MiniMax should not be called for deterministic extraction'));

    const result = await assembleMistralDocument(makeSessionWithFinalOutput(), {
      type: 'contract_review',
      requestText: 'Review the forensic accounting report and find weaknesses.',
    });

    expect(result).toContain('# Status - Intake Complete');
    expect(result).toContain('**What I need from you to release the hold**');
    expect(result).not.toContain("I'll coordinate");
    expect(result.length).toBeGreaterThan(2000);
    expect(chatMock).not.toHaveBeenCalled();
  });

  it('passes the long workflow timeout to MiniMax assembly calls', async () => {
    chatMock
      .mockResolvedValueOnce({ message: { content: substantiveDocument() }, cost: 0 })
      .mockResolvedValueOnce({ message: { content: 'PASS' }, cost: 0 });

    const session = new SessionState('openai-compat-assembly-timeout-test');
    session.provider = 'minimax';
    session.workflowTemplateId = 'review';

    await assembleMistralDocument(session, {
      type: 'contract_review',
      requestText: 'Review the securities-fraud evidence package.',
    });

    expect(chatMock).toHaveBeenCalled();
    expect(chatMock.mock.calls[0][0].timeoutMs).toBeGreaterThanOrEqual(300_000);
  });

  it('returns a structurally valid best attempt when the quality gate returns empty responses', async () => {
    chatMock
      .mockResolvedValueOnce({ message: { content: substantiveDocument() }, cost: 0 })
      .mockResolvedValueOnce({ message: { content: '' }, cost: 0 })
      .mockResolvedValueOnce({ message: { content: substantiveDocument() }, cost: 0 })
      .mockResolvedValueOnce({ message: { content: '' }, cost: 0 })
      .mockResolvedValueOnce({ message: { content: substantiveDocument() }, cost: 0 })
      .mockResolvedValueOnce({ message: { content: '' }, cost: 0 });

    const session = new SessionState('openai-compat-empty-gate-test');
    session.provider = 'minimax';
    session.workflowTemplateId = 'review';

    const result = await assembleMistralDocument(session, {
      type: 'contract_review',
      requestText: 'Review the securities-fraud evidence package.',
    });

    expect(result).toContain('# Review Package');
    expect(result.length).toBeGreaterThan(500);
  });
});
