/**
 * Unit tests — Deterministic findings report (assembly fallback).
 *
 * When LLM assembly fails, the session's debate board still holds the cited
 * findings. buildFindingsReport renders them with zero LLM calls so the
 * delivery view never dead-ends with "assembly did not complete" while
 * findings exist.
 */

import { describe, it, expect } from 'vitest';
import { SessionState, boundedPush } from '../../src/session/session-state.js';
import { buildFindingsReport } from '../../src/assembly/findings-report.js';
import { validateDeliverable } from '../../src/assembly/validate-deliverable.js';
import type { Finding } from '../../src/types/debate.js';

const makeFinding = (id: string, severity: 'RED' | 'YELLOW' | 'GREEN', content: string): Finding => ({
  id,
  agentRole: 'litigation-partner' as Finding['agentRole'],
  findingType: 'contract-risk',
  content,
  severity,
  evidence: [`"Quoted text supporting ${id}" (Affidavit para 12)`],
  confidence: 0.85,
  timestamp: new Date().toISOString(),
  resolved: false,
});

function makeSessionWithFindings(count = 5): SessionState {
  const session = new SessionState('test-findings-report');
  for (let i = 1; i <= count; i++) {
    session.debate.findings.push(
      makeFinding(`F-00${i}`, i === 1 ? 'RED' : i === 2 ? 'YELLOW' : 'GREEN',
        `Material non-disclosure issue number ${i}: the moving party omitted the MOU dated February 22, 2022, which would have reframed the relationship as a commercial loan rather than a fraudulent scheme.`),
    );
  }
  session.documents.push({
    id: 'doc-1',
    name: 'motion-record.pdf',
    mimeType: 'application/pdf',
    size: 1000,
    pageCount: 40,
    wordCount: 12000,
    fullText: 'x',
    sections: [],
    tables: [],
    definedTerms: [],
    parseMethod: 'pdf-parse',
    parsedAt: new Date().toISOString(),
  });
  return session;
}

describe('buildFindingsReport', () => {
  it('returns empty string when there are no findings', () => {
    const session = new SessionState('test-empty');
    expect(buildFindingsReport(session)).toBe('');
  });

  it('renders findings grouped by severity with evidence and citations', () => {
    const session = makeSessionWithFindings();
    const report = buildFindingsReport(session, {
      type: 'defense_strategy',
      requestText: 'Assess the motion to set aside the Mareva injunction.',
    });

    expect(report.startsWith('#')).toBe(true);
    expect(report).toContain('Structured Findings Report');
    expect(report).toContain('## Critical Findings');
    expect(report).toContain('## Significant Findings');
    expect(report).toContain('F-001');
    expect(report).toContain('Affidavit para 12');
    expect(report).toContain('motion-record.pdf');
    expect(report).toContain('not legal advice');
  });

  it('includes clarification Q&A from gate decisions', () => {
    const session = makeSessionWithFindings(2);
    boundedPush(session.gateDecisions, {
      gateType: 'clarification',
      timestamp: new Date().toISOString(),
      summary: 'Which party is the client?',
      decision: 'approve',
      answer: 'The responding party (defendant).',
    });
    boundedPush(session.gateDecisions, {
      gateType: 'clarification',
      timestamp: new Date().toISOString(),
      summary: 'Do you have the Statement of Claim?',
      decision: 'reject',
      notes: 'Skipped',
    });

    const report = buildFindingsReport(session);
    expect(report).toContain('## Client Clarifications');
    expect(report).toContain('Which party is the client?');
    expect(report).toContain('The responding party (defendant).');
    expect(report).toContain('No answer provided');
  });

  it('produces a structurally valid deliverable', () => {
    const session = makeSessionWithFindings(6);
    const report = buildFindingsReport(session, {
      type: 'defense_strategy',
      requestText: 'Prepare a defense assessment.',
    });
    const validation = validateDeliverable(report);
    expect(validation.valid).toBe(true);
  });
});
