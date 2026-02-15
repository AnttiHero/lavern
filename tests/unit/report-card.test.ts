/**
 * Tests for the Report Card MCP Tool.
 *
 * Verifies:
 * - Compiles from populated session state
 * - Handles empty/minimal session state
 * - Calculates score deltas correctly
 * - Persists to disk
 * - Retrieves previous report cards
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SessionState } from '../../src/session/session-state.js';
import { AutoApproveGateResolver } from '../../src/gates/gate-resolver.js';
import { createReportCardTools } from '../../src/mcp/tools/report-card.js';
import type { SessionReportCard } from '../../src/types/report-card.js';

// ── Helper: invoke a tool ────────────────────────────────────────────────

async function invokeTool(tools: ReturnType<typeof createReportCardTools>, name: string, args: Record<string, unknown>) {
  const t = tools.find((t: any) => t.name === name);
  if (!t) throw new Error(`Tool not found: ${name}`);
  return (t as any).handler(args);
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('Report Card Tool', () => {
  let session: SessionState;
  let tools: ReturnType<typeof createReportCardTools>;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shem-reports-'));
    session = new SessionState('test-session-001', {
      gateResolver: new AutoApproveGateResolver(),
      reportsDir: tmpDir,
    });
    tools = createReportCardTools(session);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('compiles report card from populated session', async () => {
    // Set up before/after scores
    session.beforeScores = [
      { dimension: 'readability', score: 1.5, classification: 'RED' },
      { dimension: 'findability', score: 2.0, classification: 'YELLOW' },
    ];
    session.afterScores = [
      { dimension: 'readability', score: 3.2, classification: 'GREEN' },
      { dimension: 'findability', score: 3.5, classification: 'GREEN' },
    ];

    // Add a verification result
    session.verificationResults.push({
      id: 'V-001',
      verificationType: 'self',
      verifierRole: 'synthesis-editor',
      targetStep: 'transformation',
      passed: true,
      confidence: 0.9,
      findings: [],
      timestamp: new Date().toISOString(),
    });

    // Add findings
    session.debate.findings.push({
      id: 'F-001',
      agentRole: 'design-reviewer',
      findingType: 'score',
      content: 'Poor readability',
      severity: 'RED',
      evidence: ['FK grade 16'],
      confidence: 0.85,
      timestamp: new Date().toISOString(),
      resolved: true,
    });

    // Add precedent tracking
    session.precedentsQueried.push('P-001', 'P-002');
    session.precedentsApplied.push('P-001');
    session.precedentsSaved.push('P-003');

    const result = await invokeTool(tools, 'compile_report_card', {
      document_type: 'privacy_policy',
      jurisdiction: 'EU',
    });

    expect(result.content[0].text).toContain('Session Report Card');
    expect(result.content[0].text).toContain('privacy_policy');
    expect(result.content[0].text).toContain('Report card saved');

    // Verify session state updated
    expect(session.reportCard).not.toBeNull();
    expect(session.reportCard!.documentType).toBe('privacy_policy');
    expect(session.reportCard!.jurisdiction).toBe('EU');
  });

  it('calculates score deltas correctly', async () => {
    session.beforeScores = [
      { dimension: 'readability', score: 1.0, classification: 'RED' },
      { dimension: 'findability', score: 3.0, classification: 'GREEN' },
    ];
    session.afterScores = [
      { dimension: 'readability', score: 3.0, classification: 'GREEN' },
      { dimension: 'findability', score: 2.5, classification: 'YELLOW' }, // Regression!
    ];

    await invokeTool(tools, 'compile_report_card', {
      document_type: 'terms_of_service',
      jurisdiction: 'US',
    });

    const card = session.reportCard!;
    expect(card.scores.deltas).toHaveLength(2);

    const readability = card.scores.deltas.find(d => d.dimension === 'readability')!;
    expect(readability.delta).toBe(2.0);
    expect(readability.regressed).toBe(false);

    const findability = card.scores.deltas.find(d => d.dimension === 'findability')!;
    expect(findability.delta).toBe(-0.5);
    expect(findability.regressed).toBe(true);

    // Overall improvement: (2.0 + -0.5) / 2 = 0.75
    expect(card.scores.overallImprovement).toBe(0.75);
  });

  it('handles empty session state gracefully', async () => {
    const result = await invokeTool(tools, 'compile_report_card', {
      document_type: 'nda',
      jurisdiction: 'UK',
    });

    expect(result.content[0].text).toContain('Session Report Card');

    const card = session.reportCard!;
    expect(card.scores.deltas).toHaveLength(0);
    expect(card.scores.overallImprovement).toBe(0);
    expect(card.verification.overallPassRate).toBe(0);
    expect(card.debate.totalFindings).toBe(0);
    expect(card.precedents.queried).toHaveLength(0);
  });

  it('persists report card to disk', async () => {
    session.beforeScores = [
      { dimension: 'clarity', score: 2.0, classification: 'YELLOW' },
    ];
    session.afterScores = [
      { dimension: 'clarity', score: 3.5, classification: 'GREEN' },
    ];

    await invokeTool(tools, 'compile_report_card', {
      document_type: 'privacy_policy',
      jurisdiction: 'EU',
    });

    const filePath = path.join(tmpDir, 'test-session-001.json');
    expect(fs.existsSync(filePath)).toBe(true);

    const stored = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as SessionReportCard;
    expect(stored.sessionId).toBe('test-session-001');
    expect(stored.documentType).toBe('privacy_policy');
    expect(stored.scores.deltas[0].delta).toBe(1.5);
  });

  it('retrieves previous report card', async () => {
    // First compile one
    session.beforeScores = [
      { dimension: 'readability', score: 1.0, classification: 'RED' },
    ];
    session.afterScores = [
      { dimension: 'readability', score: 3.0, classification: 'GREEN' },
    ];

    await invokeTool(tools, 'compile_report_card', {
      document_type: 'privacy_policy',
      jurisdiction: 'EU',
    });

    // Now retrieve it
    const result = await invokeTool(tools, 'get_report_card', {
      session_id: 'test-session-001',
    });

    expect(result.content[0].text).toContain('Report Card — test-session-001');
    expect(result.content[0].text).toContain('privacy_policy');
  });

  it('returns not found for missing report card', async () => {
    const result = await invokeTool(tools, 'get_report_card', {
      session_id: 'nonexistent-session',
    });

    expect(result.content[0].text).toContain('No report card found');
  });

  it('compiles verification metrics correctly', async () => {
    session.verificationResults.push(
      {
        id: 'V-001', verificationType: 'self', verifierRole: 'synthesis-editor',
        targetStep: 'transformation', passed: true, confidence: 0.9, findings: [],
        timestamp: new Date().toISOString(),
      },
      {
        id: 'V-002', verificationType: 'cross', verifierRole: 'meaning-guardian',
        targetStep: 'transformation', passed: false, confidence: 0.6,
        findings: ['Unaddressed: finding about obligations'],
        timestamp: new Date().toISOString(),
      },
      {
        id: 'V-003', verificationType: 'score', verifierRole: 'synthesis-editor',
        targetStep: 'transformation', passed: true, confidence: 1.0, findings: [],
        timestamp: new Date().toISOString(),
      }
    );

    await invokeTool(tools, 'compile_report_card', {
      document_type: 'terms_of_service',
      jurisdiction: 'US-CA',
    });

    const card = session.reportCard!;
    expect(card.verification.selfVerification.passed).toBe(true);
    expect(card.verification.selfVerification.confidence).toBe(0.9);
    expect(card.verification.crossVerification.passed).toBe(false);
    expect(card.verification.crossVerification.confidence).toBe(0.6);
    expect(card.verification.scoreVerification.passed).toBe(true);
    expect(card.verification.scoreVerification.regressionCount).toBe(0);

    // 2 out of 3 passed
    expect(card.verification.overallPassRate).toBeCloseTo(0.67, 1);
  });

  it('compiles debate metrics with agent performance', async () => {
    session.debate.findings.push(
      {
        id: 'F-001', agentRole: 'design-reviewer', findingType: 'score',
        content: 'Low readability', severity: 'RED', evidence: [], confidence: 0.8,
        timestamp: new Date().toISOString(), resolved: true,
      },
      {
        id: 'F-002', agentRole: 'design-reviewer', findingType: 'dark-pattern',
        content: 'Dark pattern found', severity: 'YELLOW', evidence: [], confidence: 0.7,
        timestamp: new Date().toISOString(), resolved: false,
      },
      {
        id: 'F-003', agentRole: 'ethics-auditor', findingType: 'score',
        content: 'Ethics concern', severity: 'RED', evidence: [], confidence: 0.9,
        timestamp: new Date().toISOString(), resolved: true,
      }
    );

    session.debate.challenges.push({
      id: 'C-001', challengerRole: 'meaning-guardian', targetFindingId: 'F-001',
      challengeText: 'Readability is fine', evidence: [], timestamp: new Date().toISOString(),
      resolved: true,
    });

    session.debate.responses.push({
      id: 'R-001', responderRole: 'design-reviewer', challengeId: 'C-001',
      responseText: 'FK grade proves it', accepted: true, timestamp: new Date().toISOString(),
    });

    session.debate.resolutions.push({
      id: 'RES-001', debateTopic: 'Readability scoring', findingIds: ['F-001'],
      resolution: 'Score confirmed', winningPosition: 'Finding stands',
      evidenceWeight: 'Strong', confidence: 0.85, escalationNeeded: false,
      resolvedBy: 'orchestrator', timestamp: new Date().toISOString(),
    });

    await invokeTool(tools, 'compile_report_card', {
      document_type: 'privacy_policy',
      jurisdiction: 'EU',
    });

    const card = session.reportCard!;
    expect(card.debate.totalFindings).toBe(3);
    expect(card.debate.findingsBySeverity.RED).toBe(2);
    expect(card.debate.findingsBySeverity.YELLOW).toBe(1);
    expect(card.debate.totalChallenges).toBe(1);
    expect(card.debate.totalResolutions).toBe(1);
    expect(card.debate.resolutionRate).toBe(1.0);

    // Agent performance
    const designReviewer = card.agentPerformance.find(a => a.agentId === 'design-reviewer');
    expect(designReviewer).toBeDefined();
    expect(designReviewer!.findingsCount).toBe(2);
    expect(designReviewer!.challengesReceived).toBe(1);
    expect(designReviewer!.challengesSurvived).toBe(1);
  });

  it('emits report_card_compiled event', async () => {
    const events: any[] = [];
    session.events.on('event', (e: any) => events.push(e));

    await invokeTool(tools, 'compile_report_card', {
      document_type: 'contract',
      jurisdiction: 'UK',
    });

    const reportEvent = events.find(e => e.type === 'report_card_compiled');
    expect(reportEvent).toBeDefined();
    expect(reportEvent.sessionId).toBe('test-session-001');
  });
});
