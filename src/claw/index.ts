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
import { writeJsonFileAtomic } from '../utils/fs-helpers.js';
import { DocumentRegistry } from './registry.js';
import { ClawWatcher } from './watcher.js';
import { planWork, planSingleJob } from './planner.js';
import { processDocument } from './processor.js';
import { runDaemon } from './daemon-factory.js';
import { notify } from './notify.js';
import { getPrecedentBoard } from './precedent-board.js';
import { runCurator } from './curator.js';
import { clawEventBus } from './events.js';
import { eventTimestamp } from '../events/event-bus.js';
import { startTelegramBot, stopTelegramBot } from './telegram-bot.js';
import { createDailyBackup } from './backup.js';
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
  command: 'init' | 'start' | 'status' | 'daemon' | 'retry' | 'validate' | 'pause' | 'resume';
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
  const command = args.find(a => ['init', 'start', 'status', 'daemon', 'retry', 'validate', 'pause', 'resume'].includes(a)) ?? 'start';

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

  // 2. Profile exists (load first — needed to decide what credentials we
  //    require: local-only mode skips the Anthropic key check entirely)
  const profile = loadProfile(dir);

  // 1. Provider readiness — Anthropic key for cloud, Ollama for local.
  //    A profile with processing='local' (or 'hybrid') needs Ollama, not
  //    a Claude key. Without this branch the daemon refused to start in
  //    fully-local installs.
  const profileProcessing = profile?.processing ?? 'local';
  if (profileProcessing === 'local') {
    const localUrl = (config.claw.localModelUrl || config.local.baseUrl).replace(/\/$/, '');
    const localModel = config.claw.localModel || config.local.defaultModel;
    let ok = false; let detail = '';
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`${localUrl}/api/tags`, { signal: controller.signal });
      clearTimeout(t);
      if (res.ok) {
        const data = await res.json() as { models?: Array<{ name?: string }> };
        const names = (data.models ?? []).map(m => m.name ?? '');
        if (names.some(n => n === localModel || n.startsWith(`${localModel}:`))) {
          ok = true; detail = `${localModel} ready at ${localUrl}`;
        } else {
          detail = `Ollama running but ${localModel} not pulled. Run: ollama pull ${localModel}`;
        }
      } else { detail = `Ollama responded HTTP ${res.status} at ${localUrl}`; }
    } catch { detail = `Ollama unreachable at ${localUrl} — is the menu-bar app running?`; }
    checks.push({ label: 'Ollama (local model)', ok, detail });
  } else {
    const apiKey = ensureApiKey();
    checks.push({
      label: 'API key configured',
      ok: apiKey.length > 0,
      detail: apiKey.length > 0 ? '' : 'ANTHROPIC_API_KEY not found in env or .env',
    });
  }
  checks.push({
    label: profile ? `Profile loaded (${profile.company})` : 'Profile loaded',
    ok: profile !== null,
    detail: profile ? '' : 'No profile found. Run `lavern claw init` first.',
  });
  // (API-key check moved above — provider-aware)

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
  clawEventBus.emitEvent({ type: 'claw_scan_started', watchPaths, timestamp: eventTimestamp() });
  const { newDocs, changedDocs } = registry.scan(watchPaths);
  clawEventBus.emitEvent({ type: 'claw_scan_completed', newDocs: newDocs.length, changedDocs: changedDocs.length, totalDocs: Object.keys(registry.getState().documents).length, timestamp: eventTimestamp() });

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
    // Pause guard — check profile on each iteration (may be set via API)
    const currentProfile = loadProfile(dir);
    if (currentProfile?.paused) {
      console.log('\n⏸  Paused — skipping remaining jobs. Resume via dashboard or API.');
      break;
    }

    if (registry.budgetExhausted) {
      printBudgetExhausted(registry);
      notify({
        type: 'budget_exhausted',
        title: 'Retainer exhausted',
        message: `Total budget of $${registry.getState().budget.totalUsd.toFixed(2)} has been spent.`,
      });
      break;
    }

    clawEventBus.emitEvent({ type: 'claw_job_started', documentPath: job.documentPath, documentHash: job.documentHash, documentType: registry.getDocument(job.documentHash)?.type ?? job.documentName, trigger: job.trigger, timestamp: eventTimestamp() });
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
        // Pause guard — accept changes silently, process on resume
        const currentProfile = loadProfile(dir);
        if (currentProfile?.paused) return;

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

        clawEventBus.emitEvent({ type: 'claw_job_started', documentPath: job.documentPath, documentHash: job.documentHash, documentType: registry.getDocument(job.documentHash)?.type ?? job.documentName, trigger: job.trigger, timestamp: eventTimestamp() });
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

    // Telegram bot — two-way chat control
    startTelegramBot();

    // v17: Heartbeat — periodic status check
    let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
    let heartbeatCount = 0;
    if (config.claw.heartbeatEnabled) {
      heartbeatTimer = setInterval(() => {
        heartbeatCount++;
        const alerts: string[] = [];
        const state = registry.getState();

        // Health check: verify API key still available
        if (!config.anthropic.apiKey) {
          alerts.push('API key missing — processing will fail');
        }

        // Health check: verify watcher is still running
        if (!watcher.isRunning) {
          alerts.push('File watcher stopped — documents not being monitored');
        }

        // Budget approaching limit (>80%)
        const pct = state.budget.totalUsd > 0 ? state.budget.spentUsd / state.budget.totalUsd : 0;
        if (pct > 0.8) {
          alerts.push(`Budget ${Math.round(pct * 100)}% used`);
          clawEventBus.emitEvent({ type: 'claw_budget_warning', percentUsed: Math.round(pct * 100), remainingUsd: parseFloat((state.budget.totalUsd - state.budget.spentUsd).toFixed(2)), timestamp: eventTimestamp() });
        }

        // Documents needing attention
        const docs = Object.values(state.documents);
        const stale = docs.filter(d => d.status === 'stale').length;
        const errors = docs.filter(d => d.status === 'error').length;
        const flagged = docs.filter(d => d.status === 'flagged').length;

        if (stale > 0) alerts.push(`${stale} doc(s) changed since review`);
        if (errors > 0) alerts.push(`${errors} doc(s) failed processing`);
        if (flagged > 0) alerts.push(`${flagged} doc(s) need human review`);

        // Precedent board: check deprecated count + decay on compaction cycle
        let precBoard: ReturnType<typeof getPrecedentBoard> | null = null;
        try {
          precBoard = getPrecedentBoard(dir);
          const precSummary = precBoard.summary;
          if (precSummary.deprecated > 0) alerts.push(`${precSummary.deprecated} deprecated precedent(s)`);
        } catch { /* precedent board unavailable — non-fatal */ }

        // State compaction: run every 12th heartbeat (~6 hours at 30min interval)
        // Archives reviewed/error entries older than 30 days to keep state.json lean
        if (heartbeatCount % 12 === 0 && docs.length > 100) {
          try { registry.compact(30); } catch { /* compaction non-fatal */ }
        }
        if (heartbeatCount % 12 === 0 && precBoard && precBoard.summary.total > 0) {
          try { precBoard.decay(); precBoard.compact(); } catch { /* decay non-fatal */ }
        }

        // Log rotation: check daemon logs every 6th heartbeat (~3 hours)
        if (heartbeatCount % 6 === 0) {
          rotateDaemonLogs(dir);
        }

        // Daily backup: once every 48th heartbeat (~24 hours at 30min interval)
        if (heartbeatCount % 48 === 0) {
          try { createDailyBackup(dir); } catch { /* backup non-fatal */ }
        }

        // Scheduled re-review: mark old documents as stale
        const currentProfile = loadProfile(dir);
        if (currentProfile?.reviewSchedule?.enabled && currentProfile.reviewSchedule.intervalDays > 0) {
          const intervalMs = currentProfile.reviewSchedule.intervalDays * 24 * 60 * 60 * 1000;
          const now = Date.now();
          let dueCount = 0;
          for (const doc of docs) {
            if ((doc.status === 'reviewed' || doc.status === 'flagged') && doc.lastReviewed) {
              const lastReviewedMs = new Date(doc.lastReviewed).getTime();
              if (!isNaN(lastReviewedMs) && now - lastReviewedMs > intervalMs) {
                registry.updateStatus(doc.hash, 'stale');
                dueCount++;
              }
            }
          }
          if (dueCount > 0) {
            alerts.push(`${dueCount} doc(s) due for scheduled re-review`);
          }
        }

        // Weekly digest email: fire on configured day/hour
        // Uses hour-window check instead of exact minute to tolerate heartbeat drift
        if (config.claw.notifyEmail) {
          const now = new Date();
          if (now.getDay() === config.claw.digestDay && now.getHours() === config.claw.digestHour) {
            if (heartbeatCount % 2 === 1) {
              // Fire-and-forget with full error handling
              try {
                let precedentsLearned = 0;
                try { precedentsLearned = getPrecedentBoard(dir).summary.total; } catch { /* non-fatal */ }

                const weekStart = new Date(now);
                weekStart.setDate(weekStart.getDate() - 7);
                const period = `${weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${now.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;

                import('../email/send.js').then(({ sendClawDigestEmail }) =>
                  sendClawDigestEmail(config.claw.notifyEmail, {
                    period,
                    documentsProcessed: state.sessionsCompleted,
                    findingsSummary: {
                      critical: docs.reduce((sum, d) => sum + (d.findingsSummary?.critical ?? 0), 0),
                      major: docs.reduce((sum, d) => sum + (d.findingsSummary?.major ?? 0), 0),
                      minor: docs.reduce((sum, d) => sum + (d.findingsSummary?.minor ?? 0), 0),
                    },
                    costUsd: state.budget.spentUsd,
                    precedentsLearned,
                    budgetRemainingUsd: registry.budgetRemaining,
                  }),
                ).catch(() => { /* digest email non-fatal */ });
              } catch { /* digest computation non-fatal */ }
            }
          }
        }

        // ── Curator (lighthouse persona 3) ───────────────────────────
        // Runs every 4th heartbeat (~2h at 30min interval) — cheap when
        // the folder is quiet (heuristic gate skips the LLM call), and
        // when it does fire it produces portfolio-level insight rather
        // than per-doc threshold pings. Soft-fail by design.
        const shouldRunCurator = heartbeatCount % 4 === 0 || alerts.length > 0;
        if (shouldRunCurator && currentProfile && precBoard) {
          // Fire-and-forget — heartbeat callback stays sync so we don't
          // back up the timer. Decision actions are inside the .then().
          runCurator({
            registry,
            precedentBoard: precBoard,
            profile: currentProfile,
            doSurface: true,
            doReReadQueue: true,
            doConsolidation: heartbeatCount % 12 === 0,
          }).then(decision => {
            if (decision.surface) {
              notify({
                type: decision.surface.severity === 'critical' ? 'document_flagged' : 'heartbeat',
                title: decision.surface.title,
                message: decision.surface.message,
              });
            }
            if (decision.reReadQueue.length > 0) {
              for (const hash of decision.reReadQueue) {
                try { registry.updateStatus(hash, 'stale'); } catch { /* per-doc soft-fail */ }
              }
            }
            // Phase 5: promote precedents the Curator flagged as ready to confirm.
            // markConfirmed is idempotent + soft-fails on missing IDs, so a stale
            // ID list (e.g. precedent deprecated between Curator decision + heartbeat
            // consumption) doesn't poison the daemon.
            if (decision.promoteToConfirmed.length > 0 && precBoard) {
              let promoted = 0;
              for (const id of decision.promoteToConfirmed) {
                try { if (precBoard.markConfirmed(id)) promoted++; } catch { /* per-id soft-fail */ }
              }
              // markConfirmed logs each promotion via logger.info — no need to
              // double-emit on the event bus here.
              void promoted;
            }
            // Drift detection — surface as a low-severity heartbeat alert next tick.
            // We don't act automatically (the operator decides whether drift
            // is model wobble or a real doctrinal shift).
            if (decision.driftDetected.length > 0) {
              notify({
                type: 'heartbeat',
                title: 'Precedent drift detected',
                message: `${decision.driftDetected.length} precedent(s) showing inconsistent verdicts over time. Review the Precedents tab.`,
              });
            }
          }).catch(() => { /* Curator is advisory only — never break the daemon */ });
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
      stopTelegramBot();
      watcher.stop();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      stopTelegramBot();
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
    case 'validate':
      runValidate(parsed);
      break;
    case 'pause':
      runPauseResume(parsed, true);
      break;
    case 'resume':
      runPauseResume(parsed, false);
      break;
  }
}

// ── Validate ────────────────────────────────────────────────────────────

function runValidate(args: ClawCliArgs): void {
  const dir = args.dir ?? config.claw.dir;
  const checks: Array<{ label: string; ok: boolean; detail: string }> = [];

  // Profile
  const profile = loadProfile(dir);
  checks.push({ label: 'Profile exists', ok: !!profile, detail: profile ? dir + '/profile.json' : 'Run `lavern claw init` to create' });

  // API key
  const apiKey = config.anthropic.apiKey;
  checks.push({ label: 'API key configured', ok: apiKey.length > 0, detail: apiKey.length > 0 ? `${apiKey.slice(0, 8)}...` : 'Set ANTHROPIC_API_KEY' });

  // Watch paths
  if (profile) {
    for (const wp of profile.watchPaths) {
      const resolved = path.resolve(wp.replace(/^~/, os.homedir()));
      const exists = fs.existsSync(resolved);
      checks.push({ label: `Watch path: ${wp}`, ok: exists, detail: exists ? 'exists' : 'does not exist' });
    }
  }

  // Local model
  const localModel = config.claw.localModel;
  if (localModel) {
    checks.push({ label: 'Local model configured', ok: true, detail: localModel });
  } else if (profile?.ethicalMode) {
    checks.push({ label: 'Local model (required for ethical mode)', ok: false, detail: 'Set LAVERN_LOCAL_MODEL' });
  }

  // Telegram
  const tgToken = config.claw.telegramToken;
  const tgChat = config.claw.telegramChatId;
  if (tgToken && tgChat) {
    checks.push({ label: 'Telegram notifications', ok: true, detail: `chat ${tgChat}` });
  } else if (tgToken || tgChat) {
    checks.push({ label: 'Telegram notifications', ok: false, detail: 'Both TOKEN and CHAT_ID required' });
  }

  // Email
  const email = config.claw.notifyEmail;
  if (email) {
    checks.push({ label: 'Email notifications', ok: email.includes('@'), detail: email });
  }

  // Webhook
  const webhook = config.claw.webhookUrl;
  if (webhook) {
    checks.push({ label: 'Webhook URL', ok: webhook.startsWith('http'), detail: webhook.slice(0, 50) });
  }

  // Budget
  if (profile) {
    checks.push({ label: 'Budget', ok: profile.budget.totalUsd > 0, detail: `$${profile.budget.totalUsd} total, $${profile.budget.perDocumentMaxUsd} per doc` });
  }

  // Print results
  console.log('\n  Clawern Configuration Report\n');
  let allOk = true;
  for (const check of checks) {
    const icon = check.ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
    console.log(`  ${icon}  ${check.label}`);
    if (check.detail) console.log(`     ${check.ok ? '\x1b[2m' : '\x1b[33m'}${check.detail}\x1b[0m`);
    if (!check.ok) allOk = false;
  }

  console.log(allOk
    ? '\n  \x1b[32mAll checks passed.\x1b[0m Ready to start.\n'
    : '\n  \x1b[33mSome checks failed.\x1b[0m Review the items above.\n');
}

// ── Pause / Resume CLI ──────────────────────────────────────────────────

function runPauseResume(args: ClawCliArgs, pause: boolean): void {
  const dir = args.dir ?? config.claw.dir;
  const profile = loadProfile(dir);
  if (!profile) {
    console.error('\nNo profile found. Run `lavern claw init` first.\n');
    return;
  }

  if (pause && profile.paused) {
    console.log('\n⏸  Already paused.\n');
    return;
  }
  if (!pause && !profile.paused) {
    console.log('\n▶  Already running.\n');
    return;
  }

  profile.paused = pause;
  profile.pausedAt = pause ? new Date().toISOString() : undefined;

  const profilePath = path.join(dir, 'profile.json');
  writeJsonFileAtomic(profilePath, profile);

  if (pause) {
    console.log('\n⏸  Processing paused. Resume with `lavern claw resume`.\n');
  } else {
    console.log('\n▶  Processing resumed.\n');
  }
}
