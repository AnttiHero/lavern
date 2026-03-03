/**
 * Claw Mode — Your Firm on Retainer.
 *
 * CLI entry points:
 *   marble claw init              — Onboard: create client profile
 *   marble claw start             — Start the firm (watch + process)
 *   marble claw status            — Show current state
 *   marble claw daemon install    — Install as macOS LaunchAgent
 *   marble claw daemon uninstall  — Remove LaunchAgent
 *   marble claw daemon status     — Show daemon service status
 *   marble claw daemon logs       — Tail daemon log files
 */

import * as path from 'node:path';
import { config } from '../config.js';
import { initClaw, loadProfile } from './init.js';
import { DocumentRegistry } from './registry.js';
import { ClawWatcher } from './watcher.js';
import { planWork, planSingleJob } from './planner.js';
import { processDocument } from './processor.js';
import { runDaemon } from './daemon.js';
import type { ClawConfig } from './types.js';
import type { IntensityLevel } from '../types/engagement.js';
import {
  printBanner,
  printWatchStatus,
  printPlan,
  printJobStart,
  printJobProgress,
  printJobResult,
  printStatus,
  printBudgetExhausted,
  printDryRun,
  printBatchComplete,
} from './terminal.js';

// ── CLI Argument Parsing ─────────────────────────────────────────────────

export interface ClawCliArgs {
  command: 'init' | 'start' | 'status' | 'daemon';
  daemonSubcommand?: string;
  dir?: string;
  budget?: number;
  perDocBudget?: number;
  intensity?: IntensityLevel;
  watch?: string[];
  once?: boolean;
  dryRun?: boolean;
  debug?: boolean;
  force?: boolean;
}

export function parseClawArgs(args: string[]): ClawCliArgs {
  // Find the subcommand (init, start, status, daemon)
  const command = args.find(a => ['init', 'start', 'status', 'daemon'].includes(a)) ?? 'start';

  const getFlag = (flag: string): boolean => args.includes(flag);
  const getValue = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
  };

  // For daemon command, capture subcommand (install, uninstall, status, logs)
  const daemonIdx = args.indexOf('daemon');
  const daemonSubcommand = daemonIdx >= 0 && daemonIdx + 1 < args.length
    ? args[daemonIdx + 1]
    : undefined;

  return {
    command: command as ClawCliArgs['command'],
    daemonSubcommand,
    dir: getValue('--dir'),
    budget: getValue('--budget') ? parseFloat(getValue('--budget')!) : undefined,
    perDocBudget: getValue('--per-doc-budget') ? parseFloat(getValue('--per-doc-budget')!) : undefined,
    intensity: getValue('--intensity') as IntensityLevel | undefined,
    watch: getValue('--watch')?.split(','),
    once: getFlag('--once'),
    dryRun: getFlag('--dry-run'),
    debug: getFlag('--debug'),
    force: getFlag('--force'),
  };
}

// ── Build Config ─────────────────────────────────────────────────────────

function buildClawConfig(args: ClawCliArgs): ClawConfig {
  const dir = args.dir ?? config.claw.dir;
  const profile = loadProfile(dir);

  return {
    dir,
    profile: profile!,
    budget: args.budget ?? profile?.budget.totalUsd ?? config.claw.defaultBudget,
    perDocBudget: args.perDocBudget ?? profile?.budget.perDocumentMaxUsd ?? config.claw.defaultPerDocBudget,
    intensity: args.intensity ?? profile?.preferences.intensity ?? (config.claw.defaultIntensity as IntensityLevel),
    style: profile?.preferences.style ?? config.claw.defaultStyle,
    formats: [...config.claw.defaultFormats],
    scanIntervalMs: config.claw.scanIntervalMs,
    once: args.once ?? false,
    dryRun: args.dryRun ?? false,
    debug: args.debug ?? false,
  };
}

// ── Commands ─────────────────────────────────────────────────────────────

/**
 * `marble claw init` — Interactive onboarding.
 */
async function runInit(args: ClawCliArgs): Promise<void> {
  await initClaw(args.dir);
}

/**
 * `marble claw status` — Show current state.
 */
