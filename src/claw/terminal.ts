/**
 * Terminal UI — The firm's reception desk.
 *
 * Rich terminal output for Claw Mode operations.
 * Clean, professional, monumental — like the lobby.
 */

import * as os from 'node:os';
import * as path from 'node:path';
import type { ClawProfile, ClawState } from './types.js';
import type { DocumentRegistry } from './registry.js';
import type { PlanResult } from './planner.js';
import type { ProcessResult } from './processor.js';

// ── ANSI Colors ──────────────────────────────────────────────────────────

const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const WHITE = '\x1b[37m';

// ── Banner ───────────────────────────────────────────────────────────────

export function printBanner(profile: ClawProfile): void {
  const line = '═'.repeat(58);
  console.log(`\n${DIM}╔${line}╗${RESET}`);
  console.log(`${DIM}║${RESET}  ${BOLD}LAVERN — CLAW MODE${RESET}${' '.repeat(38)}${DIM}║${RESET}`);
  console.log(`${DIM}║${RESET}  ${profile.company} · ${profile.jurisdiction} · On retainer${' '.repeat(Math.max(0, 36 - profile.company.length - profile.jurisdiction.length))}${DIM}║${RESET}`);
  console.log(`${DIM}╚${line}╝${RESET}\n`);
}

// ── Watch Status ─────────────────────────────────────────────────────────

export function printWatchStatus(
  profile: ClawProfile,
  registry: DocumentRegistry,
): void {
  const state = registry.getState();
  const summary = registry.summary;

  for (const wp of profile.watchPaths) {
    const count = Object.values(state.documents).filter(d => d.path.startsWith(wp.replace(/^~/, os.homedir()))).length;
    console.log(`${DIM}Watching:${RESET} ${wp} ${DIM}(${count} docs)${RESET}`);
  }

  const remaining = registry.budgetRemaining;
  const total = state.budget.totalUsd;
  const budgetColor = remaining > total * 0.5 ? GREEN : remaining > total * 0.2 ? YELLOW : RED;

  console.log(`${DIM}Budget:${RESET} ${budgetColor}$${remaining.toFixed(2)}${RESET} / $${total.toFixed(2)}  ${DIM}|${RESET}  Reviewed: ${summary.reviewed}  ${DIM}|${RESET}  Flagged: ${summary.flagged}\n`);
  console.log(`${DIM}── Ctrl+C to pause ──${RESET}\n`);
}

// ── Plan Summary ─────────────────────────────────────────────────────────

export function printPlan(plan: PlanResult): void {
  if (plan.jobs.length === 0 && plan.skipped.length === 0) {
    console.log(`${DIM}No actionable documents found. Watching for changes...${RESET}\n`);
    return;
  }

  if (plan.jobs.length > 0) {
    console.log(`${BOLD}Queued: ${plan.jobs.length} document${plan.jobs.length > 1 ? 's' : ''}${RESET} (est. $${plan.estimatedCostUsd.toFixed(2)})`);
    for (const job of plan.jobs) {
      const trigger = job.trigger === 'new' ? `${GREEN}new${RESET}` :
                     job.trigger === 'changed' ? `${YELLOW}changed${RESET}` :
                     `${CYAN}${job.trigger}${RESET}`;
      console.log(`  ${trigger} ${job.documentName}`);
    }
  }

  if (plan.skipped.length > 0) {
    console.log(`${DIM}Skipped: ${plan.skipped.length}${RESET}`);
    for (const s of plan.skipped) {
      console.log(`  ${DIM}↳ ${s.path}: ${s.reason}${RESET}`);
    }
  }

  console.log();
}

// ── Processing Progress ──────────────────────────────────────────────────

export function printJobStart(documentName: string, trigger: string): void {
  const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
  const triggerLabel = trigger === 'new' ? 'New' : trigger === 'changed' ? 'Changed' : 'Manual';
  console.log(`${DIM}[${timestamp}]${RESET} ${triggerLabel}: ${BOLD}${documentName}${RESET}`);
}

export function printJobProgress(message: string): void {
  const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
  console.log(`${DIM}[${timestamp}]${RESET}   ▸ ${message}`);
}

