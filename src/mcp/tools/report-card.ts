/**
 * Report Card MCP Tool — Compiles structured session quality metrics.
 *
 * v4: The report card is the foundation of the learning loop.
 * Called after synthesis to capture everything that happened in a session.
 *
 * Factory: createReportCardTools(session) → 2 MCP tools:
 * 1. compile_report_card — Compile from session state, persist to disk
 * 2. get_report_card — Read a previous report card by session ID
 */

import { z } from 'zod';
import { tool } from '@anthropic-ai/claude-agent-sdk';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SessionState } from '../../session/session-state.js';
import { eventTimestamp } from '../../events/event-bus.js';
import type {
  SessionReportCard,
  DimensionDelta,
  AgentPerformanceSnapshot,
} from '../../types/report-card.js';
import type { Severity } from '../../types/index.js';
import { readJsonFile, ensureDir } from '../../utils/fs-helpers.js';

// ── Factory ──────────────────────────────────────────────────────────────

export function createReportCardTools(session: SessionState) {

  const compileReportCard = tool(
    'compile_report_card',
    'Compile a session report card capturing all quality metrics, verification results, debate outcomes, and agent performance. Call this after synthesis is complete, before running the feedback loop.',
    {
      document_type: z.string().describe('Type of document analyzed (e.g., "privacy_policy", "terms_of_service")'),
      jurisdiction: z.string().describe('Jurisdiction (e.g., "EU", "US-CA", "UK")'),
    },
    async (args) => {
      const now = new Date();
      const startedAt = new Date(session.workflow.startedAt);
      const durationMs = now.getTime() - startedAt.getTime();

      // ── Compute score deltas ──
      const deltas: DimensionDelta[] = session.beforeScores.map(before => {
        const after = session.afterScores.find(a => a.dimension === before.dimension);
        if (!after) {
          return {
            dimension: before.dimension,
            before: before.score,
            after: 0,
            delta: -before.score,
            regressed: true,
          };
        }
        return {
          dimension: before.dimension,
          before: before.score,
          after: after.score,
          delta: after.score - before.score,
          regressed: after.score < before.score,
        };
      });

      const overallImprovement = deltas.length > 0
        ? deltas.reduce((sum, d) => sum + d.delta, 0) / deltas.length
        : 0;

      // ── Compile verification results ──
      const selfResults = session.verificationResults.filter(v => v.verificationType === 'self');
      const crossResults = session.verificationResults.filter(v => v.verificationType === 'cross');
      const scoreResults = session.verificationResults.filter(v => v.verificationType === 'score');

      const selfPassed = selfResults.length > 0 ? selfResults.every(v => v.passed) : true;
      const selfConfidence = selfResults.length > 0
        ? selfResults.reduce((s, v) => s + v.confidence, 0) / selfResults.length
        : 0;

      const crossPassed = crossResults.length > 0 ? crossResults.every(v => v.passed) : true;
      const crossConfidence = crossResults.length > 0
        ? crossResults.reduce((s, v) => s + v.confidence, 0) / crossResults.length
        : 0;

      const scorePassed = scoreResults.length > 0 ? scoreResults.every(v => v.passed) : true;
      const scoreRegressionCount = scoreResults.reduce(
        (count, v) => count + v.findings.length, 0
      );

      const allResults = session.verificationResults;
      const overallPassRate = allResults.length > 0
        ? allResults.filter(v => v.passed).length / allResults.length
        : 0;
      const overallConfidence = allResults.length > 0
        ? allResults.reduce((s, v) => s + v.confidence, 0) / allResults.length
        : 0;

      // ── Compile debate metrics ──
      const findings = session.debate.findings;
      const findingsBySeverity: Record<Severity, number> = {
        RED: findings.filter(f => f.severity === 'RED').length,
        YELLOW: findings.filter(f => f.severity === 'YELLOW').length,
        GREEN: findings.filter(f => f.severity === 'GREEN').length,
      };

      const findingsByAgent: Record<string, number> = {};
      for (const f of findings) {
        findingsByAgent[f.agentRole] = (findingsByAgent[f.agentRole] || 0) + 1;
      }

      const resolutions = session.debate.resolutions;
      const resolutionRate = session.debate.challenges.length > 0
        ? resolutions.length / session.debate.challenges.length
        : 0;
      const averageResolutionConfidence = resolutions.length > 0
        ? resolutions.reduce((s, r) => s + r.confidence, 0) / resolutions.length
        : 0;

      // ── Compile agent performance ──
      const agentPerformance: AgentPerformanceSnapshot[] = [];
      const agentIds = new Set(findings.map(f => f.agentRole));
      for (const agentId of agentIds) {
        const agentFindings = findings.filter(f => f.agentRole === agentId);
        const challengesReceived = session.debate.challenges
          .filter(c => {
            const targetFinding = findings.find(f => f.id === c.targetFindingId);
            return targetFinding?.agentRole === agentId;
          }).length;
        const challengesSurvived = session.debate.responses
          .filter(r => {
            const challenge = session.debate.challenges.find(c => c.id === r.challengeId);
            if (!challenge) return false;
            const targetFinding = findings.find(f => f.id === challenge.targetFindingId);
            return targetFinding?.agentRole === agentId && r.accepted;
          }).length;
        const avgConfidence = agentFindings.length > 0
          ? agentFindings.reduce((s, f) => s + f.confidence, 0) / agentFindings.length
          : 0;

        agentPerformance.push({
          agentId,
          role: agentId,
          findingsCount: agentFindings.length,
          challengesReceived,
          challengesSurvived,
          averageConfidence: Math.round(avgConfidence * 100) / 100,
          durationMs: 0, // Would need agent timing data
        });
      }

      // ── Compile gate decisions ──
      const gates = session.gateDecisions.map(g => ({
        type: g.gateType,
        decision: g.decision,
        confidence: 0, // Gate decisions don't carry confidence; confidence lives in verification
      }));

      // ── Build the report card ──
      const reportCard: SessionReportCard = {
        sessionId: session.id,
        timestamp: now.toISOString(),
        documentType: args.document_type,
        jurisdiction: args.jurisdiction,

        scores: {
          before: [...session.beforeScores],
          after: [...session.afterScores],
          deltas,
          overallImprovement: Math.round(overallImprovement * 100) / 100,
        },

        verification: {
          selfVerification: { passed: selfPassed, confidence: Math.round(selfConfidence * 100) / 100 },
          crossVerification: { passed: crossPassed, confidence: Math.round(crossConfidence * 100) / 100 },
          scoreVerification: { passed: scorePassed, regressionCount: scoreRegressionCount },
          overallPassRate: Math.round(overallPassRate * 100) / 100,
          overallConfidence: Math.round(overallConfidence * 100) / 100,
        },

        debate: {
          totalFindings: findings.length,
          findingsBySeverity,
          findingsByAgent,
          totalChallenges: session.debate.challenges.length,
          totalResolutions: resolutions.length,
          resolutionRate: Math.round(resolutionRate * 100) / 100,
          averageResolutionConfidence: Math.round(averageResolutionConfidence * 100) / 100,
        },

        precedents: {
          queried: [...session.precedentsQueried],
          applied: [...session.precedentsApplied],
          saved: [...session.precedentsSaved],
        },

        agentPerformance,
        gates,

        cost: {
          totalUsd: Math.round(session.accumulatedCost * 10000) / 10000,
          budgetUsd: session.budgetUsd,
        },
        durationMs,
      };

      // ── Persist to disk ──
      session.reportCard = reportCard;
      ensureDir(session.reportsDir);
      const filePath = path.join(session.reportsDir, `${session.id}.json`);
      fs.writeFileSync(filePath, JSON.stringify(reportCard, null, 2), 'utf-8');

      // ── Emit event ──
      session.events.emitEvent({
        type: 'report_card_compiled',
        sessionId: session.id,
        overallImprovement: reportCard.scores.overallImprovement,
        timestamp: eventTimestamp(),
      });

      // ── Return summary ──
      const regressionWarning = deltas.filter(d => d.regressed).length > 0
        ? `\n⚠️ REGRESSIONS: ${deltas.filter(d => d.regressed).map(d => `${d.dimension} (${d.delta.toFixed(1)})`).join(', ')}`
        : '';

      return {
        content: [{
          type: 'text' as const,
          text: `## Session Report Card — ${session.id}

**Document**: ${args.document_type} (${args.jurisdiction})
**Duration**: ${Math.round(durationMs / 1000)}s | **Cost**: $${reportCard.cost.totalUsd}

### Scores
| Dimension | Before | After | Δ |
|-----------|--------|-------|---|
${deltas.map(d => `| ${d.dimension} | ${d.before.toFixed(1)} | ${d.after.toFixed(1)} | ${d.delta >= 0 ? '+' : ''}${d.delta.toFixed(1)} ${d.regressed ? '⚠️' : '✓'} |`).join('\n')}

**Overall Improvement**: ${overallImprovement >= 0 ? '+' : ''}${overallImprovement.toFixed(2)}${regressionWarning}

### Verification
- Self: ${selfPassed ? '✓' : '✗'} (${(selfConfidence * 100).toFixed(0)}%)
- Cross: ${crossPassed ? '✓' : '✗'} (${(crossConfidence * 100).toFixed(0)}%)
- Score: ${scorePassed ? '✓' : '✗'} (${scoreRegressionCount} regressions)
- **Overall Pass Rate**: ${(overallPassRate * 100).toFixed(0)}%

### Debate
- ${findings.length} findings (${findingsBySeverity.RED} RED, ${findingsBySeverity.YELLOW} YELLOW, ${findingsBySeverity.GREEN} GREEN)
- ${session.debate.challenges.length} challenges → ${resolutions.length} resolutions (${(resolutionRate * 100).toFixed(0)}%)

### Precedents
- Queried: ${session.precedentsQueried.length} | Applied: ${session.precedentsApplied.length} | Saved: ${session.precedentsSaved.length}

📋 Report card saved to ${filePath}`,
        }],
      };
    }
  );

  const getReportCard = tool(
    'get_report_card',
    'Retrieve a previously compiled session report card by session ID.',
    {
      session_id: z.string().describe('Session ID to retrieve the report card for'),
    },
    async (args) => {
      const filePath = path.join(session.reportsDir, `${args.session_id}.json`);
      const reportCard = readJsonFile<SessionReportCard | null>(filePath, null);

      if (!reportCard) {
        return {
          content: [{
            type: 'text' as const,
            text: `No report card found for session ${args.session_id}. The session may not have completed or compile_report_card was not called.`,
          }],
        };
      }

      const deltas = reportCard.scores.deltas;
      return {
        content: [{
          type: 'text' as const,
          text: `## Report Card — ${reportCard.sessionId}

**Document**: ${reportCard.documentType} (${reportCard.jurisdiction})
**Compiled**: ${reportCard.timestamp}
**Duration**: ${Math.round(reportCard.durationMs / 1000)}s | **Cost**: $${reportCard.cost.totalUsd}

### Scores (Overall Improvement: ${reportCard.scores.overallImprovement >= 0 ? '+' : ''}${reportCard.scores.overallImprovement.toFixed(2)})
${deltas.map(d => `- ${d.dimension}: ${d.before.toFixed(1)} → ${d.after.toFixed(1)} (${d.delta >= 0 ? '+' : ''}${d.delta.toFixed(1)})${d.regressed ? ' ⚠️' : ''}`).join('\n')}

### Verification (Pass Rate: ${(reportCard.verification.overallPassRate * 100).toFixed(0)}%)
- Self: ${reportCard.verification.selfVerification.passed ? '✓' : '✗'} | Cross: ${reportCard.verification.crossVerification.passed ? '✓' : '✗'} | Score: ${reportCard.verification.scoreVerification.passed ? '✓' : '✗'}

### Debate
- ${reportCard.debate.totalFindings} findings, ${reportCard.debate.totalChallenges} challenges, ${reportCard.debate.totalResolutions} resolutions
- Resolution rate: ${(reportCard.debate.resolutionRate * 100).toFixed(0)}%

### Precedents
- Queried: ${reportCard.precedents.queried.length} | Applied: ${reportCard.precedents.applied.length} | Saved: ${reportCard.precedents.saved.length}`,
        }],
      };
    },
    { annotations: { readOnly: true } }
  );

  return [compileReportCard, getReportCard];
}
