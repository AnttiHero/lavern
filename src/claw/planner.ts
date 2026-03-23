/**
 * Work Planner — The firm decides what needs doing.
 *
 * The planner examines the document registry and produces an
 * ordered list of jobs to execute. Prioritization considers:
 *
 * 1. Budget constraints — never exceed remaining budget
 * 2. Document priority — new > stale > queued
 * 3. Document size — smaller docs first (faster throughput)
 * 4. Per-document budget cap — skip documents too expensive
 *
 * Phase 2 will add proactive triggers:
 * - Periodic re-review (staleness threshold)
 * - Regulation change detection
 * - Institutional memory pattern matching
 */

import * as path from 'node:path';
import { config as globalConfig } from '../config.js';
import { DocumentRegistry } from './registry.js';
import { notify } from './notify.js';
import type { ClawJob, ClawConfig, CostForecast, DocumentEntry } from './types.js';

// ── Default Sensitivity Patterns ─────────────────────────────────────────

/**
 * Filenames matching these patterns are treated as confidential.
 * When a local model is configured, they are processed on-device.
 * When no local model is available, they are flagged for human review.
 */
export const DEFAULT_SENSITIVITY_PATTERNS = [
  '*confidential*',
  '*privileged*',
  '*merger*',
  '*acquisition*',
  '*litigation*',
  '*attorney*',
  '*counsel*',
];

/**
 * Simple glob match: supports * as wildcard. Case-insensitive.
 */
export function matchesSensitivityPattern(filename: string, patterns: string[]): string | null {
  const lower = filename.toLowerCase();
  for (const pattern of patterns) {
    const regex = new RegExp(
      '^' + pattern.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, (m) => m === '*' ? '.*' : `\\${m}`) + '$',
    );
    if (regex.test(lower)) return pattern;
  }
  return null;
}

// ── Estimated cost per document ──────────────────────────────────────────

/**
 * Rough cost estimate based on document size and intensity.
 * Used for budget planning before actual dispatch.
 */
export function estimateCost(doc: DocumentEntry, intensity: string): number {
  const sizeMultiplier = Math.min(doc.sizeBytes / (100 * 1024), 5); // 0–5 based on size
  const intensityMultiplier =
    intensity === 'quick' ? 0.5 :
    intensity === 'thorough' ? 2.0 :
    intensity === 'maximal' ? 4.0 :
    1.0; // standard

  // Base cost: ~$1 for a standard-intensity 50KB document
  return Math.max(0.10, sizeMultiplier * intensityMultiplier);
}

// ── Planner ──────────────────────────────────────────────────────────────

export interface PlanResult {
  jobs: ClawJob[];
  skipped: Array<{ path: string; reason: string }>;
  estimatedCostUsd: number;
  budgetAfterUsd: number;
}

/**
 * Plan the next batch of work.
 *
 * Examines all documents with actionable status (new, stale, queued)
 * and produces an ordered job list that fits within the budget.
 */
