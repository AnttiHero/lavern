/**
 * Tests for Baselines + Regression Testing MCP Tools.
 *
 * Verifies:
 * - Computes baselines from multiple report cards
 * - Requires minimum 3 sessions
 * - Detects violations when scores drop below baseline
 * - Handles small sample sizes
 * - Batch regression across all sessions
 * - Session comparison
 * - Quality trend detection
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SessionState } from '../../src/session/session-state.js';
import { AutoApproveGateResolver } from '../../src/gates/gate-resolver.js';
import { createBaselineTools } from '../../src/mcp/tools/baselines.js';
import { createReplayTestingTools } from '../../src/mcp/tools/session-replay-testing.js';
import type { SessionReportCard } from '../../src/types/report-card.js';

// ── Helper ───────────────────────────────────────────────────────────────

async function invokeTool(tools: any[], name: string, args: Record<string, unknown> = {}) {
  const t = tools.find((t: any) => t.name === name);
  if (!t) throw new Error(`Tool not found: ${name}`);
  return (t as any).handler(args);
}

function makeReportCard(sessionId: string, overrides: Partial<SessionReportCard> = {}): SessionReportCard {
  return {
    sessionId,
    timestamp: new Date().toISOString(),
    documentType: 'privacy_policy',
    jurisdiction: 'EU',
    scores: {
      before: [
        { dimension: 'readability', score: 1.5, classification: 'RED' },
        { dimension: 'findability', score: 2.0, classification: 'YELLOW' },
      ],
      after: [
        { dimension: 'readability', score: 3.0, classification: 'GREEN' },
        { dimension: 'findability', score: 3.5, classification: 'GREEN' },
      ],
      deltas: [
        { dimension: 'readability', before: 1.5, after: 3.0, delta: 1.5, regressed: false },
        { dimension: 'findability', before: 2.0, after: 3.5, delta: 1.5, regressed: false },
      ],
      overallImprovement: 1.5,
    },
    verification: {
      selfVerification: { passed: true, confidence: 0.9 },
      crossVerification: { passed: true, confidence: 0.85 },
      scoreVerification: { passed: true, regressionCount: 0 },
      overallPassRate: 1.0,
      overallConfidence: 0.87,
    },
    debate: {
      totalFindings: 3,
      findingsBySeverity: { RED: 1, YELLOW: 1, GREEN: 1 },
      findingsByAgent: {},
      totalChallenges: 1,
      totalResolutions: 1,
      resolutionRate: 1.0,
      averageResolutionConfidence: 0.85,
    },
    precedents: { queried: [], applied: [], saved: [] },
    agentPerformance: [],
    gates: [],
    cost: { totalUsd: 0.5, budgetUsd: 5.0 },
    durationMs: 30000,
    ...overrides,
  };
}

function saveReportCard(reportsDir: string, card: SessionReportCard): void {
  fs.mkdirSync(reportsDir, { recursive: true });
  fs.writeFileSync(
    path.join(reportsDir, `${card.sessionId}.json`),
    JSON.stringify(card, null, 2),
  );
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('Baselines Tool', () => {
  let session: SessionState;
  let baselineTools: ReturnType<typeof createBaselineTools>;
  let tmpDir: string;
  let reportsDir: string;
  let baselinesDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shem-baselines-'));
    reportsDir = path.join(tmpDir, 'reports');
    baselinesDir = path.join(tmpDir, 'baselines');

    session = new SessionState('test-current', {
      gateResolver: new AutoApproveGateResolver(),
      reportsDir,
      baselinesDir,
    });
    baselineTools = createBaselineTools(session);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('requires minimum 3 sessions for baseline', async () => {
    saveReportCard(reportsDir, makeReportCard('s1'));
    saveReportCard(reportsDir, makeReportCard('s2'));

    const result = await invokeTool(baselineTools, 'update_baselines');
    expect(result.content[0].text).toContain('2/3 sessions');
    expect(result.content[0].text).toContain('not enough');
  });

  it('computes baselines from 3+ report cards', async () => {
    saveReportCard(reportsDir, makeReportCard('s1'));
    saveReportCard(reportsDir, makeReportCard('s2'));
    saveReportCard(reportsDir, makeReportCard('s3'));

    const result = await invokeTool(baselineTools, 'update_baselines');
    expect(result.content[0].text).toContain('Baselines created**: 1');

    // Verify file exists
    const baselinePath = path.join(baselinesDir, 'privacy_policy_EU.json');
    expect(fs.existsSync(baselinePath)).toBe(true);

    const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf-8'));
    expect(baseline.sampleSize).toBe(3);
    expect(baseline.expectedScores.length).toBe(2);
    expect(baseline.expectedScores[0].mean).toBe(3); // All three have readability 3.0
  });

  it('retrieves baseline', async () => {
    saveReportCard(reportsDir, makeReportCard('s1'));
    saveReportCard(reportsDir, makeReportCard('s2'));
    saveReportCard(reportsDir, makeReportCard('s3'));

    await invokeTool(baselineTools, 'update_baselines');

    const result = await invokeTool(baselineTools, 'get_baseline', {
      document_type: 'privacy_policy',
      jurisdiction: 'EU',
    });
    expect(result.content[0].text).toContain('Quality Baseline');
    expect(result.content[0].text).toContain('readability');
  });

  it('detects violations when scores below baseline', async () => {
    // Create 3 good sessions to establish baseline
    saveReportCard(reportsDir, makeReportCard('s1'));
    saveReportCard(reportsDir, makeReportCard('s2'));
    saveReportCard(reportsDir, makeReportCard('s3'));
    await invokeTool(baselineTools, 'update_baselines');

    // Create a poor session
    saveReportCard(reportsDir, makeReportCard('s4', {
      scores: {
        before: [
          { dimension: 'readability', score: 1.5, classification: 'RED' },
          { dimension: 'findability', score: 2.0, classification: 'YELLOW' },
        ],
        after: [
          { dimension: 'readability', score: 1.0, classification: 'RED' }, // Way below baseline of 3.0
          { dimension: 'findability', score: 3.5, classification: 'GREEN' },
        ],
        deltas: [
          { dimension: 'readability', before: 1.5, after: 1.0, delta: -0.5, regressed: true },
          { dimension: 'findability', before: 2.0, after: 3.5, delta: 1.5, regressed: false },
        ],
        overallImprovement: 0.5,
      },
    }));

    const result = await invokeTool(baselineTools, 'check_against_baseline', {
      session_id: 's4',
    });

    // Since all 3 baseline sessions have score 3.0, stdDev is 0
    // Score 1.0 is way below, should be flagged
    expect(result.content[0].text).toContain('readability');
  });

  it('passes check when within baseline', async () => {
    saveReportCard(reportsDir, makeReportCard('s1'));
    saveReportCard(reportsDir, makeReportCard('s2'));
    saveReportCard(reportsDir, makeReportCard('s3'));
    await invokeTool(baselineTools, 'update_baselines');

    // Session matching the baseline exactly
    saveReportCard(reportsDir, makeReportCard('s4'));

    const result = await invokeTool(baselineTools, 'check_against_baseline', {
      session_id: 's4',
    });
    expect(result.content[0].text).toContain('PASSED');
  });

  it('returns not found for missing baseline', async () => {
    const result = await invokeTool(baselineTools, 'get_baseline', {
      document_type: 'contract',
      jurisdiction: 'US',
    });
    expect(result.content[0].text).toContain('No baseline found');
  });

  it('shows quality trend', async () => {
    saveReportCard(reportsDir, makeReportCard('s1', { scores: { ...makeReportCard('s1').scores, overallImprovement: 1.0 } }));
    saveReportCard(reportsDir, makeReportCard('s2', { scores: { ...makeReportCard('s2').scores, overallImprovement: 1.5 } }));
    saveReportCard(reportsDir, makeReportCard('s3', { scores: { ...makeReportCard('s3').scores, overallImprovement: 2.0 } }));

    const result = await invokeTool(baselineTools, 'get_quality_trend', {
      document_type: 'privacy_policy',
      jurisdiction: 'EU',
    });
    expect(result.content[0].text).toContain('Quality Trend');
    expect(result.content[0].text).toContain('3'); // 3 sessions
  });
});

describe('Replay Testing Tools', () => {
  let session: SessionState;
  let replayTools: ReturnType<typeof createReplayTestingTools>;
  let baselineTools: ReturnType<typeof createBaselineTools>;
  let tmpDir: string;
  let reportsDir: string;
  let baselinesDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shem-replay-'));
    reportsDir = path.join(tmpDir, 'reports');
    baselinesDir = path.join(tmpDir, 'baselines');

    session = new SessionState('test-current', {
      gateResolver: new AutoApproveGateResolver(),
      reportsDir,
      baselinesDir,
    });
    replayTools = createReplayTestingTools(session);
    baselineTools = createBaselineTools(session);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('runs regression test on a single session', async () => {
    // Establish baseline
    saveReportCard(reportsDir, makeReportCard('s1'));
    saveReportCard(reportsDir, makeReportCard('s2'));
    saveReportCard(reportsDir, makeReportCard('s3'));
    await invokeTool(baselineTools, 'update_baselines');

    // Good session
    saveReportCard(reportsDir, makeReportCard('s4'));

    const result = await invokeTool(replayTools, 'run_regression_test', {
      session_id: 's4',
    });
    expect(result.content[0].text).toContain('PASSED');
  });

  it('runs batch regression across all sessions', async () => {
    saveReportCard(reportsDir, makeReportCard('s1'));
    saveReportCard(reportsDir, makeReportCard('s2'));
    saveReportCard(reportsDir, makeReportCard('s3'));
    await invokeTool(baselineTools, 'update_baselines');

    const result = await invokeTool(replayTools, 'run_batch_regression');
    expect(result.content[0].text).toContain('Batch Regression Report');
    expect(result.content[0].text).toContain('Sessions found**: 3');
  });

  it('compares two sessions side-by-side', async () => {
    saveReportCard(reportsDir, makeReportCard('s1', {
      scores: { ...makeReportCard('s1').scores, overallImprovement: 1.0 },
    }));
    saveReportCard(reportsDir, makeReportCard('s2', {
      scores: { ...makeReportCard('s2').scores, overallImprovement: 2.0 },
    }));

    const result = await invokeTool(replayTools, 'compare_sessions', {
      session_id_a: 's1',
      session_id_b: 's2',
    });
    expect(result.content[0].text).toContain('Session Comparison');
    expect(result.content[0].text).toContain('s1');
    expect(result.content[0].text).toContain('s2');
  });

  it('handles missing sessions gracefully', async () => {
    const result = await invokeTool(replayTools, 'compare_sessions', {
      session_id_a: 'nonexistent-a',
      session_id_b: 'nonexistent-b',
    });
    expect(result.content[0].text).toContain('not found');
  });
});
