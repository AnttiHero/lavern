/**
 * Baselines MCP Tool — Quality expectations per document type.
 *
 * v4: Baselines are computed from report cards across sessions.
 * They establish statistical expectations (mean, stddev) that allow
 * the system to detect regressions and quality degradation.
 *
 * Factory: createBaselineTools(session) → 4 MCP tools:
 * 1. update_baselines — Recompute from all report cards
 * 2. check_against_baseline — Compare a session vs expected
 * 3. get_baseline — Read a baseline
 * 4. get_quality_trend — Quality over time
 */

import { z } from 'zod';
import { tool } from '@anthropic-ai/claude-agent-sdk';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SessionState } from '../../session/session-state.js';
import { eventTimestamp } from '../../events/event-bus.js';
import type { SessionReportCard } from '../../types/report-card.js';
import type {
  QualityBaseline,
  BaselineViolation,
  QualityTrend,
  QualityTrendPoint,
} from '../../types/baselines.js';
import { readJsonFile, ensureDir } from '../../utils/fs-helpers.js';

// ── Statistics helpers ───────────────────────────────────────────────────

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

// ── Load all report cards from disk ──────────────────────────────────────

function loadAllReportCards(reportsDir: string): SessionReportCard[] {
  if (!fs.existsSync(reportsDir)) return [];

  const files = fs.readdirSync(reportsDir).filter(f => f.endsWith('.json'));
  const cards: SessionReportCard[] = [];

  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(reportsDir, file), 'utf-8'));
      if (data.sessionId && data.scores) {
        cards.push(data as SessionReportCard);
      }
    } catch {
      // Skip corrupted files
    }
  }

  return cards.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

// ── Baseline key ─────────────────────────────────────────────────────────

function baselineKey(documentType: string, jurisdiction: string): string {
  return `${documentType}_${jurisdiction}`.replace(/[^a-zA-Z0-9_-]/g, '_');
}

// ── Factory ──────────────────────────────────────────────────────────────

