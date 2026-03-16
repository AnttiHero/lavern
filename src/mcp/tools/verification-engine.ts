/**
 * Verification Engine MCP Tool — Boris's #1 insight:
 * "Give Claude a way to verify its work. It will 2-3x quality."
 *
 * v3: Refactored to factory pattern — state lives in SessionState.
 * Events emitted on verification runs for visualization.
 *
 * Three verification types:
 * 1. Self-verification: Agent re-checks its own output against criteria
 * 2. Cross-verification: One agent's output checked against another's findings
 * 3. Score-verification: Re-score transformed document and compare before/after
 */

import { z } from 'zod';
import { tool } from '@anthropic-ai/claude-agent-sdk';
import type { SessionState } from '../../session/session-state.js';
import { boundedPush } from '../../session/session-state.js';
import { eventTimestamp } from '../../events/event-bus.js';

/**
 * Recompute and store the verification summary on the session.
 * Called after every verification run so the summary is always current.
 */
function updateVerificationSummary(session: SessionState): void {
  const results = session.verificationResults;
  const passed = results.filter(v => v.passed).length;
  const failed = results.filter(v => !v.passed).length;
  const avgConfidence = results.length > 0
    ? results.reduce((sum, v) => sum + v.confidence, 0) / results.length
    : 0;

  // Collect key issues from failed checks (up to 10)
  const keyIssues: string[] = [];
  for (const v of results) {
    if (!v.passed) {
      for (const finding of v.findings) {
        if (keyIssues.length < 10) keyIssues.push(finding);
      }
    }
  }

  session.verificationSummary = {
    totalChecks: results.length,
    passed,
    failed,
    averageConfidence: Math.round(avgConfidence * 100) / 100,
    keyIssues,
  };
}

