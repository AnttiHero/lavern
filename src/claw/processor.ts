/**
 * Document Processor — The per-document lifecycle engine.
 *
 * For each document that needs work, the processor:
 * 1. PARSE — Read and parse the document (PDF/DOCX/TXT/MD/RTF/HTML)
 * 2. INFER — Determine what work is needed (sidecar > LLM > heuristic)
 * 3. DISPATCH — Run the inferred workflow via the existing engine
 * 4. DELIVER — Write output bundle to the delivery directory
 * 5. UPDATE — Update registry with results and cost
 *
 * Reuses the entire existing pipeline: dispatch → router → agents →
 * debate → verify → assemble. The processor is just the Claw Mode
 * wrapper that connects the watcher/registry to the engine.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { dispatch } from '../dispatch.js';
import type { DispatchOptions } from '../dispatch.js';
import { parseDocument } from '../documents/parser.js';
import { AutoApproveGateResolver } from '../gates/gate-resolver.js';
import { inferTask } from './inference.js';
import { ClawDelivery } from './delivery.js';
import { DocumentRegistry } from './registry.js';
import { extractSessionFindings } from './types.js';
import type { ClawProfile, ClawJob, ClawConfig } from './types.js';

// ── MIME from extension ──────────────────────────────────────────────────

function mimeFromExt(ext: string): string {
  const map: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.doc': 'application/msword',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.rtf': 'text/rtf',
    '.html': 'text/html',
    '.htm': 'text/html',
  };
  return map[ext] ?? 'text/plain';
}

// ── Processor ────────────────────────────────────────────────────────────

export interface ProcessResult {
  sessionId: string;
  documentPath: string;
  documentHash: string;
  success: boolean;
  costUsd: number;
  durationMs: number;
  findings: { critical: number; major: number; minor: number };
  deliveryDir: string;
  error?: string;
}

export async function processDocument(
  documentPath: string,
  documentHash: string,
  profile: ClawProfile,
  registry: DocumentRegistry,
  clawConfig: ClawConfig,
  onProgress?: (message: string) => void,
): Promise<ProcessResult> {
  const startTime = Date.now();
  const sessionId = `shem-${Date.now()}`;
  const delivery = new ClawDelivery(clawConfig.dir);

  const log = (msg: string) => {
    if (onProgress) onProgress(msg);
    if (clawConfig.debug) console.log(`[CLAW:${sessionId}] ${msg}`);
  };

  try {
    // Mark as processing
    registry.updateStatus(documentHash, 'processing');

    // ── 1. PARSE ──────────────────────────────────────────────────────
    log(`Parsing: ${path.basename(documentPath)}`);
    const buffer = fs.readFileSync(documentPath);
    const ext = path.extname(documentPath).toLowerCase();
    const mime = mimeFromExt(ext);
    const parsed = await parseDocument(buffer, path.basename(documentPath), mime);

    // ── 2. INFER ──────────────────────────────────────────────────────
    log(`Inferring task...`);
    const inference = await inferTask(documentPath, parsed.fullText, profile);
    log(`→ ${inference.request.type} — ${inference.method} (${inference.reasoning.slice(0, 80)})`);

    // ── 3. DISPATCH ───────────────────────────────────────────────────
    log(`Dispatching: ${inference.workflow ?? 'auto-route'}`);

    const dispatchOptions: DispatchOptions = {
      yoloMode: true,
      gateResolver: new AutoApproveGateResolver(),
      maxBudgetUsd: clawConfig.perDocBudget,
      intensity: inference.intensity,
      forceWorkflow: inference.workflow,
    };

    if (clawConfig.dryRun) {
      log(`[DRY RUN] Would dispatch ${inference.request.type} for ${path.basename(documentPath)}`);
      return {
        sessionId,
        documentPath,
        documentHash,
        success: true,
        costUsd: 0,
        durationMs: Date.now() - startTime,
        findings: { critical: 0, major: 0, minor: 0 },
        deliveryDir: '',
      };
    }

    const session = await dispatch(inference.request, dispatchOptions);

    // ── 4. DELIVER ────────────────────────────────────────────────────
    log(`Delivering results...`);
    const deliveryDir = await delivery.deliver(
      sessionId,
      session,
      inference,
      documentPath,
      documentHash,
      clawConfig,
    );

    // ── 5. UPDATE ─────────────────────────────────────────────────────
    const cost = session.accumulatedCost;
    const findings = extractSessionFindings(session);

    registry.markReviewed(documentHash, sessionId, findings, cost);

    const durationMs = Date.now() - startTime;
    log(`✓ Delivered → ${path.relative(clawConfig.dir, deliveryDir)}/`);
    log(`  $${cost.toFixed(2)} · ${(durationMs / 1000).toFixed(0)}s · ${findings.critical} critical, ${findings.major} major, ${findings.minor} minor`);

    return {
      sessionId,
      documentPath,
      documentHash,
      success: true,
      costUsd: cost,
      durationMs,
      findings,
      deliveryDir,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    log(`✗ Failed: ${error}`);

    registry.markFailed(documentHash, error);

    // Save partial results to failed/
    try {
      delivery.saveFailed(sessionId, documentPath, error, clawConfig.dir);
    } catch { /* ignore delivery errors */ }

    return {
      sessionId,
      documentPath,
      documentHash,
      success: false,
      costUsd: 0,
      durationMs: Date.now() - startTime,
      findings: { critical: 0, major: 0, minor: 0 },
      deliveryDir: '',
      error,
    };
  }
}

