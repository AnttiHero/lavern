/**
 * Delivery — Write the output bundle.
 *
 * After dispatch completes, the delivery module writes:
 * - manifest.json — Structured metadata about the session
 * - deliverable.md — The assembled document (markdown)
 * - deliverable.docx — Word format (if configured)
 * - deliverable.html — HTML format (if configured)
 * - findings.json — Extracted findings for programmatic use
 * - summary.txt — Plain-text one-paragraph summary
 *
 * Output goes to: ~/.marble/delivery/{session-id}/
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { ensureDir, writeJsonFileAtomic } from '../utils/fs-helpers.js';
import { convertToDocx, convertToHtml } from '../assembly/format-converter.js';
import type { SessionState } from '../session/session-state.js';
import { extractSessionFindings } from './types.js';
import type { ClawManifest, ClawConfig } from './types.js';
import type { InferenceResult } from './inference.js';

// ── Delivery ─────────────────────────────────────────────────────────────

export class ClawDelivery {
  private baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
  }

  /**
   * Write the complete output bundle for a finished session.
   * Returns the delivery directory path.
   */
  async deliver(
    sessionId: string,
    session: SessionState,
    inference: InferenceResult,
    documentPath: string,
    documentHash: string,
    config: ClawConfig,
  ): Promise<string> {
    const deliveryDir = path.join(this.baseDir, 'delivery', sessionId);
    ensureDir(deliveryDir);

    // Get the assembled document (clean deliverable) or fall back to final output
    const markdown = session.assembledDocument ?? session.finalOutput ?? '';
    const title = path.basename(documentPath, path.extname(documentPath));

    // ── manifest.json ─────────────────────────────────────────────────
    const startedAt = session.workflow?.startedAt ?? new Date().toISOString();
    const completedAt = new Date().toISOString();
    const startMs = new Date(startedAt).getTime();
    const endMs = new Date(completedAt).getTime();
    const durationSeconds = Math.max(0, (endMs - startMs) / 1000);

    // Collect agent roles from subagent activities
    const agentsUsed = [...new Set(session.subagentActivities.map(a => a.agentRole))];

    const manifest: ClawManifest = {
      sessionId,
      version: '1.0.0',
      input: {
        filename: path.basename(documentPath),
        path: documentPath,
        extension: path.extname(documentPath),
        sizeBytes: fs.statSync(documentPath).size,
        detectedType: inference.request.type,
        sidecarUsed: inference.method === 'sidecar',
      },
      task: {
        requestText: inference.request.requestText ?? '',
        workflow: inference.workflow ?? session.workflowTemplateId ?? 'auto',
        intensity: inference.intensity,
        inferenceMethod: inference.method,
      },
      execution: {
        startedAt,
        completedAt,
        durationSeconds,
        model: 'claude-opus-4-6',
        totalCostUsd: session.accumulatedCost,
        budgetUsd: config.perDocBudget,
        agentsUsed,
      },
      analysis: this.extractAnalysis(session),
      outputs: {
        markdown: 'deliverable.md',
        findings: 'findings.json',
      },
      status: markdown ? 'completed' : 'partial',
    };

    // ── Write files ───────────────────────────────────────────────────

    // Manifest
    writeJsonFileAtomic(path.join(deliveryDir, 'manifest.json'), manifest);

    // Markdown deliverable
    if (markdown) {
      fs.writeFileSync(path.join(deliveryDir, 'deliverable.md'), markdown, 'utf-8');
    }

    // DOCX (if configured)
    if (config.formats.includes('docx') && markdown) {
      try {
        const docxBuffer = await convertToDocx(markdown, title, config.style as any);
        fs.writeFileSync(path.join(deliveryDir, 'deliverable.docx'), docxBuffer);
        manifest.outputs.docx = 'deliverable.docx';
      } catch (err) {
        console.warn(`[CLAW] DOCX conversion failed: ${err}`);
      }
    }

    // HTML (if configured)
    if (config.formats.includes('html') && markdown) {
      try {
        const html = convertToHtml(markdown, title, config.style as any);
        fs.writeFileSync(path.join(deliveryDir, 'deliverable.html'), html, 'utf-8');
        manifest.outputs.html = 'deliverable.html';
      } catch (err) {
        console.warn(`[CLAW] HTML conversion failed: ${err}`);
      }
    }

    // Findings JSON
    const findings = this.extractFindingsJson(session);
    writeJsonFileAtomic(path.join(deliveryDir, 'findings.json'), findings);

    // Summary text
    const summary = this.buildSummary(manifest, markdown);
    fs.writeFileSync(path.join(deliveryDir, 'summary.txt'), summary, 'utf-8');

    // Re-save manifest with updated output paths
    writeJsonFileAtomic(path.join(deliveryDir, 'manifest.json'), manifest);

    return deliveryDir;
  }

  /**
   * Save failed job details for debugging.
   */
  saveFailed(sessionId: string, documentPath: string, error: string, baseDir: string): void {
    const failedDir = path.join(baseDir, 'failed', sessionId);
    ensureDir(failedDir);

    writeJsonFileAtomic(path.join(failedDir, 'error.json'), {
      sessionId,
      documentPath,
      error,
      timestamp: new Date().toISOString(),
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  private extractAnalysis(session: any): ClawManifest['analysis'] {
    const findings = session.debate?.findings ?? [];
    const counts = extractSessionFindings(session);
    const resolutions = session.debate?.resolutions?.length ?? 0;

    return {
      findingsCount: findings.length,
      criticalCount: counts.critical,
      majorCount: counts.major,
      minorCount: counts.minor,
      resolutionCount: resolutions,
    };
  }

  private extractFindingsJson(session: any): object[] {
    const findings = session.debate?.findings ?? [];
    return findings.map((f: any) => ({
      id: f.id,
      agent: f.agent,
      category: f.category,
      severity: f.severity,
      confidence: f.confidence,
      content: f.content,
      evidence: f.evidence,
      timestamp: f.timestamp,
    }));
  }

  private buildSummary(manifest: ClawManifest, markdown: string): string {
    const lines = [
      `Session: ${manifest.sessionId}`,
      `Document: ${manifest.input.filename}`,
      `Type: ${manifest.input.detectedType}`,
      `Workflow: ${manifest.task.workflow}`,
      `Intensity: ${manifest.task.intensity}`,
      `Duration: ${manifest.execution.durationSeconds.toFixed(1)}s`,
      `Cost: $${manifest.execution.totalCostUsd.toFixed(2)}`,
      ``,
      `Findings: ${manifest.analysis.findingsCount} total`,
      `  Critical: ${manifest.analysis.criticalCount}`,
      `  Major: ${manifest.analysis.majorCount}`,
      `  Minor: ${manifest.analysis.minorCount}`,
      `  Resolutions: ${manifest.analysis.resolutionCount}`,
      ``,
      `Status: ${manifest.status}`,
    ];

    if (markdown) {
      // Add first 500 chars of deliverable as preview
      const preview = markdown.slice(0, 500).replace(/\n/g, '\n  ');
      lines.push(``, `Preview:`, `  ${preview}...`);
    }

    return lines.join('\n');
  }
}