function runStatus(args: ClawCliArgs): void {
  const dir = args.dir ?? config.claw.dir;
  const profile = loadProfile(dir);

  if (!profile) {
    console.error('\nNo profile found. Run `marble claw init` first.\n');
    process.exit(1);
  }

  const registry = new DocumentRegistry(dir, profile.budget.totalUsd);
  printStatus(profile, registry);
}

/**
 * `marble claw start` — The main event. Start the firm.
 */
async function runStart(args: ClawCliArgs): Promise<void> {
  const dir = args.dir ?? config.claw.dir;
  const profile = loadProfile(dir);

  if (!profile) {
    console.error('\nNo profile found. Run `marble claw init` first.\n');
    process.exit(1);
  }

  const clawConfig = buildClawConfig(args);

  // Merge additional watch paths from CLI
  const watchPaths = [...profile.watchPaths];
  if (args.watch) {
    for (const wp of args.watch) {
      if (!watchPaths.includes(wp)) watchPaths.push(wp);
    }
  }

  // Initialize registry
  const registry = new DocumentRegistry(dir, clawConfig.budget);

  // Print banner
  printBanner(profile);

  // ── Initial scan ──────────────────────────────────────────────────
  const { newDocs, changedDocs } = registry.scan(watchPaths);

  if (newDocs.length > 0 || changedDocs.length > 0) {
    console.log(`Scan complete: ${newDocs.length} new, ${changedDocs.length} changed\n`);
  }

  printWatchStatus(profile, registry);

  // ── Plan work ─────────────────────────────────────────────────────
  const plan = planWork(registry, clawConfig);

  if (clawConfig.dryRun) {
    printDryRun(plan);
    return;
  }

  printPlan(plan);

  // ── Process batch ─────────────────────────────────────────────────
  let processed = 0;
  let failed = 0;
  let totalCost = 0;
  const batchStart = Date.now();

  for (const job of plan.jobs) {
    if (registry.budgetExhausted) {
      printBudgetExhausted(registry);
      break;
    }

    printJobStart(job.documentName, job.trigger);

    const result = await processDocument(
      job.documentPath,
      job.documentHash,
      profile,
      registry,
      clawConfig,
      (msg) => printJobProgress(msg),
    );

    printJobResult(result);

    if (result.success) processed++;
    else failed++;
    totalCost += result.costUsd;
  }

  if (plan.jobs.length > 0) {
    printBatchComplete(processed, failed, totalCost, Date.now() - batchStart);
  }

  // ── Continuous mode (watch) ───────────────────────────────────────
  if (!clawConfig.once) {
    const watcher = new ClawWatcher({
      watchPaths,
      debounceMs: 2000,
      debug: clawConfig.debug,
      onChange: async (filePath, event) => {
        if (registry.budgetExhausted) {
          printBudgetExhausted(registry);
          return;
        }

        // Re-index the file
        const result = registry.indexFile(filePath);
        if (result === 'unchanged') return;

        const doc = registry.getDocumentByPath(filePath);
        if (!doc) return;

        const job = planSingleJob(
          filePath,
          doc.hash,
          event === 'new' ? 'new' : 'changed',
          registry,
          clawConfig,
        );

        if (!job) return;

        printJobStart(job.documentName, job.trigger);

        const processResult = await processDocument(
          job.documentPath,
          job.documentHash,
          profile,
          registry,
          clawConfig,
          (msg) => printJobProgress(msg),
        );

        printJobResult(processResult);
      },
    });

    watcher.start(watchPaths);

    // Graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n\nShutting down...');
      watcher.stop();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      watcher.stop();
      process.exit(0);
    });

    // Keep alive
    await new Promise(() => {}); // Never resolves — waits for SIGINT
  }
}

// ── Entry Point ──────────────────────────────────────────────────────────

export async function runClaw(args: string[]): Promise<void> {
  const parsed = parseClawArgs(args);

  switch (parsed.command) {
    case 'init':
      await runInit(parsed);
      break;
    case 'status':
      runStatus(parsed);
      break;
    case 'start':
      await runStart(parsed);
      break;
    case 'daemon':
      await runDaemon(parsed.daemonSubcommand ? [parsed.daemonSubcommand] : []);
      break;
  }
}
