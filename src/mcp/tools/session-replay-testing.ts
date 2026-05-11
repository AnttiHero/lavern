/**
 * Session Replay Testing MCP Tool — Regression detection across sessions.
 *
 * v4: Compares sessions against baselines and each other.
 * Read-only tools for quality assurance.
 *
 * Factory: createReplayTestingTools(session) → 3 MCP tools:
 * 1. run_regression_test — Single session vs baseline
 * 2. run_batch_regression — All sessions vs baselines
 * 3. compare_sessions — Side-by-side diff
 */

import { z } from 'zod';
import { tool } from '@anthropic-ai/claude-agent-sdk';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SessionState } from '../../session/session-state.js';
import type { SessionReportCard } from '../../types/report-card.js';
import type { QualityBaseline, BaselineViolation } from '../../types/baselines.js';
import { readJsonFile } from '../../utils/fs-helpers.js';

function loadAllReportCards(reportsDir: string): SessionReportCard[] {
  if (!fs.existsSync(reportsDir)) return [];
  const files = fs.readdirSync(reportsDir).filter(f => f.endsWith('.json'));
  const cards: SessionReportCard[] = [];
  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(reportsDir, file), 'utf-8'));
      if (data.sessionId && data.scores) cards.push(data);
    } catch { /* skip */ }
  }
  return cards.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

