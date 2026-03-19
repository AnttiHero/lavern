/**
 * Claw Mode — Your Firm on Retainer.
 *
 * CLI entry points:
 *   lavern claw init              — Onboard: create client profile
 *   lavern claw start             — Start the firm (watch + process)
 *   lavern claw status            — Show current state
 *   lavern claw daemon install    — Install as macOS LaunchAgent
 *   lavern claw daemon uninstall  — Remove LaunchAgent
 *   lavern claw daemon status     — Show daemon service status
 *   lavern claw daemon logs       — Tail daemon log files
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { config } from '../config.js';
import { ensureApiKey } from '../utils/ensure-api-key.js';
import { initClaw, loadProfile } from './init.js';
import { DocumentRegistry } from './registry.js';
import { ClawWatcher } from './watcher.js';
import { planWork, planSingleJob } from './planner.js';
import { processDocument } from './processor.js';
import { runDaemon } from './daemon.js';
import { notify } from './notify.js';
import type { ClawConfig } from './types.js';
import type { IntensityLevel } from '../types/engagement.js';
import type { DocumentStyle } from '../assembly/format-converter.js';
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
  command: 'init' | 'start' | 'status' | 'daemon' | 'retry';
  daemonSubcommand?: string;
  /** Retry a specific document by hash. */
  retryHash?: string;
  /** Retry stale (changed) documents instead of errors. */
  retryStale?: boolean;
  dir?: string;
  budget?: number;
  perDocBudget?: number;
  intensity?: IntensityLevel;
  watch?: string[];
  once?: boolean;
  dryRun?: boolean;
  debug?: boolean;
  force?: boolean;
  /** Maximum ethical mode — EU provider, all-confidential, conservative. */
  ethical?: boolean;
}

export function parseClawArgs(args: string[]): ClawCliArgs {
  // Find the subcommand (init, start, status, daemon)
  const command = args.find(a => ['init', 'start', 'status', 'daemon', 'retry'].includes(a)) ?? 'start';

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
    retryHash: getValue('--hash'),
    retryStale: getFlag('--stale'),
    dir: getValue('--dir'),
    budget: (() => { const v = getValue('--budget'); if (!v) return undefined; const n = parseFloat(v); return Number.isFinite(n) && n > 0 ? n : undefined; })(),
    perDocBudget: (() => { const v = getValue('--per-doc-budget'); if (!v) return undefined; const n = parseFloat(v); return Number.isFinite(n) && n > 0 ? n : undefined; })(),
    intensity: getValue('--intensity') as IntensityLevel | undefined,
    watch: getValue('--watch')?.split(','),
    once: getFlag('--once'),
    dryRun: getFlag('--dry-run'),
    debug: getFlag('--debug'),
    force: getFlag('--force'),
    ethical: getFlag('--ethical'),
  };
}

// ── Style mapping ────────────────────────────────────────────────────────

/** Map profile style preference to a valid DocumentStyle for rendering. */
const STYLE_MAP: Record<string, DocumentStyle> = {
  'plain-language': 'accessible',
  traditional: 'traditional',
  elegant: 'elegant',
  accessible: 'accessible',
};

function toDocumentStyle(style?: string): DocumentStyle | undefined {
  return style ? STYLE_MAP[style] : undefined;
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
    style: toDocumentStyle(profile?.preferences.style) ?? config.claw.defaultStyle,
    formats: [...config.claw.defaultFormats],
    scanIntervalMs: config.claw.scanIntervalMs,
    once: args.once ?? false,
    dryRun: args.dryRun ?? false,
    debug: args.debug ?? false,
    ethicalMode: args.ethical ?? profile?.ethicalMode ?? false,
    model: config.claw.model,
  };
}

// ── Log Rotation ────────────────────────────────────────────────────────

const LOG_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const LOG_MAX_ROTATED = 3;

/**
 * Rotate daemon log files if they exceed 10 MB.
 *
 * The structured logger (`src/utils/logger.ts`) handles its own daily
 * rotation for the application log directory (SHEM_LOG_DIR). This
 * function covers the daemon stdout/stderr logs that launchd writes to
 * `<clawDir>/logs/claw.stdout.log` and `claw.stderr.log`, which are
 * not managed by the structured logger.
 *
 * Rotation scheme: `claw.stdout.log` -> `.1` -> `.2` -> `.3` (max 3).
 */
