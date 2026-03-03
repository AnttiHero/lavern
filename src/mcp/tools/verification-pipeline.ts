/**
 * Verification Pipeline MCP Tool — The 10-pass sequential verification system.
 *
 * Orchestrates 10 verification passes, records findings, emits real-time events,
 * and compiles the final Verification Report with verdict (PASS/CONDITIONAL_PASS/FAIL).
 *
 * Works in two modes:
 * - standalone: Verify any uploaded document (no before/after)
 * - post_production: Verify after Marble transforms a document (before/after available)
 *
 * Follows the bracketing pattern: start_verification_pipeline (before) →
 * agent runs passes → record_pass_result (after each) → compile_verification_report (end).
 */

import { z } from 'zod';
import { tool } from '@anthropic-ai/claude-agent-sdk';
import type { SessionState } from '../../session/session-state.js';
import { eventTimestamp } from '../../events/event-bus.js';
import {
  VERIFICATION_PASS_NAMES,
  VerificationPassName,
  FindingSeverity,
  VerificationFindingSchema,
  PASS_LABELS,
  PASS_DESCRIPTIONS,
  PASS_WEIGHTS,
  computeVerdict,
  computeOverallScore,
} from '../../types/verification.js';
import type {
  VerificationFinding,
  PassResult,
  VerificationReport,
  VerificationMode,
} from '../../types/verification.js';