export function createVerificationTools(session: SessionState) {
  const results = session.verificationResults;

  const runSelfVerification = tool(
    'run_self_verification',
    'Self-verification: Check output against a list of criteria. The agent verifies its own work against explicit success criteria before declaring done. Returns PASS/FAIL with details.',
    {
      verifier_role: z.string().describe('Which agent is verifying'),
      target_step: z.string().describe('Which workflow step is being verified'),
      output_summary: z.string().describe('Summary of the output being verified'),
      criteria: z.array(z.object({
        criterion: z.string().describe('What must be true'),
        met: z.boolean().describe('Whether this criterion is satisfied'),
        evidence: z.string().describe('Evidence for or against'),
      })).describe('List of criteria to verify against'),
    },
    async (args) => {
      const metCount = args.criteria.filter(c => c.met).length;
      const totalCount = args.criteria.length;
      const confidence = totalCount > 0 ? metCount / totalCount : 0;
      const passed = confidence >= 0.8;

      const failedCriteria = args.criteria
        .filter(c => !c.met)
        .map(c => `  \u2717 ${c.criterion}: ${c.evidence}`);
      const passedCriteria = args.criteria
        .filter(c => c.met)
        .map(c => `  \u2713 ${c.criterion}`);

      const result = {
        id: `V-${String(++session.verificationCounter).padStart(3, '0')}`,
        verificationType: 'self' as const,
        verifierRole: args.verifier_role,
        targetStep: args.target_step,
        passed,
        confidence,
        findings: failedCriteria,
        timestamp: new Date().toISOString(),
      };
      boundedPush(results, result);
      updateVerificationSummary(session);

      session.events.emitEvent({
        type: 'verification_run',
        verificationId: result.id,
        verificationType: 'self',
        passed,
        confidence,
        timestamp: eventTimestamp(),
      });

      return {
        content: [{
          type: 'text' as const,
          text: `## Self-Verification ${result.id}: ${passed ? 'PASSED \u2713' : 'FAILED \u2717'}

**Step**: ${args.target_step} | **Confidence**: ${(confidence * 100).toFixed(0)}% (${metCount}/${totalCount} criteria met)

### Passed
${passedCriteria.join('\n') || '(none)'}

### Failed
${failedCriteria.join('\n') || '(none)'}

${!passed ? '\u26a0\ufe0f Verification failed. Agent should address failed criteria before proceeding.' : '\u2705 Output meets quality criteria.'}`,
        }],
      };
    }
  );

  const runCrossVerification = tool(
    'run_cross_verification',
    'Cross-verification: Check whether transformation actually addressed the findings from analysis.',
    {
      verifier_role: z.string().describe('Which agent is verifying'),
      target_step: z.string().describe('Which step produced the output being verified'),
      original_findings: z.array(z.object({
        finding_id: z.string(),
        content: z.string(),
        severity: z.enum(['RED', 'YELLOW', 'GREEN']),
      })).describe('Findings that should have been addressed'),
      addressed_findings: z.array(z.object({
        finding_id: z.string(),
        how_addressed: z.string(),
        fully_resolved: z.boolean(),
      })).describe('How each finding was addressed in the output'),
    },
    async (args) => {
      const totalFindings = args.original_findings.length;
      const addressedCount = args.addressed_findings.filter(a => a.fully_resolved).length;
      const partialCount = args.addressed_findings.filter(a => !a.fully_resolved).length;
      const unaddressed = args.original_findings.filter(
        f => !args.addressed_findings.find(a => a.finding_id === f.finding_id)
      );

      const confidence = totalFindings > 0 ? addressedCount / totalFindings : 1;
      const passed = unaddressed.filter(u => u.severity === 'RED').length === 0 && confidence >= 0.7;

      const result = {
        id: `V-${String(++session.verificationCounter).padStart(3, '0')}`,
        verificationType: 'cross' as const,
        verifierRole: args.verifier_role,
        targetStep: args.target_step,
        passed,
        confidence,
        findings: unaddressed.map(u => `Unaddressed [${u.severity}]: ${u.content}`),
        timestamp: new Date().toISOString(),
      };
      boundedPush(results, result);
      updateVerificationSummary(session);

      session.events.emitEvent({
        type: 'verification_run',
        verificationId: result.id,
        verificationType: 'cross',
        passed,
        confidence,
        timestamp: eventTimestamp(),
      });

      return {
        content: [{
          type: 'text' as const,
          text: `## Cross-Verification ${result.id}: ${passed ? 'PASSED \u2713' : 'FAILED \u2717'}

**Step**: ${args.target_step} | **Confidence**: ${(confidence * 100).toFixed(0)}%

**Findings**: ${totalFindings} total \u2192 ${addressedCount} resolved, ${partialCount} partial, ${unaddressed.length} unaddressed

${unaddressed.length > 0 ? `### Unaddressed Findings\n${unaddressed.map(u => `- [${u.severity}] ${u.finding_id}: ${u.content}`).join('\n')}` : ''}

${args.addressed_findings.filter(a => !a.fully_resolved).length > 0 ? `### Partially Addressed\n${args.addressed_findings.filter(a => !a.fully_resolved).map(a => `- ${a.finding_id}: ${a.how_addressed}`).join('\n')}` : ''}

${!passed ? '\u26a0\ufe0f Cross-verification failed. Critical findings remain unaddressed.' : '\u2705 All critical findings have been addressed.'}`,
        }],
      };
    }
  );

  const runScoreVerification = tool(
    'run_score_verification',
    'Score-verification: Compare dimension scores before and after transformation. Flags regressions.',
    {
      verifier_role: z.string().describe('Which agent is verifying'),
      before_scores: z.array(z.object({
        dimension: z.string(),
        score: z.number(),
        classification: z.enum(['RED', 'YELLOW', 'GREEN']),
      })).describe('Scores before transformation'),
      after_scores: z.array(z.object({
        dimension: z.string(),
        score: z.number(),
        classification: z.enum(['RED', 'YELLOW', 'GREEN']),
      })).describe('Scores after transformation'),
    },
    async (args) => {
      const comparisons = args.before_scores.map(before => {
        const after = args.after_scores.find(a => a.dimension === before.dimension);
        if (!after) return { dimension: before.dimension, before: before.score, after: 0, delta: -before.score, regressed: true };
        return {
          dimension: before.dimension,
          before: before.score,
          after: after.score,
          delta: after.score - before.score,
          regressed: after.score < before.score,
        };
      });

      const regressions = comparisons.filter(c => c.regressed);
      const improvements = comparisons.filter(c => c.delta > 0);
      const passed = regressions.length === 0;
      const avgImprovement = comparisons.reduce((sum, c) => sum + c.delta, 0) / comparisons.length;

      const result = {
        id: `V-${String(++session.verificationCounter).padStart(3, '0')}`,
        verificationType: 'score' as const,
        verifierRole: args.verifier_role,
        targetStep: 'transformation',
        passed,
        confidence: passed ? 1.0 : 0.5,
        findings: regressions.map(r => `REGRESSION: ${r.dimension} dropped from ${r.before} to ${r.after}`),
        timestamp: new Date().toISOString(),
      };
      boundedPush(results, result);
      updateVerificationSummary(session);

      session.events.emitEvent({
        type: 'verification_run',
        verificationId: result.id,
        verificationType: 'score',
        passed,
        confidence: result.confidence,
        timestamp: eventTimestamp(),
      });

      return {
        content: [{
          type: 'text' as const,
          text: `## Score Verification ${result.id}: ${passed ? 'PASSED \u2713' : 'REGRESSIONS DETECTED \u2717'}

| Dimension | Before | After | Change |
|-----------|--------|-------|--------|
${comparisons.map(c => `| ${c.dimension} | ${c.before.toFixed(1)} | ${c.after.toFixed(1)} | ${c.delta >= 0 ? '+' : ''}${c.delta.toFixed(1)} ${c.regressed ? '\u26a0\ufe0f' : '\u2713'} |`).join('\n')}

**Average change**: ${avgImprovement >= 0 ? '+' : ''}${avgImprovement.toFixed(2)}
**Improvements**: ${improvements.length} | **Regressions**: ${regressions.length}

${regressions.length > 0 ? `### \u26a0\ufe0f Regressions\n${regressions.map(r => `- **${r.dimension}**: dropped ${r.before.toFixed(1)} \u2192 ${r.after.toFixed(1)} (${r.delta.toFixed(1)})`).join('\n')}\n\nTransformation should be revised to address regressions.` : '\u2705 All dimensions improved or maintained.'}`,
        }],
      };
    }
  );

  const getVerificationSummary = tool(
    'get_verification_summary',
    'Get a summary of all verification results for the current session.',
    {},
    async () => {
      const passed = results.filter(v => v.passed).length;
      const failed = results.filter(v => !v.passed).length;
      const avgConfidence = results.length > 0
        ? results.reduce((sum, v) => sum + v.confidence, 0) / results.length
        : 0;

      return {
        content: [{
          type: 'text' as const,
          text: `## Verification Summary

**Total**: ${results.length} | **Passed**: ${passed} \u2713 | **Failed**: ${failed} \u2717
**Average Confidence**: ${(avgConfidence * 100).toFixed(0)}%

${results.map(v =>
  `- ${v.id} [${v.verificationType}] ${v.passed ? '\u2713' : '\u2717'} \u2014 ${v.targetStep} (${(v.confidence * 100).toFixed(0)}% confidence)${v.findings.length > 0 ? `\n  Issues: ${v.findings.slice(0, 3).join('; ')}` : ''}`
).join('\n')}`,
        }],
      };
    },
    { annotations: { readOnly: true } }
  );

  return [
    runSelfVerification,
    runCrossVerification,
    runScoreVerification,
    getVerificationSummary,
  ];
}