export function rotateDaemonLogs(clawDir: string): void {
  const logsDir = path.join(clawDir, 'logs');
  if (!fs.existsSync(logsDir)) return;

  const logFiles = ['claw.stdout.log', 'claw.stderr.log'];

  for (const logFile of logFiles) {
    const logPath = path.join(logsDir, logFile);
    if (!fs.existsSync(logPath)) continue;

    let stat: fs.Stats;
    try {
      stat = fs.statSync(logPath);
    } catch {
      continue;
    }

    if (stat.size < LOG_MAX_BYTES) continue;

    // Rotate: delete oldest, shift others up
    const oldest = path.join(logsDir, `${logFile}.${LOG_MAX_ROTATED}`);
    try { fs.unlinkSync(oldest); } catch { /* may not exist */ }

    for (let i = LOG_MAX_ROTATED - 1; i >= 1; i--) {
      const from = path.join(logsDir, `${logFile}.${i}`);
      const to = path.join(logsDir, `${logFile}.${i + 1}`);
      try { fs.renameSync(from, to); } catch { /* may not exist */ }
    }

    // Move current log to .1
    try {
      fs.renameSync(logPath, path.join(logsDir, `${logFile}.1`));
    } catch {
      // If rename fails, truncate instead
      try { fs.writeFileSync(logPath, ''); } catch { /* best effort */ }
    }
  }
}

// ── Commands ─────────────────────────────────────────────────────────────

/**
 * `lavern claw init` — Interactive onboarding.
 */
async function runInit(args: ClawCliArgs): Promise<void> {
  await initClaw(args.dir);
}

/**
 * `lavern claw status` — Show current state.
 */
function runStatus(args: ClawCliArgs): void {
  const dir = args.dir ?? config.claw.dir;
  const profile = loadProfile(dir);

  if (!profile) {
    console.error('\nNo profile found. Run `lavern claw init` first.\n');
    process.exit(1);
  }

  const registry = new DocumentRegistry(dir, profile.budget.totalUsd);
  printStatus(profile, registry);
}

/**
 * `lavern claw start` — The main event. Start the firm.
 */