export function printJobResult(result: ProcessResult): void {
  const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
  const name = path.basename(result.documentPath);

  if (result.success) {
    const deliveryRelative = result.deliveryDir.split('/').slice(-2).join('/');
    const findings = result.findings;
    const findingStr = `${findings.critical} critical, ${findings.major} major, ${findings.minor} minor`;
    console.log(`${DIM}[${timestamp}]${RESET}   ${GREEN}✓${RESET} Delivered → ${DIM}${deliveryRelative}/${RESET}`);
    console.log(`${DIM}[${timestamp}]${RESET}   ${DIM}$${result.costUsd.toFixed(2)} · ${(result.durationMs / 1000).toFixed(0)}s · ${findingStr}${RESET}\n`);
  } else {
    console.log(`${DIM}[${timestamp}]${RESET}   ${RED}✗${RESET} Failed: ${result.error}\n`);
  }
}

// ── Status Report ────────────────────────────────────────────────────────

export function printStatus(profile: ClawProfile, registry: DocumentRegistry): void {
  const state = registry.getState();
  const summary = registry.summary;

  printBanner(profile);

  console.log(`${BOLD}Documents${RESET}`);
  console.log(`  Total:    ${summary.total}`);
  console.log(`  Reviewed: ${GREEN}${summary.reviewed}${RESET}`);
  console.log(`  Flagged:  ${summary.flagged > 0 ? RED : DIM}${summary.flagged}${RESET}`);
  console.log(`  Pending:  ${summary.pending > 0 ? YELLOW : DIM}${summary.pending}${RESET}`);
  console.log(`  Errors:   ${summary.errors > 0 ? RED : DIM}${summary.errors}${RESET}`);
  console.log();

  console.log(`${BOLD}Budget${RESET}`);
  console.log(`  Remaining: $${registry.budgetRemaining.toFixed(2)} of $${state.budget.totalUsd.toFixed(2)}`);
  console.log(`  Spent:     $${state.budget.spentUsd.toFixed(2)}`);
  console.log();

  console.log(`${BOLD}Sessions${RESET}`);
  console.log(`  Completed: ${state.sessionsCompleted}`);
  console.log(`  Failed:    ${state.sessionsFailed}`);
  console.log(`  Last scan: ${state.lastScan}`);
  console.log();

  // List flagged documents
  const flagged = registry.getDocumentsByStatus('flagged');
  if (flagged.length > 0) {
    console.log(`${BOLD}${RED}Flagged Documents${RESET}`);
    for (const doc of flagged) {
      const f = doc.findingsSummary;
      console.log(`  ${RED}▸${RESET} ${doc.name} — ${f?.critical ?? 0} critical, ${f?.major ?? 0} major`);
    }
    console.log();
  }
}

// ── Budget Exhausted ─────────────────────────────────────────────────────

export function printBudgetExhausted(registry: DocumentRegistry): void {
  const state = registry.getState();
  console.log(`\n${RED}${BOLD}RETAINER EXHAUSTED${RESET}`);
  console.log(`${DIM}Total budget of $${state.budget.totalUsd.toFixed(2)} has been spent.${RESET}`);
  console.log(`${DIM}Sessions completed: ${state.sessionsCompleted}. Still watching for changes.${RESET}`);
  console.log(`${DIM}Increase budget with: lavern claw start --budget <usd>${RESET}\n`);
}

// ── Dry Run ──────────────────────────────────────────────────────────────

export function printDryRun(plan: PlanResult): void {
  console.log(`${BOLD}${CYAN}DRY RUN${RESET} — No documents will be processed.\n`);
  printPlan(plan);

  if (plan.jobs.length > 0) {
    console.log(`${DIM}Run without --dry-run to process these documents.${RESET}\n`);
  }
}

// ── Completion ───────────────────────────────────────────────────────────

export function printBatchComplete(
  processed: number,
  failed: number,
  totalCost: number,
  durationMs: number,
): void {
  const line = '─'.repeat(58);
  console.log(`${DIM}${line}${RESET}`);
  console.log(`${BOLD}Batch complete${RESET}`);
  console.log(`  Processed: ${processed}  ${DIM}|${RESET}  Failed: ${failed > 0 ? RED : DIM}${failed}${RESET}`);
  console.log(`  Cost: $${totalCost.toFixed(2)}  ${DIM}|${RESET}  Duration: ${(durationMs / 1000).toFixed(0)}s`);
  console.log(`${DIM}${line}${RESET}\n`);
}
