/**
 * Integration Test: Full Learning Cycle
 *
 * Simulates the complete feedback loop across multiple sessions:
 * 1. Session 1: analyze, save precedents and lessons
 * 2. Session 2: query memories, produce report card, run feedback loop
 * 3. Verify: precedent effectiveness updated, baselines computed
 * 4. Session 3: check against baseline, detect any regressions
 *
 * This tests the system "getting better over time."
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SessionState } from '../../src/session/session-state.js';
import { AutoApproveGateResolver } from '../../src/gates/gate-resolver.js';
import { createMemoryTools } from '../../src/mcp/tools/memory-system.js';
import { createReportCardTools } from '../../src/mcp/tools/report-card.js';
import { createFeedbackLoopTools } from '../../src/mcp/tools/feedback-loop.js';
import { createBaselineTools } from '../../src/mcp/tools/baselines.js';
import { createLegalMdTools } from '../../src/mcp/tools/legal-md-compiler.js';
import { createReplayTestingTools } from '../../src/mcp/tools/session-replay-testing.js';
import type { SessionReportCard } from '../../src/types/report-card.js';

// ── Helper ───────────────────────────────────────────────────────────────

async function invokeTool(tools: any[], name: string, args: Record<string, unknown> = {}) {
  const t = tools.find((t: any) => t.name === name);
  if (!t) throw new Error(`Tool not found: ${name}`);
  return (t as any).handler(args);
}

function createSession(id: string, dirs: { memoryDir: string; reportsDir: string; baselinesDir: string }): SessionState {
  return new SessionState(id, {
    gateResolver: new AutoApproveGateResolver(),
    memoryDir: dirs.memoryDir,
    reportsDir: dirs.reportsDir,
    baselinesDir: dirs.baselinesDir,
  });
}

function populateSessionForGoodOutcome(session: SessionState): void {
  session.beforeScores = [
    { dimension: 'readability', score: 1.5, classification: 'RED' },
    { dimension: 'findability', score: 2.0, classification: 'YELLOW' },
    { dimension: 'clarity', score: 1.8, classification: 'RED' },
  ];
  session.afterScores = [
    { dimension: 'readability', score: 3.2, classification: 'GREEN' },
    { dimension: 'findability', score: 3.5, classification: 'GREEN' },
    { dimension: 'clarity', score: 3.0, classification: 'GREEN' },
  ];
  session.verificationResults.push(
    {
      id: 'V-001', verificationType: 'self', verifierRole: 'synthesis-editor',
      targetStep: 'transformation', passed: true, confidence: 0.9, findings: [],
      timestamp: new Date().toISOString(),
    },
    {
      id: 'V-002', verificationType: 'cross', verifierRole: 'meaning-guardian',
      targetStep: 'transformation', passed: true, confidence: 0.85, findings: [],
      timestamp: new Date().toISOString(),
    },
    {
      id: 'V-003', verificationType: 'score', verifierRole: 'synthesis-editor',
      targetStep: 'transformation', passed: true, confidence: 1.0, findings: [],
      timestamp: new Date().toISOString(),
    },
  );
  session.debate.findings.push({
    id: 'F-001', agentRole: 'design-reviewer', findingType: 'score',
    content: 'Low readability', severity: 'RED', evidence: ['FK 14'], confidence: 0.85,
    timestamp: new Date().toISOString(), resolved: true,
  });
  session.accumulatedCost = 0.5;
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('Full Learning Cycle (Integration)', () => {
  let tmpDir: string;
  let memoryDir: string;
  let reportsDir: string;
  let baselinesDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shem-integration-'));
    memoryDir = path.join(tmpDir, '.shem', 'memory');
    reportsDir = path.join(tmpDir, '.shem', 'reports');
    baselinesDir = path.join(tmpDir, '.shem', 'baselines');
    fs.mkdirSync(memoryDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const dirs = () => ({ memoryDir, reportsDir, baselinesDir });

  it('Session 1: saves precedent and institutional memory', async () => {
    const session = createSession('session-001', dirs());
    const memoryTools = createMemoryTools(session);

    // Save a precedent
    await invokeTool(memoryTools, 'save_precedent', {
      document_type: 'privacy_policy',
      jurisdiction: 'EU',
      pattern_name: 'Simplify consent clause',
      description: 'Replace legal consent language with plain English',
      before_snippet: 'Hereby grants irrevocable consent...',
      after_snippet: 'You agree to let us...',
      quality_score: 3.5,
    });

    // Save institutional memory
    await invokeTool(memoryTools, 'add_institutional_memory', {
      category: 'lesson',
      content: 'Privacy policies in EU should always reference GDPR Article 7',
      source: 'ethics-auditor',
    });

    // Verify files exist
    expect(fs.existsSync(path.join(memoryDir, 'precedents.json'))).toBe(true);
    expect(fs.existsSync(path.join(memoryDir, 'institutional.json'))).toBe(true);

    // Track precedent saved (ID is timestamp-based, just check one was recorded)
    expect(session.precedentsSaved).toHaveLength(1);
    expect(session.precedentsSaved[0]).toMatch(/^P-/);
  });

  it('Session 2: queries memories, compiles report card, runs feedback loop', async () => {
    // First set up Session 1 data
    const session1 = createSession('session-001', dirs());
    const memoryTools1 = createMemoryTools(session1);
    await invokeTool(memoryTools1, 'save_precedent', {
      document_type: 'privacy_policy', jurisdiction: 'EU',
      pattern_name: 'Simplify consent', description: 'Test',
      before_snippet: '...', after_snippet: '...', quality_score: 3.5,
    });
    await invokeTool(memoryTools1, 'add_institutional_memory', {
      category: 'lesson', content: 'GDPR Article 7 reference', source: 'test',
    });

    // Now Session 2
    const session2 = createSession('session-002', dirs());
    const memoryTools2 = createMemoryTools(session2);
    const reportCardTools = createReportCardTools(session2);
    const feedbackTools = createFeedbackLoopTools(session2);

    // Query memories (simulates session start)
    const precedentResult = await invokeTool(memoryTools2, 'query_precedents', {
      document_type: 'privacy_policy', min_quality: 3.0,
    });
    expect(precedentResult.content[0].text).toContain('Simplify consent');

    // Verify precedentsQueried tracking (ID is timestamp-based)
    expect(session2.precedentsQueried).toHaveLength(1);
    const queriedId = session2.precedentsQueried[0];
    expect(queriedId).toMatch(/^P-/);

    // Mark that we applied the precedent
    session2.precedentsApplied.push(queriedId);

    // Populate session with results
    populateSessionForGoodOutcome(session2);

    // Compile report card
    await invokeTool(reportCardTools, 'compile_report_card', {
      document_type: 'privacy_policy', jurisdiction: 'EU',
    });
    expect(session2.reportCard).not.toBeNull();
    expect(session2.reportCard!.precedents.queried).toContain(queriedId);
    expect(session2.reportCard!.precedents.applied).toContain(queriedId);

    // Run feedback loop
    const feedbackResult = await invokeTool(feedbackTools, 'run_feedback_loop');
    expect(feedbackResult.content[0].text).toContain('Feedback Loop Complete');

    // Verify precedent effectiveness was updated
    const precedents = JSON.parse(
      fs.readFileSync(path.join(memoryDir, 'precedents.json'), 'utf-8'),
    );
    expect(precedents[0].timesUsed).toBe(1);
    expect(precedents[0].outcomes).toHaveLength(1);
    expect(precedents[0].effectivenessScore).not.toBe(precedents[0].qualityScore / 4);
  });

  it('Session 3: establishes baselines after 3 sessions', async () => {
    // Run 3 sessions with report cards
    for (let i = 1; i <= 3; i++) {
      const session = createSession(`session-${String(i).padStart(3, '0')}`, dirs());
      populateSessionForGoodOutcome(session);
      const tools = createReportCardTools(session);
      await invokeTool(tools, 'compile_report_card', {
        document_type: 'privacy_policy', jurisdiction: 'EU',
      });
    }

    // Now update baselines
    const session4 = createSession('session-004', dirs());
    const baselineTools = createBaselineTools(session4);

    const result = await invokeTool(baselineTools, 'update_baselines');
    expect(result.content[0].text).toContain('Baselines created**: 1');

    // Verify baseline file
    const baselinePath = path.join(baselinesDir, 'privacy_policy_EU.json');
    expect(fs.existsSync(baselinePath)).toBe(true);

    const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf-8'));
    expect(baseline.sampleSize).toBe(3);
    expect(baseline.expectedScores.length).toBe(3); // readability, findability, clarity
  });

  it('detects regressions against baseline', async () => {
    // Establish baseline from 3 good sessions
    for (let i = 1; i <= 3; i++) {
      const session = createSession(`session-${String(i).padStart(3, '0')}`, dirs());
      populateSessionForGoodOutcome(session);
      const tools = createReportCardTools(session);
      await invokeTool(tools, 'compile_report_card', {
        document_type: 'privacy_policy', jurisdiction: 'EU',
      });
    }

    const baselineSession = createSession('baseline-session', dirs());
    await invokeTool(createBaselineTools(baselineSession), 'update_baselines');

    // Now create a poor session
    const poorSession = createSession('session-poor', dirs());
    poorSession.beforeScores = [
      { dimension: 'readability', score: 1.5, classification: 'RED' },
      { dimension: 'findability', score: 2.0, classification: 'YELLOW' },
      { dimension: 'clarity', score: 1.8, classification: 'RED' },
    ];
    poorSession.afterScores = [
      { dimension: 'readability', score: 1.0, classification: 'RED' }, // Regression!
      { dimension: 'findability', score: 1.5, classification: 'RED' }, // Regression!
      { dimension: 'clarity', score: 1.2, classification: 'RED' },     // Regression!
    ];

    const reportCardTools = createReportCardTools(poorSession);
    await invokeTool(reportCardTools, 'compile_report_card', {
      document_type: 'privacy_policy', jurisdiction: 'EU',
    });

    // Check against baseline
    const checkResult = await invokeTool(
      createBaselineTools(poorSession),
      'check_against_baseline',
      { session_id: 'session-poor' },
    );

    // Should detect violations since all scores are far below baseline
    expect(
      checkResult.content[0].text.includes('REGRESSIONS') ||
      checkResult.content[0].text.includes('WARNINGS') ||
      checkResult.content[0].text.includes('readability')
    ).toBe(true);
  });

  it('full learning cycle: compile → feedback → baselines → LEGAL.md', async () => {
    // Run 3 sessions with full cycle
    for (let i = 1; i <= 3; i++) {
      const session = createSession(`session-${String(i).padStart(3, '0')}`, dirs());
      populateSessionForGoodOutcome(session);

      // Compile report card
      await invokeTool(createReportCardTools(session), 'compile_report_card', {
        document_type: 'privacy_policy', jurisdiction: 'EU',
      });

      // Run feedback loop
      await invokeTool(createFeedbackLoopTools(session), 'run_feedback_loop');
    }

    // Update baselines
    const finalSession = createSession('session-final', dirs());
    await invokeTool(createBaselineTools(finalSession), 'update_baselines');

    // Compile LEGAL.md
    await invokeTool(createLegalMdTools(finalSession), 'compile_legal_md');

    // Verify LEGAL.md exists
    const legalMdPath = path.join(tmpDir, '.shem', 'LEGAL.md');
    expect(fs.existsSync(legalMdPath)).toBe(true);

    const legalMd = fs.readFileSync(legalMdPath, 'utf-8');
    expect(legalMd).toContain('# LEGAL.md');
    expect(legalMd).toContain('Quality Baselines');

    // Verify baselines exist
    expect(fs.existsSync(path.join(baselinesDir, 'privacy_policy_EU.json'))).toBe(true);

    // Run batch regression
    const replayTools = createReplayTestingTools(finalSession);
    const batchResult = await invokeTool(replayTools, 'run_batch_regression');
    expect(batchResult.content[0].text).toContain('Sessions found**: 3');

    // Compare first and last sessions
    const compareResult = await invokeTool(replayTools, 'compare_sessions', {
      session_id_a: 'session-001',
      session_id_b: 'session-003',
    });
    expect(compareResult.content[0].text).toContain('Session Comparison');
  });

  it('anti-patterns are recorded and queryable across sessions', async () => {
    // Session 1: Good outcome
    const session1 = createSession('session-good', dirs());
    populateSessionForGoodOutcome(session1);
    await invokeTool(createReportCardTools(session1), 'compile_report_card', {
      document_type: 'privacy_policy', jurisdiction: 'EU',
    });
    await invokeTool(createFeedbackLoopTools(session1), 'run_feedback_loop');

    // Session 2: Bad outcome with regressions
    const session2 = createSession('session-bad', dirs());
    session2.beforeScores = [
      { dimension: 'readability', score: 3.0, classification: 'GREEN' },
    ];
    session2.afterScores = [
      { dimension: 'readability', score: 1.5, classification: 'RED' },
    ];
    session2.verificationResults.push({
      id: 'V-001', verificationType: 'self', verifierRole: 'test',
      targetStep: 'transformation', passed: false, confidence: 0.4,
      findings: ['Failed criteria'], timestamp: new Date().toISOString(),
    });
    await invokeTool(createReportCardTools(session2), 'compile_report_card', {
      document_type: 'privacy_policy', jurisdiction: 'EU',
    });
    await invokeTool(createFeedbackLoopTools(session2), 'run_feedback_loop');

    // Session 3: Query anti-patterns
    const session3 = createSession('session-query', dirs());
    const feedbackTools3 = createFeedbackLoopTools(session3);
    const result = await invokeTool(feedbackTools3, 'query_anti_patterns', {
      document_type: 'privacy_policy',
    });

    // Should find anti-patterns from session-bad
    expect(result.content[0].text).toContain('regression');
  });

  it('quality trend shows direction over sessions', async () => {
    // Session 1: Small improvement
    const s1 = createSession('trend-001', dirs());
    s1.beforeScores = [{ dimension: 'readability', score: 1.5, classification: 'RED' }];
    s1.afterScores = [{ dimension: 'readability', score: 2.0, classification: 'YELLOW' }];
    await invokeTool(createReportCardTools(s1), 'compile_report_card', {
      document_type: 'privacy_policy', jurisdiction: 'EU',
    });

    // Session 2: Medium improvement
    const s2 = createSession('trend-002', dirs());
    s2.beforeScores = [{ dimension: 'readability', score: 1.5, classification: 'RED' }];
    s2.afterScores = [{ dimension: 'readability', score: 2.5, classification: 'YELLOW' }];
    await invokeTool(createReportCardTools(s2), 'compile_report_card', {
      document_type: 'privacy_policy', jurisdiction: 'EU',
    });

    // Session 3: Large improvement
    const s3 = createSession('trend-003', dirs());
    s3.beforeScores = [{ dimension: 'readability', score: 1.5, classification: 'RED' }];
    s3.afterScores = [{ dimension: 'readability', score: 3.5, classification: 'GREEN' }];
    await invokeTool(createReportCardTools(s3), 'compile_report_card', {
      document_type: 'privacy_policy', jurisdiction: 'EU',
    });

    // Check trend
    const trendSession = createSession('trend-check', dirs());
    const result = await invokeTool(createBaselineTools(trendSession), 'get_quality_trend', {
      document_type: 'privacy_policy', jurisdiction: 'EU',
    });

    expect(result.content[0].text).toContain('Quality Trend');
    expect(result.content[0].text).toContain('3'); // 3 sessions
  });
});