async function runStart(args: ClawCliArgs): Promise<void> {
  const dir = args.dir ?? config.claw.dir;

  // ── Pre-flight checks ──────────────────────────────────────────────
  console.log('\nPre-flight checks:');
  const checks: Array<{ label: string; ok: boolean; detail: string }> = [];

  // 1. API key present
  const apiKey = ensureApiKey();
  checks.push({
    label: 'API key configured',
    ok: apiKey.length > 0,
    detail: apiKey.length > 0 ? '' : 'ANTHROPIC_API_KEY not found in env or .env',
  });

  // 2. Profile exists
  const profile = loadProfile(dir);
  checks.push({
    label: profile ? `Profile loaded (${profile.company})` : 'Profile loaded',
    ok: profile !== null,
    detail: profile ? '' : 'No profile found. Run `lavern claw init` first.',
  });

  // 3. Watch paths exist
  const allWatchPaths = [...(profile?.watchPaths ?? []), ...(args.watch ?? [])];
  const resolvedWatchPaths = allWatchPaths.map(wp => path.resolve(wp.replace(/^~/, os.homedir())));
  const accessiblePaths = resolvedWatchPaths.filter(p => fs.existsSync(p));
  checks.push({
    label: `Watch paths: ${accessiblePaths.length} director${accessiblePaths.length === 1 ? 'y' : 'ies'}`,
    ok: accessiblePaths.length > 0,
    detail: accessiblePaths.length > 0 ? '' : 'No watch path directories exist on disk',
  });

  // 4. Mistral key (if ethical mode)
  const ethicalMode = args.ethical ?? profile?.ethicalMode ?? false;
  if (ethicalMode) {
    const hasMistralKey = config.mistral.apiKey.length > 0;
    checks.push({
      label: 'Mistral API key (ethical mode)',
      ok: hasMistralKey,
      detail: hasMistralKey ? '' : 'Mistral API key missing (required for ethical mode)',
    });
  }

  // Print results
  let hasFatal = false;
  for (const check of checks) {
    if (check.ok) {
      console.log(`  \u2713 ${check.label}`);
    } else {
      console.log(`  \u2717 ${check.detail || check.label}`);
      hasFatal = true;
    }
  }
  console.log('');

  if (hasFatal || !profile) {
    console.error('Pre-flight failed. Resolve the issues above and try again.\n');
    process.exit(1);
    return; // Unreachable — helps TypeScript narrow `profile` to non-null
  }

  // ── Log rotation ───────────────────────────────────────────────────
  rotateDaemonLogs(dir);

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

  // Crash recovery: reset documents stuck in 'processing' from prior crashes
  const recovered = registry.recoverStuckDocuments();
  if (recovered > 0) {
    console.log(`⟳ Recovered ${recovered} document${recovered === 1 ? '' : 's'} stuck in processing state`);
  }

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

  // Budget warning check (before processing)
  const budgetState = registry.getState().budget;
  if (budgetState.spentUsd >= budgetState.totalUsd * 0.8 && budgetState.spentUsd < budgetState.totalUsd) {
    notify({
      type: 'budget_warning',
      title: 'Budget warning (80%)',
      message: `$${registry.budgetRemaining.toFixed(2)} remaining of $${budgetState.totalUsd.toFixed(2)}`,
    });
  }

  for (const job of plan.jobs) {
    if (registry.budgetExhausted) {
      printBudgetExhausted(registry);
      notify({
        type: 'budget_exhausted',
        title: 'Retainer exhausted',
        message: `Total budget of $${registry.getState().budget.totalUsd.toFixed(2)} has been spent.`,
      });
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
      job.confidential,
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
          notify({
            type: 'budget_exhausted',
            title: 'Retainer exhausted',
            message: `Total budget of $${registry.getState().budget.totalUsd.toFixed(2)} has been spent.`,
          });
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
          job.confidential,
        );

        printJobResult(processResult);
      },
    });

    watcher.start(watchPaths);

    // v17: Heartbeat — periodic status check
    let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
    let heartbeatCount = 0;
    if (config.claw.heartbeatEnabled) {
      heartbeatTimer = setInterval(() => {
        heartbeatCount++;
        const alerts: string[] = [];
        const state = registry.getState();

        // Budget approaching limit (>80%)
        const pct = state.budget.totalUsd > 0 ? state.budget.spentUsd / state.budget.totalUsd : 0;
        if (pct > 0.8) alerts.push(`Budget ${Math.round(pct * 100)}% used`);

        // Documents needing attention
        const docs = Object.values(state.documents);
        const stale = docs.filter(d => d.status === 'stale').length;
        const errors = docs.filter(d => d.status === 'error').length;
        const flagged = docs.filter(d => d.status === 'flagged').length;

        if (stale > 0) alerts.push(`${stale} doc(s) changed since review`);
        if (errors > 0) alerts.push(`${errors} doc(s) failed processing`);
        if (flagged > 0) alerts.push(`${flagged} doc(s) need human review`);

        // State compaction: run every 12th heartbeat (~6 hours at 30min interval)
        // Archives reviewed/error entries older than 30 days to keep state.json lean
        if (heartbeatCount % 12 === 0 && docs.length > 100) {
          registry.compact(30);
        }

        // Log rotation: check daemon logs every 6th heartbeat (~3 hours)
        if (heartbeatCount % 6 === 0) {
          rotateDaemonLogs(dir);
        }

        if (alerts.length === 0) return; // Silent — everything is fine

        notify({
          type: 'heartbeat',
          title: 'Lavern Heartbeat',
          message: alerts.join(' \u00B7 '),
        });
      }, config.claw.heartbeatIntervalMs);
    }

    // Graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n\nShutting down...');
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      watcher.stop();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      watcher.stop();
      process.exit(0);
    });

    // Keep alive
    await new Promise(() => {}); // Never resolves — waits for SIGINT
  }
}

/**
 * `lavern claw retry` — Retry failed or stale documents.
 */
function runRetry(args: ClawCliArgs): void {
  const dir = args.dir ?? config.claw.dir;
  const profile = loadProfile(dir);

  if (!profile) {
    console.error('\nNo profile found. Run `lavern claw init` first.\n');
    process.exit(1);
  }

  const registry = new DocumentRegistry(dir, profile.budget.totalUsd);

  if (args.retryStale) {
    const count = registry.retryStale();
    if (count === 0) {
      console.log('\nNo stale documents to retry.\n');
    } else {
      console.log(`\n⟳ Queued ${count} stale document${count === 1 ? '' : 's'} for reprocessing.\n`);
      console.log('Run `lavern claw start` to process them.\n');
    }
  } else {
    const count = registry.retryFailed(args.retryHash);
    if (count === 0) {
      console.log(args.retryHash
        ? `\nNo failed document found with hash ${args.retryHash}.\n`
        : '\nNo failed documents to retry.\n');
    } else {
      console.log(`\n⟳ Queued ${count} failed document${count === 1 ? '' : 's'} for reprocessing.\n`);
      console.log('Run `lavern claw start` to process them.\n');
    }
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
    case 'retry':
      runRetry(parsed);
      break;
    case 'daemon':
      await runDaemon(parsed.daemonSubcommand ? [parsed.daemonSubcommand] : []);
      break;
  }
}
