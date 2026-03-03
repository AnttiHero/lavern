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
import { DocumentRegistry } from './registry.js';
import type { ClawJob, ClawConfig, DocumentEntry } from './types.js';

// ── Estimated cost per document ──────────────────────────────────────────

/**
 * Rough cost estimate based on document size and intensity.
 * Used for budget planning before actual dispatch.
 */
function estimateCost(doc: DocumentEntry, intensity: string): number {
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

  for (const doc of actionable) {
    const estimated = estimateCost(doc, config.intensity);

    // Budget gate — per-document
    if (estimated > config.perDocBudget) {
      skipped.push({
        path: doc.path,
        reason: `Estimated cost $${estimated.toFixed(2)} exceeds per-doc budget $${config.perDocBudget.toFixed(2)}`,
      });
      continue;
    }

    // Budget gate — total
    if (estimatedTotal + estimated > registry.budgetRemaining) {
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
    };

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

  const estimated = estimateCost(doc, config.intensity);

  if (estimated > config.perDocBudget) {
    return null; // Too expensive for per-doc budget
  }

  if (!registry.canAfford(estimated)) {
    return null; // Global budget exhausted
  }

  return {
    id: `shem-${Date.now()}`,
    documentPath,
    documentName: path.basename(documentPath),
    documentHash,
    trigger,
    status: 'queued',
  };
}