function baselineKey(documentType: string, jurisdiction: string): string {
  return `${documentType}_${jurisdiction}`.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function checkViolations(card: SessionReportCard, baseline: QualityBaseline): BaselineViolation[] {
  const violations: BaselineViolation[] = [];

  for (const expected of baseline.expectedScores) {
    const actual = card.scores.after.find(d => d.dimension === expected.dimension);
    if (!actual) continue;

    const lowerBound = expected.mean - 2 * expected.stdDev;
    const upperBound = expected.mean + 2 * expected.stdDev;
    const sigma = expected.stdDev > 0
      ? (actual.score - expected.mean) / expected.stdDev
      : 0;

    if (actual.score < lowerBound) {
      violations.push({
        sessionId: card.sessionId,
        timestamp: card.timestamp,
        dimension: expected.dimension,
        metric: 'after_score',
        expected: { min: Math.round(lowerBound * 100) / 100, max: Math.round(upperBound * 100) / 100 },
        actual: actual.score,
        deviationSigma: Math.round(sigma * 100) / 100,
        severity: actual.score < expected.mean - 3 * expected.stdDev ? 'regression' : 'warning',
      });
    }
  }

  if (card.verification.overallPassRate < baseline.expectedVerificationPassRate * 0.7) {
    violations.push({
      sessionId: card.sessionId,
      timestamp: card.timestamp,
      dimension: 'verification',
      metric: 'pass_rate',
      expected: { min: baseline.expectedVerificationPassRate * 0.7, max: 1.0 },
      actual: card.verification.overallPassRate,
      deviationSigma: 0,
      severity: card.verification.overallPassRate < baseline.expectedVerificationPassRate * 0.5 ? 'regression' : 'warning',
    });
  }

  return violations;
}

// ── Factory ──────────────────────────────────────────────────────────────

export function createReplayTestingTools(session: SessionState) {

  const runRegressionTest = tool(
    'run_regression_test',
    'Load a previous report card and compare against current baselines. Returns violations.',
    {
      session_id: z.string().describe('Session ID to test'),
    },
    async (args) => {
      const cardPath = path.join(session.reportsDir, `${args.session_id}.json`);
      const card = readJsonFile<SessionReportCard | null>(cardPath, null);

      if (!card) {
        return {
          content: [{
            type: 'text' as const,
            text: `No report card found for session ${args.session_id}.`,
          }],
        };
      }

      const key = baselineKey(card.documentType, card.jurisdiction);
      const baselinePath = path.join(session.baselinesDir, `${key}.json`);
      const baseline = readJsonFile<QualityBaseline | null>(baselinePath, null);

      if (!baseline) {
        return {
          content: [{
            type: 'text' as const,
            text: `No baseline for ${card.documentType} (${card.jurisdiction}). Cannot run regression test.`,
          }],
        };
      }

      const violations = checkViolations(card, baseline);

      if (violations.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: `## Regression Test: PASSED ✓

Session ${args.session_id} meets baseline expectations for ${card.documentType} (${card.jurisdiction}).`,
          }],
        };
      }

      return {
        content: [{
          type: 'text' as const,
          text: `## Regression Test: ${violations.some(v => v.severity === 'regression') ? 'FAILED ✗' : 'WARNINGS ⚠️'}

Session: ${args.session_id} | Type: ${card.documentType} (${card.jurisdiction})

### Violations (${violations.length})
${violations.map(v =>
  `- [${v.severity.toUpperCase()}] **${v.dimension}** (${v.metric}): expected ${v.expected.min.toFixed(2)}–${v.expected.max.toFixed(2)}, got ${v.actual.toFixed(2)}`
).join('\n')}`,
        }],
      };
    },
    { annotations: { readOnly: true } }
  );

  const runBatchRegression = tool(
    'run_batch_regression',
    'Check all saved report cards against their baselines. Returns trend data and any violations found.',
    {},
    async () => {
      const cards = loadAllReportCards(session.reportsDir);

      if (cards.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: 'No report cards found. Nothing to test.',
          }],
        };
      }

      let totalViolations = 0;
      let sessionsChecked = 0;
      let sessionsWithViolations = 0;
      const results: string[] = [];

      for (const card of cards) {
        const key = baselineKey(card.documentType, card.jurisdiction);
        const baselinePath = path.join(session.baselinesDir, `${key}.json`);
        const baseline = readJsonFile<QualityBaseline | null>(baselinePath, null);

        if (!baseline) {
          results.push(`${card.sessionId}: no baseline (${card.documentType}, ${card.jurisdiction})`);
          continue;
        }

        sessionsChecked++;
        const violations = checkViolations(card, baseline);

        if (violations.length > 0) {
          sessionsWithViolations++;
          totalViolations += violations.length;
          const regressions = violations.filter(v => v.severity === 'regression').length;
          const warnings = violations.filter(v => v.severity === 'warning').length;
          results.push(`${card.sessionId}: ${regressions} regressions, ${warnings} warnings`);
        } else {
          results.push(`${card.sessionId}: ✓ passed`);
        }
      }

      return {
        content: [{
          type: 'text' as const,
          text: `## Batch Regression Report

**Sessions found**: ${cards.length}
**Sessions checked** (with baselines): ${sessionsChecked}
**Sessions with violations**: ${sessionsWithViolations}
**Total violations**: ${totalViolations}

### Results
${results.map(r => `- ${r}`).join('\n')}`,
        }],
      };
    },
    { annotations: { readOnly: true } }
  );

  const compareSessions = tool(
    'compare_sessions',
    'Side-by-side comparison of two session report cards.',
    {
      session_id_a: z.string().describe('First session ID'),
      session_id_b: z.string().describe('Second session ID'),
    },
    async (args) => {
      const cardA = readJsonFile<SessionReportCard | null>(
        path.join(session.reportsDir, `${args.session_id_a}.json`), null,
      );
      const cardB = readJsonFile<SessionReportCard | null>(
        path.join(session.reportsDir, `${args.session_id_b}.json`), null,
      );

      if (!cardA || !cardB) {
        const missing = [];
        if (!cardA) missing.push(args.session_id_a);
        if (!cardB) missing.push(args.session_id_b);
        return {
          content: [{
            type: 'text' as const,
            text: `Report card(s) not found: ${missing.join(', ')}`,
          }],
        };
      }

      // Collect all dimensions from both sessions
      const allDimensions = new Set([
        ...cardA.scores.deltas.map(d => d.dimension),
        ...cardB.scores.deltas.map(d => d.dimension),
      ]);

      const dimensionRows = [...allDimensions].map(dim => {
        const a = cardA.scores.deltas.find(d => d.dimension === dim);
        const b = cardB.scores.deltas.find(d => d.dimension === dim);
        return `| ${dim} | ${a ? a.after.toFixed(1) : 'N/A'} (Δ${a ? (a.delta >= 0 ? '+' : '') + a.delta.toFixed(1) : 'N/A'}) | ${b ? b.after.toFixed(1) : 'N/A'} (Δ${b ? (b.delta >= 0 ? '+' : '') + b.delta.toFixed(1) : 'N/A'}) |`;
      });

      return {
        content: [{
          type: 'text' as const,
          text: `## Session Comparison

| Metric | ${args.session_id_a} | ${args.session_id_b} |
|--------|${'-'.repeat(args.session_id_a.length + 2)}|${'-'.repeat(args.session_id_b.length + 2)}|
| Type | ${cardA.documentType} | ${cardB.documentType} |
| Jurisdiction | ${cardA.jurisdiction} | ${cardB.jurisdiction} |
| Overall Improvement | ${cardA.scores.overallImprovement >= 0 ? '+' : ''}${cardA.scores.overallImprovement.toFixed(2)} | ${cardB.scores.overallImprovement >= 0 ? '+' : ''}${cardB.scores.overallImprovement.toFixed(2)} |
| Verification Pass Rate | ${(cardA.verification.overallPassRate * 100).toFixed(0)}% | ${(cardB.verification.overallPassRate * 100).toFixed(0)}% |
| Total Findings | ${cardA.debate.totalFindings} | ${cardB.debate.totalFindings} |
| Resolution Rate | ${(cardA.debate.resolutionRate * 100).toFixed(0)}% | ${(cardB.debate.resolutionRate * 100).toFixed(0)}% |
| Cost | $${cardA.cost.totalUsd} | $${cardB.cost.totalUsd} |
| Duration | ${Math.round(cardA.durationMs / 1000)}s | ${Math.round(cardB.durationMs / 1000)}s |

### Dimension Scores
| Dimension | ${args.session_id_a} | ${args.session_id_b} |
|-----------|${'-'.repeat(args.session_id_a.length + 2)}|${'-'.repeat(args.session_id_b.length + 2)}|
${dimensionRows.join('\n')}`,
        }],
      };
    },
    { annotations: { readOnly: true } }
  );

  return [
    runRegressionTest,
    runBatchRegression,
    compareSessions,
  ];
}