export function createVerificationPipelineTools(session: SessionState) {

  // ── Tool 1: Start the pipeline ─────────────────────────────────────────

  const startVerificationPipeline = tool(
    'start_verification_pipeline',
    'Initialize the 10-pass verification pipeline. Must be called before recording any pass results. Sets mode (standalone or post_production) and emits the first pass_started event.',
    {
      mode: z.enum(['standalone', 'post_production']).describe('Verification mode'),
      document_name: z.string().describe('Name of the document being verified'),
    },
    async (args) => {
      const now = new Date().toISOString();

      // Initialize pipeline state on session
      session.verificationPipeline = {
        mode: args.mode as VerificationMode,
        passes: VERIFICATION_PASS_NAMES.map(name => ({
          pass: name,
          status: 'pending' as const,
          score: 0,
          findings: [],
          criticalCount: 0,
          majorCount: 0,
          minorCount: 0,
          durationMs: 0,
          timestamp: '',
        })),
        findings: [],
        findingCounter: 0,
        report: null,
        startedAt: now,
      };

      // Emit first pass started
      session.events.emitEvent({
        type: 'verification_pass_started',
        pass: VERIFICATION_PASS_NAMES[0],
        passIndex: 0,
        totalPasses: VERIFICATION_PASS_NAMES.length,
        timestamp: eventTimestamp(),
      });

      // Mark first pass as running
      session.verificationPipeline.passes[0].status = 'running';

      const passOverview = VERIFICATION_PASS_NAMES.map((name, i) =>
        `${i + 1}. **${PASS_LABELS[name]}** — ${PASS_DESCRIPTIONS[name]}`
      ).join('\n');

      return {
        content: [{
          type: 'text' as const,
          text: `## Verification Pipeline Started

**Document**: ${args.document_name}
**Mode**: ${args.mode}
**Passes**: ${VERIFICATION_PASS_NAMES.length}

${passOverview}

➡️ **Pass 1 (${PASS_LABELS[VERIFICATION_PASS_NAMES[0]]})** is now running. Use the appropriate tools/analysis for this pass, then call \`record_pass_result\` with your findings.`,
        }],
      };
    }
  );

  // ── Tool 2: Record a pass result ───────────────────────────────────────

  const recordPassResult = tool(
    'record_pass_result',
    'Record the result of a completed verification pass. Stores findings, updates pipeline state, and automatically advances to the next pass. Call this after completing each of the 10 verification passes.',
    {
      pass: VerificationPassName.describe('Which pass just completed'),
      score: z.number().min(0).max(1).describe('Pass score from 0.0 (worst) to 1.0 (best)'),
      findings: z.array(z.object({
        severity: FindingSeverity,
        location: z.string().describe('Where in the document (e.g., "Section 3.2", "Heading hierarchy")'),
        description: z.string().describe('What is wrong'),
        evidence: z.string().describe('Quoted text or specific evidence'),
        suggestion: z.string().optional().describe('How to fix it'),
        autoFixable: z.boolean().describe('Can the system fix this automatically?'),
        confidence: z.number().min(0).max(1).describe('Confidence in this finding'),
      })).describe('Findings from this pass'),
    },
    async (args) => {
      const pipeline = session.verificationPipeline;
      if (!pipeline) {
        return {
          content: [{ type: 'text' as const, text: '❌ Pipeline not started. Call start_verification_pipeline first.' }],
        };
      }

      const passIndex = VERIFICATION_PASS_NAMES.indexOf(args.pass as typeof VERIFICATION_PASS_NAMES[number]);
      if (passIndex === -1) {
        return {
          content: [{ type: 'text' as const, text: `❌ Unknown pass: ${args.pass}` }],
        };
      }

      const now = new Date().toISOString();

      // Create typed findings with IDs
      const typedFindings: VerificationFinding[] = args.findings.map(f => ({
        id: `VF-${String(++pipeline.findingCounter).padStart(3, '0')}`,
        pass: args.pass as typeof VERIFICATION_PASS_NAMES[number],
        severity: f.severity as VerificationFinding['severity'],
        location: f.location,
        description: f.description,
        evidence: f.evidence,
        suggestion: f.suggestion,
        autoFixable: f.autoFixable,
        confidence: f.confidence,
      }));

      // Record pass result
      const criticalCount = typedFindings.filter(f => f.severity === 'critical').length;
      const majorCount = typedFindings.filter(f => f.severity === 'major').length;
      const minorCount = typedFindings.filter(f => f.severity === 'minor').length;

      const passStartTime = pipeline.passes[passIndex].timestamp || pipeline.startedAt;
      const durationMs = new Date(now).getTime() - new Date(passStartTime).getTime();

      pipeline.passes[passIndex] = {
        pass: args.pass as typeof VERIFICATION_PASS_NAMES[number],
        status: 'complete',
        score: args.score,
        findings: typedFindings,
        criticalCount,
        majorCount,
        minorCount,
        durationMs: Math.max(0, durationMs),
        timestamp: now,
      };

      // Add to global findings list
      pipeline.findings.push(...typedFindings);

      // Emit finding events
      for (const finding of typedFindings) {
        session.events.emitEvent({
          type: 'verification_finding',
          findingId: finding.id,
          pass: finding.pass,
          severity: finding.severity,
          location: finding.location,
          description: finding.description,
          autoFixable: finding.autoFixable,
          timestamp: eventTimestamp(),
        });
      }

      // Emit pass completed
      session.events.emitEvent({
        type: 'verification_pass_completed',
        pass: args.pass,
        passIndex,
        score: args.score,
        criticalCount,
        majorCount,
        minorCount,
        timestamp: eventTimestamp(),
      });

      // Advance to next pass
      const nextIndex = passIndex + 1;
      let nextPassNote = '';

      if (nextIndex < VERIFICATION_PASS_NAMES.length) {
        const nextPass = VERIFICATION_PASS_NAMES[nextIndex];
        pipeline.passes[nextIndex].status = 'running';
        pipeline.passes[nextIndex].timestamp = now;

        session.events.emitEvent({
          type: 'verification_pass_started',
          pass: nextPass,
          passIndex: nextIndex,
          totalPasses: VERIFICATION_PASS_NAMES.length,
          timestamp: eventTimestamp(),
        });

        nextPassNote = `\n\n➡️ **Pass ${nextIndex + 1} (${PASS_LABELS[nextPass]})** is now running.`;
      } else {
        nextPassNote = '\n\n✅ All 10 passes complete. Call `compile_verification_report` to generate the final report.';
      }

      const severitySummary = [
        criticalCount > 0 ? `${criticalCount} critical` : null,
        majorCount > 0 ? `${majorCount} major` : null,
        minorCount > 0 ? `${minorCount} minor` : null,
      ].filter(Boolean).join(', ') || 'No findings';

      return {
        content: [{
          type: 'text' as const,
          text: `## Pass ${passIndex + 1} Complete: ${PASS_LABELS[args.pass as typeof VERIFICATION_PASS_NAMES[number]]}

**Score**: ${(args.score * 100).toFixed(0)}%
**Findings**: ${severitySummary}
${typedFindings.map(f => `- [${f.severity.toUpperCase()}] ${f.id}: ${f.description} (${f.location})`).join('\n')}${nextPassNote}`,
        }],
      };
    }
  );

  // ── Tool 3: Get pipeline status ────────────────────────────────────────

  const getVerificationStatus = tool(
    'get_verification_status',
    'Get the current status of the verification pipeline: which passes are complete, running, or pending.',
    {},
    async () => {
      const pipeline = session.verificationPipeline;
      if (!pipeline) {
        return {
          content: [{ type: 'text' as const, text: 'No verification pipeline active.' }],
        };
      }

      const completedCount = pipeline.passes.filter(p => p.status === 'complete').length;
      const currentPass = pipeline.passes.find(p => p.status === 'running');

      const lines = pipeline.passes.map((p, i) => {
        const icon = p.status === 'complete' ? '✅' : p.status === 'running' ? '🔄' : '⏳';
        const score = p.status === 'complete' ? ` (${(p.score * 100).toFixed(0)}%)` : '';
        const findings = p.status === 'complete'
          ? ` — ${p.criticalCount}C/${p.majorCount}M/${p.minorCount}m`
          : '';
        return `${icon} ${i + 1}. ${PASS_LABELS[p.pass]}${score}${findings}`;
      });

      return {
        content: [{
          type: 'text' as const,
          text: `## Verification Pipeline Status

**Mode**: ${pipeline.mode}
**Progress**: ${completedCount}/${VERIFICATION_PASS_NAMES.length} passes complete
${currentPass ? `**Current**: ${PASS_LABELS[currentPass.pass]}` : '**Status**: All passes complete'}

${lines.join('\n')}

**Total findings**: ${pipeline.findings.length} (${pipeline.findings.filter(f => f.severity === 'critical').length} critical, ${pipeline.findings.filter(f => f.severity === 'major').length} major, ${pipeline.findings.filter(f => f.severity === 'minor').length} minor)`,
        }],
      };
    },
    { annotations: { readOnly: true } }
  );

  // ── Tool 4: Compile final report ───────────────────────────────────────

  const compileVerificationReport = tool(
    'compile_verification_report',
    'Compile the final Verification Report from all 10 pass results. Calculates the weighted overall score, determines the verdict (PASS/CONDITIONAL_PASS/FAIL), and emits the report_compiled event.',
    {
      document_name: z.string().describe('Name of the verified document'),
    },
    async (args) => {
      const pipeline = session.verificationPipeline;
      if (!pipeline) {
        return {
          content: [{ type: 'text' as const, text: '❌ Pipeline not started.' }],
        };
      }

      const completedPasses = pipeline.passes.filter(p => p.status === 'complete');
      if (completedPasses.length < VERIFICATION_PASS_NAMES.length) {
        return {
          content: [{
            type: 'text' as const,
            text: `⚠️ Only ${completedPasses.length}/${VERIFICATION_PASS_NAMES.length} passes complete. Complete all passes before compiling the report.`,
          }],
        };
      }

      const overallScore = computeOverallScore(pipeline.passes);
      const totalCritical = pipeline.findings.filter(f => f.severity === 'critical').length;
      const totalMajor = pipeline.findings.filter(f => f.severity === 'major').length;
      const totalMinor = pipeline.findings.filter(f => f.severity === 'minor').length;
      const autoFixableCount = pipeline.findings.filter(f => f.autoFixable).length;
      const verdict = computeVerdict(totalCritical, totalMajor, overallScore);

      const now = new Date().toISOString();
      const durationMs = new Date(now).getTime() - new Date(pipeline.startedAt).getTime();

      const report: VerificationReport = {
        sessionId: session.id,
        documentName: args.document_name,
        mode: pipeline.mode,
        verdict,
        overallScore,
        passes: pipeline.passes,
        totalFindings: {
          critical: totalCritical,
          major: totalMajor,
          minor: totalMinor,
        },
        autoFixableCount,
        timestamp: now,
        durationMs,
      };

      pipeline.report = report;

      // Emit report compiled event
      session.events.emitEvent({
        type: 'verification_report_compiled',
        verdict,
        overallScore,
        totalFindings: totalCritical + totalMajor + totalMinor,
        timestamp: eventTimestamp(),
      });

      const verdictEmoji = verdict === 'PASS' ? '✅' : verdict === 'CONDITIONAL_PASS' ? '⚠️' : '❌';

      const passTable = pipeline.passes.map((p, i) => {
        const w = PASS_WEIGHTS[p.pass];
        return `| ${i + 1} | ${PASS_LABELS[p.pass]} | ${(p.score * 100).toFixed(0)}% | ${(w * 100).toFixed(0)}% | ${p.criticalCount}C/${p.majorCount}M/${p.minorCount}m |`;
      }).join('\n');

      const criticalFindings = pipeline.findings
        .filter(f => f.severity === 'critical')
        .map(f => `- **${f.id}** [${PASS_LABELS[f.pass]}] ${f.description} — _${f.location}_`)
        .join('\n');

      const majorFindings = pipeline.findings
        .filter(f => f.severity === 'major')
        .map(f => `- **${f.id}** [${PASS_LABELS[f.pass]}] ${f.description} — _${f.location}_`)
        .join('\n');

      return {
        content: [{
          type: 'text' as const,
          text: `## ${verdictEmoji} Verification Report: ${verdict}

**Document**: ${args.document_name}
**Mode**: ${pipeline.mode}
**Overall Score**: ${(overallScore * 100).toFixed(1)}%
**Duration**: ${(durationMs / 1000).toFixed(1)}s

### Pass Results

| # | Pass | Score | Weight | Findings |
|---|------|-------|--------|----------|
${passTable}

### Summary

- **Critical**: ${totalCritical}
- **Major**: ${totalMajor}
- **Minor**: ${totalMinor}
- **Auto-fixable**: ${autoFixableCount}

${totalCritical > 0 ? `### Critical Findings\n${criticalFindings}\n` : ''}${totalMajor > 0 ? `### Major Findings\n${majorFindings}` : ''}`,
        }],
      };
    }
  );

  return [
    startVerificationPipeline,
    recordPassResult,
    getVerificationStatus,
    compileVerificationReport,
  ];
}