export function planWork(
  registry: DocumentRegistry,
  config: ClawConfig,
): PlanResult {
  const jobs: ClawJob[] = [];
  const skipped: Array<{ path: string; reason: string }> = [];
  let estimatedTotal = 0;

  // Gather all actionable documents
  const actionable = registry.getDocumentsByStatus('new', 'stale', 'queued');

  // Sort by priority: new first, then stale, then queued. Within each, smaller first.
  const priorityOrder: Record<string, number> = { new: 0, stale: 1, queued: 2 };
  actionable.sort((a, b) => {
    const pa = priorityOrder[a.status] ?? 3;
    const pb = priorityOrder[b.status] ?? 3;
    if (pa !== pb) return pa - pb;
    return a.sizeBytes - b.sizeBytes; // Smaller first
  });

  const patterns = config.profile.sensitivityPatterns ?? DEFAULT_SENSITIVITY_PATTERNS;

  for (const doc of actionable) {
    // ── Sensitivity check ──────────────────────────────────────────
    const matchedPattern = matchesSensitivityPattern(doc.name, patterns);
    // Ethical mode: treat ALL docs as confidential when local model available
    const isConfidential = config.ethicalMode
      ? !!globalConfig.claw.localModel   // ethical: all docs → local if model exists
      : !!matchedPattern;                 // normal: only sensitivity-matched docs

    if (isConfidential && !globalConfig.claw.localModel) {
      // No local model — flag for human review, don't process
      registry.updateStatus(doc.hash, 'flagged');
      skipped.push({
        path: doc.path,
        reason: `Matches sensitivity pattern "${matchedPattern}" — no local model configured`,
      });
      notify({
        type: 'document_flagged',
        title: `Sensitive document: ${doc.name}`,
        message: `Matched "${matchedPattern}" — requires human review (no local model)`,
        details: { path: doc.path, pattern: matchedPattern },
      });
      continue;
    }

    // Cost estimation: local = $0, hybrid = ~30% of frontier, frontier = full
    const processingMode = config.profile.processing ?? 'local';
    const estimated = isConfidential
      ? (processingMode === 'hybrid' ? estimateCost(doc, config.intensity) * 0.3 : 0)
      : estimateCost(doc, config.intensity);

    // Budget gate — per-document (skip for confidential/free)
    if (!isConfidential && estimated > config.perDocBudget) {
      skipped.push({
        path: doc.path,
        reason: `Estimated cost $${estimated.toFixed(2)} exceeds per-doc budget $${config.perDocBudget.toFixed(2)}`,
      });
      continue;
    }

    // Budget gate — total (skip for confidential/free)
    if (!isConfidential && estimatedTotal + estimated > registry.budgetRemaining) {
      skipped.push({
        path: doc.path,
        reason: `Would exceed remaining budget ($${registry.budgetRemaining.toFixed(2)} left)`,
      });
      continue;
    }

    // Create job
    const trigger =
      doc.status === 'new' ? 'new' as const :
      doc.status === 'stale' ? 'changed' as const :
      'manual' as const;

    const job: ClawJob = {
      id: `shem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      documentPath: doc.path,
      documentName: doc.name,
      documentHash: doc.hash,
      trigger,
      status: 'queued',
      confidential: isConfidential || undefined,
      processing: isConfidential ? (processingMode as 'local' | 'hybrid') : undefined,
      matchedPattern: matchedPattern ?? undefined,
    };

    if (isConfidential) {
      notify({
        type: 'document_confidential',
        title: `🔒 Processing locally: ${doc.name}`,
        message: `Matched "${matchedPattern}" — analyzing on-device`,
        details: { path: doc.path, pattern: matchedPattern },
      });
    }

    jobs.push(job);
    estimatedTotal += estimated;

    // Mark as queued in registry
    registry.updateStatus(doc.hash, 'queued');
  }

  return {
    jobs,
    skipped,
    estimatedCostUsd: estimatedTotal,
    budgetAfterUsd: registry.budgetRemaining - estimatedTotal,
  };
}

/**
 * Plan a single ad-hoc job for a specific document.
 * Used when the watcher detects a new/changed file.
 */
export function planSingleJob(
  documentPath: string,
  documentHash: string,
  trigger: 'new' | 'changed' | 'sidecar',
  registry: DocumentRegistry,
  config: ClawConfig,
): ClawJob | null {
  const doc = registry.getDocument(documentHash);
  if (!doc) return null;

  const filename = path.basename(documentPath);
  const patterns = config.profile.sensitivityPatterns ?? DEFAULT_SENSITIVITY_PATTERNS;
  const matchedPattern = matchesSensitivityPattern(filename, patterns);
  // Ethical mode: treat ALL docs as confidential when local model available
  const isConfidential = config.ethicalMode
    ? !!globalConfig.claw.localModel
    : !!matchedPattern;

  // Confidential document with no local model → flag, don't process
  if (isConfidential && !globalConfig.claw.localModel) {
    registry.updateStatus(documentHash, 'flagged');
    notify({
      type: 'document_flagged',
      title: `Sensitive document: ${filename}`,
      message: `Matched "${matchedPattern}" — requires human review (no local model)`,
    });
    return null;
  }

  // Confidential documents are free (local); regular need budget checks
  if (!isConfidential) {
    const estimated = estimateCost(doc, config.intensity);
    if (estimated > config.perDocBudget) return null;
    if (!registry.canAfford(estimated)) return null;
  }

  return {
    id: `shem-${Date.now()}`,
    documentPath,
    documentName: filename,
    documentHash,
    trigger,
    status: 'queued',
    confidential: isConfidential || undefined,
    matchedPattern: matchedPattern ?? undefined,
  };
}

/**
 * Read-only cost forecast for pending documents.
 * Same estimation logic as planWork but does NOT mutate registry state.
 * Safe to call from GET endpoints.
 */
export function forecastWork(
  registry: DocumentRegistry,
  intensity: string,
  perDocBudget: number,
  ethicalMode: boolean,
  sensitivityPatterns: string[],
  processingMode: 'local' | 'frontier' | 'hybrid' = 'local',
): CostForecast {
  const actionable = registry.getDocumentsByStatus('new', 'stale', 'queued');
  const patterns = sensitivityPatterns.length > 0 ? sensitivityPatterns : DEFAULT_SENSITIVITY_PATTERNS;

  let estimatedTotal = 0;
  let pendingCount = 0;
  let confidentialCount = 0;
  let skippedCount = 0;

  for (const doc of actionable) {
    const matchedPattern = matchesSensitivityPattern(doc.name, patterns);
    const isConfidential = ethicalMode
      ? !!globalConfig.claw.localModel
      : !!matchedPattern;

    if (isConfidential && !globalConfig.claw.localModel) {
      skippedCount++;
      continue;
    }

    const estimated = isConfidential
      ? (processingMode === 'hybrid' ? estimateCost(doc, intensity) * 0.3 : 0)
      : estimateCost(doc, intensity);

    if (!isConfidential && estimated > perDocBudget) {
      skippedCount++;
      continue;
    }

    if (!isConfidential && estimatedTotal + estimated > registry.budgetRemaining) {
      skippedCount++;
      continue;
    }

    pendingCount++;
    estimatedTotal += estimated;
    if (isConfidential) confidentialCount++;
  }

  return {
    pendingCount,
    estimatedCostUsd: parseFloat(estimatedTotal.toFixed(2)),
    budgetAfterUsd: parseFloat((registry.budgetRemaining - estimatedTotal).toFixed(2)),
    confidentialCount,
    skippedCount,
  };
}
