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

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { dispatch } from '../dispatch.js';
import type { DispatchOptions } from '../dispatch.js';
import { parseDocument } from '../documents/parser.js';
import { AutoApproveGateResolver } from '../gates/gate-resolver.js';
import { inferTask } from './inference.js';
import { ClawDelivery } from './delivery.js';
import { DocumentRegistry } from './registry.js';
import { extractSessionFindings } from './types.js';
import { notify } from './notify.js';
import { config } from '../config.js';
import { analyzeLocally, extractLocalFindings } from './local-analysis.js';
import type { ClawProfile, ClawJob, ClawConfig } from './types.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('CLAW-PROCESSOR');

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
  confidential?: boolean,
): Promise<ProcessResult> {
  const startTime = Date.now();
  const sessionId = `shem-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const delivery = new ClawDelivery(clawConfig.dir);

  const log = (msg: string) => {
    if (onProgress) onProgress(msg);
    if (clawConfig.debug) logger.info(msg, { sessionId });
  };

  try {
    // Mark as processing
    registry.updateStatus(documentHash, 'processing');

    // ── 1. PARSE ──────────────────────────────────────────────────────
    log(`Parsing: ${path.basename(documentPath)}`);
    const buffer = await readFile(documentPath);
    const ext = path.extname(documentPath).toLowerCase();
    const mime = mimeFromExt(ext);
    const parsed = await parseDocument(buffer, path.basename(documentPath), mime);

    // ── 1b. CONFIDENTIALITY GATE ──────────────────────────────────────
    // If document matched a sensitivity pattern AND a local model is configured,
    // process entirely on-device. No data leaves the machine.
    if (confidential && config.claw.localModel) {
      const localModelName = config.claw.localAnalysisModel || config.claw.localModel;
      log(`🔒 Confidential — processing locally (${localModelName})`);

      try {
        const localResult = await analyzeLocally(parsed.fullText, path.basename(documentPath), profile);
        const localFindings = extractLocalFindings(localResult);
        const deliveryDir = await delivery.deliverLocal(
          sessionId, localResult, documentPath, documentHash, clawConfig,
        );

        registry.markReviewed(documentHash, sessionId, localFindings, 0, true); // $0 — local inference, confidential

        const durationMs = Date.now() - startTime;
        log(`🔒 Delivered (local) → ${path.relative(clawConfig.dir, deliveryDir)}/`);
        log(`  $0.00 · ${(durationMs / 1000).toFixed(0)}s · ${localFindings.critical} critical, ${localFindings.major} major, ${localFindings.minor} minor`);

        if (localFindings.critical > 0) {
          notify({
            type: 'document_flagged',
            title: `🔒 Critical findings (local): ${path.basename(documentPath)}`,
            message: `${localFindings.critical} critical, ${localFindings.major} major — analyzed on-device`,
            details: { documentPath, sessionId, findings: localFindings, confidential: true },
          });
        }

        return {
          sessionId, documentPath, documentHash,
          success: true, costUsd: 0, durationMs, findings: localFindings, deliveryDir,
        };
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        log(`🔒 Local analysis failed: ${error}`);
        // Don't fall through to frontier — confidential documents MUST NOT leave the machine
        registry.markFailed(documentHash, `Local analysis failed: ${error}`);
        notify({
          type: 'document_failed',
          title: `🔒 Local analysis failed: ${path.basename(documentPath)}`,
          message: `${error.slice(0, 200)} — document NOT sent to API (privileged)`,
          details: { documentPath, documentHash, sessionId, confidential: true },
        });
        return {
          sessionId, documentPath, documentHash,
          success: false, costUsd: 0, durationMs: Date.now() - startTime,
          findings: { critical: 0, major: 0, minor: 0 }, deliveryDir: '',
          error: `Local analysis failed (confidential document): ${error}`,
        };
      }
    }

    // ── 2. INFER ──────────────────────────────────────────────────────
    log(`Inferring task...`);
    const inference = await inferTask(documentPath, parsed.fullText, profile);
    log(`→ ${inference.request.type} — ${inference.method} (${inference.reasoning.slice(0, 80)})`);

    // ── 3. DISPATCH ───────────────────────────────────────────────────
    log(`Dispatching: ${inference.workflow ?? 'auto-route'}`);

    // yoloMode: Claw Mode is a fully autonomous retainer — no human is present
    // during batch processing. Gates are auto-approved via AutoApproveGateResolver.
    // Human review happens post-hoc via the dashboard or delivery bundles.
    const dispatchOptions: DispatchOptions = {
      yoloMode: true,
      gateResolver: new AutoApproveGateResolver(),
      maxBudgetUsd: clawConfig.perDocBudget,
      intensity: inference.intensity,
      forceWorkflow: inference.workflow,
      // Ethical mode: use EU provider even for non-confidential docs
      ...(clawConfig.ethicalMode ? { provider: 'mistral' as const } : {}),
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

    let session: Awaited<ReturnType<typeof dispatch>>;
    let retried = false;

    try {
      session = await dispatch(inference.request, dispatchOptions);
    } catch (dispatchErr) {
      const dispatchError = dispatchErr instanceof Error ? dispatchErr.message : String(dispatchErr);
      const isBudgetError = /budget|funds|exhausted/i.test(dispatchError);

      if (isBudgetError) {
        throw dispatchErr; // No retry for budget exhaustion — rethrow to outer catch
      }

      // Retry once for transient failures
      log(`⟳ Dispatch failed (${dispatchError}), retrying in 5s...`);
      retried = true;
      await new Promise(resolve => setTimeout(resolve, 5000));

      try {
        log(`⟳ Retry attempt for ${path.basename(documentPath)}...`);
        session = await dispatch(inference.request, dispatchOptions);
        log(`⟳ Retry succeeded`);
      } catch (retryErr) {
        log(`⟳ Retry also failed`);
        throw retryErr; // Let outer catch handle final failure
      }
    }

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

    // Notify on critical findings
    if (findings.critical > 0) {
      notify({
        type: 'document_flagged',
        title: `Critical findings: ${path.basename(documentPath)}`,
        message: `${findings.critical} critical, ${findings.major} major, ${findings.minor} minor`,
        details: { documentPath, sessionId, findings },
      });
    }

    const durationMs = Date.now() - startTime;
    log(`✓ Delivered → ${path.relative(clawConfig.dir, deliveryDir)}/`);
    log(`  $${cost.toFixed(2)} · ${(durationMs / 1000).toFixed(0)}s · ${findings.critical} critical, ${findings.major} major, ${findings.minor} minor`);
    if (retried) log(`  (succeeded on retry)`);

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

    notify({
      type: 'document_failed',
      title: `Failed: ${path.basename(documentPath)}`,
      message: error.slice(0, 200),
      details: { documentPath, documentHash, sessionId },
    });

    // Save partial results to failed/
    try {
      delivery.saveFailed(sessionId, documentPath, error, clawConfig.dir);
    } catch (deliveryErr) {
      logger.error('Failed to save failure record', { document: path.basename(documentPath), error: deliveryErr });
    }

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

