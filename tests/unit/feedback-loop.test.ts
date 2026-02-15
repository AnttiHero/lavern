/**
 * Tests for the Feedback Loop MCP Tool.
 *
 * Verifies:
 * - Updates precedent effectiveness scores from report card outcomes
 * - Updates institutional memory effectiveness
 * - Creates anti-patterns from regressions
 * - Creates anti-patterns from failed verifications
 * - Auto-deprecates precedents with consecutive poor outcomes
 * - Backward-compatible with old v3 JSON files (migration)
 * - Record and query anti-patterns
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SessionState } from '../../src/session/session-state.js';
import { AutoApproveGateResolver } from '../../src/gates/gate-resolver.js';
import { createFeedbackLoopTools } from '../../src/mcp/tools/feedback-loop.js';
import type { SessionReportCard } from '../../src/types/report-card.js';
import type { PrecedentEntry, InstitutionalMemoryEntry } from '../../src/mcp/tools/memory-system.js';

// ── Helper: invoke a tool ────────────────────────────────────────────────

async function invokeTool(tools: ReturnType<typeof createFeedbackLoopTools>, name: string, args: Record<string, unknown> = {}) {
  const t = tools.find((t: any) => t.name === name);
  if (!t) throw new Error(`Tool not found: ${name}`);
  return (t as any).handler(args);
}

function makeReportCard(overrides: Partial<SessionReportCard> = {}): SessionReportCard {
  return {
    sessionId: 'test-session-001',
    timestamp: new Date().toISOString(),
    documentType: 'privacy_policy',
    jurisdiction: 'EU',
    scores: {
      before: [{ dimension: 'readability', score: 1.5, classification: 'RED' }],
      after: [{ dimension: 'readability', score: 3.0, classification: 'GREEN' }],
      deltas: [{ dimension: 'readability', before: 1.5, after: 3.0, delta: 1.5, regressed: false }],
      overallImprovement: 1.5,
    },
    verification: {
      selfVerification: { passed: true, confidence: 0.9 },
      crossVerification: { passed: true, confidence: 0.8 },
      scoreVerification: { passed: true, regressionCount: 0 },
      overallPassRate: 1.0,
      overallConfidence: 0.85,
    },
    debate: {
      totalFindings: 3,
      findingsBySeverity: { RED: 1, YELLOW: 1, GREEN: 1 },
      findingsByAgent: { 'design-reviewer': 2, 'ethics-auditor': 1 },
      totalChallenges: 1,
      totalResolutions: 1,
      resolutionRate: 1.0,
      averageResolutionConfidence: 0.85,
    },
    precedents: {
      queried: ['P-001'],
      applied: ['P-001'],
      saved: ['P-002'],
    },
    agentPerformance: [],
    gates: [],
    cost: { totalUsd: 0.5, budgetUsd: 5.0 },
    durationMs: 30000,
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('Feedback Loop Tool', () => {
  let session: SessionState;
  let tools: ReturnType<typeof createFeedbackLoopTools>;
  let tmpDir: string;
  let memoryDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shem-feedback-'));
    memoryDir = path.join(tmpDir, 'memory');
    fs.mkdirSync(memoryDir, { recursive: true });

    session = new SessionState('test-session-001', {
      gateResolver: new AutoApproveGateResolver(),
      memoryDir,
      reportsDir: path.join(tmpDir, 'reports'),
    });
    tools = createFeedbackLoopTools(session);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('requires report card before running', async () => {
    const result = await invokeTool(tools, 'run_feedback_loop');
    expect(result.content[0].text).toContain('No report card found');
  });

  it('updates precedent effectiveness from report card', async () => {
    // Pre-populate a precedent
    const precedent: PrecedentEntry = {
      id: 'P-001',
      documentType: 'privacy_policy',
      jurisdiction: 'EU',
      patternName: 'Simplify consent',
      description: 'Replace legal jargon with plain language consent',
      beforeSnippet: 'Hereby grants consent...',
      afterSnippet: 'You agree to...',
      qualityScore: 3.5,
      addedAt: new Date().toISOString(),
      timesUsed: 0,
      timesQueried: 0,
      effectivenessScore: 0.875,
      outcomes: [],
      deprecated: false,
    };
    fs.writeFileSync(
      path.join(memoryDir, 'precedents.json'),
      JSON.stringify([precedent]),
    );

    session.reportCard = makeReportCard();

    const result = await invokeTool(tools, 'run_feedback_loop');
    expect(result.content[0].text).toContain('Precedents updated**: 1');

    // Read back and verify
    const updated = JSON.parse(
      fs.readFileSync(path.join(memoryDir, 'precedents.json'), 'utf-8'),
    ) as PrecedentEntry[];

    expect(updated[0].timesQueried).toBe(1);
    expect(updated[0].timesUsed).toBe(1);
    expect(updated[0].outcomes).toHaveLength(1);
    expect(updated[0].effectivenessScore).not.toBe(0.875); // Changed
  });

  it('records anti-patterns from score regressions', async () => {
    session.reportCard = makeReportCard({
      scores: {
        before: [{ dimension: 'findability', score: 3.0, classification: 'GREEN' }],
        after: [{ dimension: 'findability', score: 2.0, classification: 'YELLOW' }],
        deltas: [{ dimension: 'findability', before: 3.0, after: 2.0, delta: -1.0, regressed: true }],
        overallImprovement: -1.0,
      },
    });

    await invokeTool(tools, 'run_feedback_loop');

    const antiPatterns = JSON.parse(
      fs.readFileSync(path.join(memoryDir, 'anti-patterns.json'), 'utf-8'),
    );

    expect(antiPatterns).toHaveLength(1);
    expect(antiPatterns[0].category).toBe('regression');
    expect(antiPatterns[0].description).toContain('findability');
    expect(antiPatterns[0].severity).toBe('YELLOW');
  });

  it('records anti-patterns from failed verifications', async () => {
    session.reportCard = makeReportCard({
      verification: {
        selfVerification: { passed: false, confidence: 0.4 },
        crossVerification: { passed: false, confidence: 0.3 },
        scoreVerification: { passed: false, regressionCount: 2 },
        overallPassRate: 0.33,
        overallConfidence: 0.35,
      },
    });

    await invokeTool(tools, 'run_feedback_loop');

    const antiPatterns = JSON.parse(
      fs.readFileSync(path.join(memoryDir, 'anti-patterns.json'), 'utf-8'),
    );

    const verificationFailure = antiPatterns.find(
      (ap: any) => ap.category === 'verification_failure',
    );
    expect(verificationFailure).toBeDefined();
    expect(verificationFailure.severity).toBe('RED');
  });

  it('auto-deprecates precedents with 3+ consecutive poor outcomes', async () => {
    const precedent: PrecedentEntry = {
      id: 'P-001',
      documentType: 'privacy_policy',
      jurisdiction: 'EU',
      patternName: 'Bad pattern',
      description: 'A pattern that keeps failing',
      beforeSnippet: '...',
      afterSnippet: '...',
      qualityScore: 2.0,
      addedAt: new Date().toISOString(),
      timesUsed: 2,
      timesQueried: 2,
      effectivenessScore: 0.2,
      outcomes: [
        { sessionId: 's1', timestamp: new Date().toISOString(), applied: true, scoreDelta: -0.5, verificationPassed: false },
        { sessionId: 's2', timestamp: new Date().toISOString(), applied: true, scoreDelta: -0.3, verificationPassed: false },
      ],
      deprecated: false,
    };
    fs.writeFileSync(
      path.join(memoryDir, 'precedents.json'),
      JSON.stringify([precedent]),
    );

    // Third poor outcome will trigger auto-deprecation
    session.reportCard = makeReportCard({
      scores: {
        before: [],
        after: [],
        deltas: [],
        overallImprovement: -0.5,
      },
      verification: {
        selfVerification: { passed: false, confidence: 0.3 },
        crossVerification: { passed: false, confidence: 0.2 },
        scoreVerification: { passed: false, regressionCount: 1 },
        overallPassRate: 0.0,
        overallConfidence: 0.25,
      },
      precedents: { queried: ['P-001'], applied: ['P-001'], saved: [] },
    });

    const result = await invokeTool(tools, 'run_feedback_loop');
    expect(result.content[0].text).toContain('auto-deprecated');

    const updated = JSON.parse(
      fs.readFileSync(path.join(memoryDir, 'precedents.json'), 'utf-8'),
    ) as PrecedentEntry[];

    expect(updated[0].deprecated).toBe(true);
    expect(updated[0].deprecationReason).toContain('Auto-deprecated');
  });

  it('is backward-compatible with v3 precedent files', async () => {
    // v3 file — no v4 fields
    const v3Precedent = {
      id: 'P-001',
      documentType: 'privacy_policy',
      jurisdiction: 'EU',
      patternName: 'Old pattern',
      description: 'From v3',
      beforeSnippet: '...',
      afterSnippet: '...',
      qualityScore: 3.0,
      addedAt: new Date().toISOString(),
    };
    fs.writeFileSync(
      path.join(memoryDir, 'precedents.json'),
      JSON.stringify([v3Precedent]),
    );

    session.reportCard = makeReportCard({
      precedents: { queried: ['P-001'], applied: ['P-001'], saved: [] },
    });

    // Should not throw
    await invokeTool(tools, 'run_feedback_loop');

    const updated = JSON.parse(
      fs.readFileSync(path.join(memoryDir, 'precedents.json'), 'utf-8'),
    ) as PrecedentEntry[];

    expect(updated[0].timesUsed).toBe(1);
    expect(updated[0].timesQueried).toBe(1);
    expect(updated[0].outcomes).toHaveLength(1);
    expect(updated[0].deprecated).toBe(false);
    // effectivenessScore should have been initialized from qualityScore/4 then updated
    expect(updated[0].effectivenessScore).toBeGreaterThan(0);
  });

  it('records a manual anti-pattern', async () => {
    const result = await invokeTool(tools, 'record_anti_pattern', {
      document_type: 'terms_of_service',
      jurisdiction: 'US',
      description: 'Never remove arbitration clause without explicit consent',
      category: 'gate_rejection',
      severity: 'RED',
    });

    expect(result.content[0].text).toContain('Recorded anti-pattern');

    const antiPatterns = JSON.parse(
      fs.readFileSync(path.join(memoryDir, 'anti-patterns.json'), 'utf-8'),
    );
    expect(antiPatterns).toHaveLength(1);
    expect(antiPatterns[0].category).toBe('gate_rejection');
  });

  it('queries anti-patterns with filters', async () => {
    // Seed two anti-patterns
    const antiPatterns = [
      {
        id: 'AP-001', documentType: 'privacy_policy', jurisdiction: 'EU',
        description: 'Score regression in readability', source: 's1',
        category: 'regression', severity: 'YELLOW',
        addedAt: new Date().toISOString(), occurrences: 2,
        lastSeenAt: new Date().toISOString(),
      },
      {
        id: 'AP-002', documentType: 'terms_of_service', jurisdiction: 'US',
        description: 'Verification failure', source: 's2',
        category: 'verification_failure', severity: 'RED',
        addedAt: new Date().toISOString(), occurrences: 1,
        lastSeenAt: new Date().toISOString(),
      },
    ];
    fs.writeFileSync(
      path.join(memoryDir, 'anti-patterns.json'),
      JSON.stringify(antiPatterns),
    );

    // Query by document type
    const result = await invokeTool(tools, 'query_anti_patterns', {
      document_type: 'privacy_policy',
    });
    expect(result.content[0].text).toContain('AP-001');
    expect(result.content[0].text).not.toContain('AP-002');
  });

  it('manually updates precedent effectiveness', async () => {
    const precedent: PrecedentEntry = {
      id: 'P-001',
      documentType: 'privacy_policy',
      jurisdiction: 'EU',
      patternName: 'Test',
      description: 'Test',
      beforeSnippet: '...',
      afterSnippet: '...',
      qualityScore: 3.0,
      addedAt: new Date().toISOString(),
      timesUsed: 5,
      timesQueried: 10,
      effectivenessScore: 0.3,
      outcomes: [],
      deprecated: true,
      deprecationReason: 'Auto-deprecated',
    };
    fs.writeFileSync(
      path.join(memoryDir, 'precedents.json'),
      JSON.stringify([precedent]),
    );

    const result = await invokeTool(tools, 'update_precedent_effectiveness', {
      precedent_id: 'P-001',
      effectiveness_score: 0.8,
      notes: 'Human override — pattern works well for Finnish law',
      undeprecate: true,
    });

    expect(result.content[0].text).toContain('0.300');
    expect(result.content[0].text).toContain('0.800');
    expect(result.content[0].text).toContain('un-deprecated');

    const updated = JSON.parse(
      fs.readFileSync(path.join(memoryDir, 'precedents.json'), 'utf-8'),
    ) as PrecedentEntry[];
    expect(updated[0].effectivenessScore).toBe(0.8);
    expect(updated[0].deprecated).toBe(false);
  });

  it('emits feedback_loop_completed event', async () => {
    session.reportCard = makeReportCard();
    const events: any[] = [];
    session.events.on('event', (e: any) => events.push(e));

    await invokeTool(tools, 'run_feedback_loop');

    const feedbackEvent = events.find(e => e.type === 'feedback_loop_completed');
    expect(feedbackEvent).toBeDefined();
    expect(feedbackEvent.sessionId).toBe('test-session-001');
  });
});