export function createBaselineTools(session: SessionState) {

  const updateBaselines = tool(
    'update_baselines',
    'Recompute quality baselines from all session report cards. Groups by document type + jurisdiction. Requires minimum 3 sessions to establish a baseline.',
    {},
    async () => {
      const cards = loadAllReportCards(session.reportsDir);

      if (cards.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: 'No report cards found. Baselines will be established after at least 3 sessions.',
          }],
        };
      }

      // Group by documentType:jurisdiction
      const groups = new Map<string, SessionReportCard[]>();
      for (const card of cards) {
        const key = baselineKey(card.documentType, card.jurisdiction);
        const group = groups.get(key) || [];
        group.push(card);
        groups.set(key, group);
      }

      let baselinesCreated = 0;
      let baselinesUpdated = 0;
      const results: string[] = [];

      for (const [key, groupCards] of groups) {
        if (groupCards.length < 3) {
          results.push(`${key}: ${groupCards.length}/3 sessions (not enough for baseline)`);
          continue;
        }

        const docType = groupCards[0].documentType;
        const jurisdiction = groupCards[0].jurisdiction;

        // Compute score statistics per dimension
        const allDimensions = new Set<string>();
        for (const c of groupCards) {
          for (const d of c.scores.after) allDimensions.add(d.dimension);
        }

        const expectedScores = [...allDimensions].map(dim => {
          const scores = groupCards
            .map(c => c.scores.after.find(d => d.dimension === dim)?.score)
            .filter((s): s is number => s !== undefined);
          return {
            dimension: dim,
            mean: Math.round(mean(scores) * 100) / 100,
            stdDev: Math.round(stdDev(scores) * 100) / 100,
            min: scores.length > 0 ? Math.min(...scores) : 0,
            max: scores.length > 0 ? Math.max(...scores) : 0,
          };
        });

        const expectedImprovement = [...allDimensions].map(dim => {
          const deltas = groupCards
            .map(c => c.scores.deltas.find(d => d.dimension === dim)?.delta)
            .filter((d): d is number => d !== undefined);
          return {
            dimension: dim,
            meanDelta: Math.round(mean(deltas) * 100) / 100,
            minDelta: deltas.length > 0 ? Math.min(...deltas) : 0,
          };
        });

        const passRates = groupCards.map(c => c.verification.overallPassRate);
        const resRates = groupCards.map(c => c.debate.resolutionRate);
        const costs = groupCards.map(c => c.cost.totalUsd);
        const durations = groupCards.map(c => c.durationMs);

        const baseline: QualityBaseline = {
          documentType: docType,
          jurisdiction,
          sampleSize: groupCards.length,
          lastUpdated: new Date().toISOString(),
          expectedScores,
          expectedImprovement,
          expectedVerificationPassRate: Math.round(mean(passRates) * 100) / 100,
          expectedResolutionRate: Math.round(mean(resRates) * 100) / 100,
          expectedCostRange: {
            min: Math.round(Math.min(...costs) * 10000) / 10000,
            max: Math.round(Math.max(...costs) * 10000) / 10000,
            mean: Math.round(mean(costs) * 10000) / 10000,
          },
          expectedDurationRange: {
            minMs: Math.min(...durations),
            maxMs: Math.max(...durations),
            meanMs: Math.round(mean(durations)),
          },
        };

        ensureDir(session.baselinesDir);
        const filePath = path.join(session.baselinesDir, `${key}.json`);
        const existed = fs.existsSync(filePath);
        fs.writeFileSync(filePath, JSON.stringify(baseline, null, 2), 'utf-8');

        if (existed) baselinesUpdated++;
        else baselinesCreated++;

        results.push(`${key}: baseline ${existed ? 'updated' : 'created'} (${groupCards.length} sessions)`);
      }

      return {
        content: [{
          type: 'text' as const,
          text: `## Baselines Updated

**Total report cards**: ${cards.length}
**Groups**: ${groups.size}
**Baselines created**: ${baselinesCreated}
**Baselines updated**: ${baselinesUpdated}

${results.map(r => `- ${r}`).join('\n')}`,
        }],
      };
    }
  );

  const checkAgainstBaseline = tool(
    'check_against_baseline',
    'Compare a session report card against its quality baseline. Returns violations (warnings and regressions).',
    {
      session_id: z.string().optional().describe('Session ID to check (default: current session)'),
    },
    async (args) => {
      const sessionId = args.session_id || session.id;
      const cardPath = path.join(session.reportsDir, `${sessionId}.json`);
      const card = readJsonFile<SessionReportCard | null>(cardPath, null);

      if (!card) {
        return {
          content: [{
            type: 'text' as const,
            text: `No report card found for session ${sessionId}.`,
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
            text: `No baseline found for ${card.documentType} (${card.jurisdiction}). Need at least 3 sessions to establish a baseline.`,
          }],
        };
      }

      const violations: BaselineViolation[] = [];

      // Check after-scores against baseline
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
            sessionId,
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

      // Check verification pass rate
      if (card.verification.overallPassRate < baseline.expectedVerificationPassRate * 0.7) {
        violations.push({
          sessionId,
          timestamp: card.timestamp,
          dimension: 'verification',
          metric: 'pass_rate',
          expected: { min: baseline.expectedVerificationPassRate * 0.7, max: 1.0 },
          actual: card.verification.overallPassRate,
          deviationSigma: 0,
          severity: card.verification.overallPassRate < baseline.expectedVerificationPassRate * 0.5 ? 'regression' : 'warning',
        });
      }

      // Emit events for violations
      for (const v of violations) {
        if (v.severity === 'regression') {
          session.events.emitEvent({
            type: 'baseline_violation',
            sessionId,
            dimension: v.dimension,
            severity: v.severity,
            timestamp: eventTimestamp(),
          });
        }
      }

      if (violations.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: `## Baseline Check: PASSED ✓

Session ${sessionId} (${card.documentType}, ${card.jurisdiction}) is within expected quality ranges.
Baseline sample size: ${baseline.sampleSize} sessions.`,
          }],
        };
      }

      return {
        content: [{
          type: 'text' as const,
          text: `## Baseline Check: ${violations.some(v => v.severity === 'regression') ? 'REGRESSIONS DETECTED ✗' : 'WARNINGS ⚠️'}

Session: ${sessionId} | Baseline: ${baseline.sampleSize} sessions

### Violations (${violations.length})
${violations.map(v =>
  `- [${v.severity.toUpperCase()}] **${v.dimension}** (${v.metric}): expected ${v.expected.min.toFixed(2)}–${v.expected.max.toFixed(2)}, got ${v.actual.toFixed(2)} (${v.deviationSigma.toFixed(1)}σ)`
).join('\n')}`,
        }],
      };
    },
    { annotations: { readOnly: true } }
  );

  const getBaseline = tool(
    'get_baseline',
    'Retrieve quality baseline for a document type and jurisdiction.',
    {
      document_type: z.string().describe('Document type'),
      jurisdiction: z.string().describe('Jurisdiction'),
    },
    async (args) => {
      const key = baselineKey(args.document_type, args.jurisdiction);
      const filePath = path.join(session.baselinesDir, `${key}.json`);
      const baseline = readJsonFile<QualityBaseline | null>(filePath, null);

      if (!baseline) {
        return {
          content: [{
            type: 'text' as const,
            text: `No baseline found for ${args.document_type} (${args.jurisdiction}). Need at least 3 sessions.`,
          }],
        };
      }

      return {
        content: [{
          type: 'text' as const,
          text: `## Quality Baseline: ${args.document_type} (${args.jurisdiction})

**Sample Size**: ${baseline.sampleSize} sessions
**Last Updated**: ${baseline.lastUpdated}

### Expected Scores
${baseline.expectedScores.map(s =>
  `- **${s.dimension}**: ${s.mean.toFixed(2)} ± ${s.stdDev.toFixed(2)} (range: ${s.min.toFixed(1)}–${s.max.toFixed(1)})`
).join('\n')}

### Expected Improvement
${baseline.expectedImprovement.map(i =>
  `- **${i.dimension}**: Δ${i.meanDelta >= 0 ? '+' : ''}${i.meanDelta.toFixed(2)} (min: ${i.minDelta.toFixed(1)})`
).join('\n')}

### Quality Expectations
- Verification pass rate: ${(baseline.expectedVerificationPassRate * 100).toFixed(0)}%
- Resolution rate: ${(baseline.expectedResolutionRate * 100).toFixed(0)}%
- Cost range: $${baseline.expectedCostRange.min}–$${baseline.expectedCostRange.max} (avg $${baseline.expectedCostRange.mean})`,
        }],
      };
    },
    { annotations: { readOnly: true } }
  );

  const getQualityTrend = tool(
    'get_quality_trend',
    'Get quality metrics over time for a document type. Shows improvement trends and direction.',
    {
      document_type: z.string().describe('Document type'),
      jurisdiction: z.string().describe('Jurisdiction'),
    },
    async (args) => {
      const cards = loadAllReportCards(session.reportsDir)
        .filter(c => c.documentType === args.document_type && c.jurisdiction === args.jurisdiction);

      if (cards.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: `No sessions found for ${args.document_type} (${args.jurisdiction}).`,
          }],
        };
      }

      const points: QualityTrendPoint[] = cards.map(c => ({
        sessionId: c.sessionId,
        timestamp: c.timestamp,
        overallImprovement: c.scores.overallImprovement,
        verificationPassRate: c.verification.overallPassRate,
        costUsd: c.cost.totalUsd,
        durationMs: c.durationMs,
        dimensions: c.scores.deltas.map(d => ({
          dimension: d.dimension,
          afterScore: d.after,
          delta: d.delta,
        })),
      }));

      // Determine trend direction
      const improvements = points.map(p => p.overallImprovement);
      let direction: 'improving' | 'stable' | 'declining' = 'stable';
      if (improvements.length >= 3) {
        const firstHalf = mean(improvements.slice(0, Math.floor(improvements.length / 2)));
        const secondHalf = mean(improvements.slice(Math.floor(improvements.length / 2)));
        if (secondHalf > firstHalf + 0.1) direction = 'improving';
        else if (secondHalf < firstHalf - 0.1) direction = 'declining';
      }

      const trend: QualityTrend = {
        documentType: args.document_type,
        jurisdiction: args.jurisdiction,
        points,
        direction,
        averageImprovement: Math.round(mean(improvements) * 100) / 100,
      };

      return {
        content: [{
          type: 'text' as const,
          text: `## Quality Trend: ${args.document_type} (${args.jurisdiction})

**Sessions**: ${points.length} | **Direction**: ${trend.direction} ${trend.direction === 'improving' ? '📈' : trend.direction === 'declining' ? '📉' : '➡️'}
**Average Improvement**: ${trend.averageImprovement >= 0 ? '+' : ''}${trend.averageImprovement.toFixed(2)}

### Session History
${points.map((p, i) =>
  `${i + 1}. ${p.sessionId} — improvement: ${p.overallImprovement >= 0 ? '+' : ''}${p.overallImprovement.toFixed(2)}, verification: ${(p.verificationPassRate * 100).toFixed(0)}%, cost: $${p.costUsd}`
).join('\n')}`,
        }],
      };
    },
    { annotations: { readOnly: true } }
  );

  return [
    updateBaselines,
    checkAgainstBaseline,
    getBaseline,
    getQualityTrend,
  ];
}
