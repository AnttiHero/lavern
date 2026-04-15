/**
 * Global Daily Spend Tracker — Platform-wide cost protection.
 *
 * Tracks total API spend across ALL sessions for the current UTC day.
 * When the daily cap is reached, new session creation is blocked
 * (in-flight sessions finish normally — we don't cut people off mid-review).
 *
 * Architecture:
 * - In-memory accumulator for fast reads (every session creation checks this)
 * - SQLite persistence for crash recovery (loaded on startup)
 * - Owner alert webhook at 80% threshold
 *
 * Resets at midnight UTC automatically (date string comparison).
 */

import { config } from '../config.js';
import { createLogger } from './logger.js';
import { getDailySpend, incrementDailySpend } from '../db/database.js';

const logger = createLogger('SPEND');

// ── In-Memory State ──────────────────────────────────────────────────────

let currentDate = todayUtc();
let dailyTotal = 0;
let hydrated = false;

/** Trajectory alert thresholds as fractions of the daily cap. Fire once per day, once per threshold. */
const ALERT_THRESHOLDS = [0.5, 0.75, 0.9] as const;
type AlertThreshold = (typeof ALERT_THRESHOLDS)[number];
const alertsFired = new Set<AlertThreshold>();

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

/** Lazily hydrate the in-memory counter from SQLite on first use.
 *  Survives server restarts — a fresh process picks up today's total from disk
 *  so a bug that spent $400 before a crash doesn't get a fresh $500 budget. */
function hydrateFromDb(): void {
  if (hydrated) return;
  hydrated = true;
  try {
    const persisted = getDailySpend();
    if (persisted > 0) {
      dailyTotal = persisted;
      logger.info('Daily spend hydrated from DB', { date: currentDate, total: dailyTotal.toFixed(2) });
      // Mark any thresholds already crossed as already-fired so we don't
      // re-alert on restart for ground we've covered.
      for (const t of ALERT_THRESHOLDS) {
        if (dailyTotal >= config.dailySpendCapUsd * t) alertsFired.add(t);
      }
    }
  } catch (err) {
    logger.warn('Daily spend hydrate failed', { error: err instanceof Error ? err.message : String(err) });
  }
}

function resetIfNewDay(): void {
  hydrateFromDb();
  const today = todayUtc();
  if (today !== currentDate) {
    logger.info('Daily spend reset', { previousDate: currentDate, previousTotal: dailyTotal.toFixed(2) });
    currentDate = today;
    dailyTotal = 0;
    alertsFired.clear();
  }
}

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Record spend from a completed session.
 * Called from archiveSession() after the session's actual cost is known.
 */
export function recordSpend(costUsd: number): void {
  resetIfNewDay();
  if (!Number.isFinite(costUsd) || costUsd <= 0) return;
  dailyTotal += costUsd;

  // Persist to DB so the counter survives restarts. Must not block or throw.
  try {
    incrementDailySpend(costUsd);
  } catch (err) {
    logger.warn('Daily spend persist failed', { error: err instanceof Error ? err.message : String(err) });
  }

  logger.info('Spend recorded', {
    cost: costUsd.toFixed(3),
    dailyTotal: dailyTotal.toFixed(2),
    cap: config.dailySpendCapUsd,
    pct: ((dailyTotal / config.dailySpendCapUsd) * 100).toFixed(0) + '%',
  });

  // Trajectory alerts: fire once per threshold per day (50%, 75%, 90%).
  // Lets an operator see spend accelerating before it hits the cap.
  for (const t of ALERT_THRESHOLDS) {
    if (alertsFired.has(t)) continue;
    if (dailyTotal < config.dailySpendCapUsd * t) continue;
    alertsFired.add(t);
    fireOwnerAlert('daily_spend_trajectory', {
      threshold: Math.round(t * 100) + '%',
      dailyTotal: dailyTotal.toFixed(2),
      cap: config.dailySpendCapUsd,
      pct: ((dailyTotal / config.dailySpendCapUsd) * 100).toFixed(0) + '%',
      date: currentDate,
    });
  }
}

/**
 * Check whether the daily spend cap allows a new session.
 * Returns { allowed: true } or { allowed: false, reason, retryAfterMs }.
 */
export function checkDailySpendCap(): {
  allowed: boolean;
  reason?: string;
  dailyTotal: number;
  dailyCap: number;
  retryAfterMs?: number;
} {
  resetIfNewDay();

  if (dailyTotal >= config.dailySpendCapUsd) {
    // Calculate ms until midnight UTC
    const now = new Date();
    const midnight = new Date(now);
    midnight.setUTCDate(midnight.getUTCDate() + 1);
    midnight.setUTCHours(0, 0, 0, 0);
    const retryAfterMs = midnight.getTime() - now.getTime();

    return {
      allowed: false,
      reason: `Daily spend cap reached ($${dailyTotal.toFixed(2)} / $${config.dailySpendCapUsd.toFixed(2)}). Resets at midnight UTC.`,
      dailyTotal,
      dailyCap: config.dailySpendCapUsd,
      retryAfterMs,
    };
  }

  return {
    allowed: true,
    dailyTotal,
    dailyCap: config.dailySpendCapUsd,
  };
}

/**
 * Get current daily spend stats (for health/monitoring endpoints).
 */
export function getDailySpendStats(): {
  date: string;
  totalUsd: number;
  capUsd: number;
  pct: number;
  capReached: boolean;
  thresholdsFired: string[];
  nextThresholdPct: number | null;
  remainingUsd: number;
} {
  resetIfNewDay();
  const pct = config.dailySpendCapUsd > 0 ? (dailyTotal / config.dailySpendCapUsd) * 100 : 0;
  const fired = Array.from(alertsFired).map((t) => `${Math.round(t * 100)}%`).sort();
  const nextThreshold = ALERT_THRESHOLDS.find((t) => !alertsFired.has(t)) ?? null;
  return {
    date: currentDate,
    totalUsd: dailyTotal,
    capUsd: config.dailySpendCapUsd,
    pct,
    capReached: dailyTotal >= config.dailySpendCapUsd,
    thresholdsFired: fired,
    nextThresholdPct: nextThreshold !== null ? Math.round(nextThreshold * 100) : null,
    remainingUsd: Math.max(0, config.dailySpendCapUsd - dailyTotal),
  };
}

// ── Owner Alert ──────────────────────────────────────────────────────────

async function fireOwnerAlert(event: string, data: Record<string, unknown>): Promise<void> {
  const url = config.ownerAlertWebhook;
  if (!url) {
    logger.warn('Owner alert triggered but no webhook configured (set LAVERN_OWNER_WEBHOOK)', { event, ...data });
    return;
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, timestamp: new Date().toISOString(), ...data }),
      signal: AbortSignal.timeout(10_000),
    });
    logger.info('Owner alert sent', { event, status: response.status });
  } catch (err) {
    logger.error('Owner alert failed', { event, error: err instanceof Error ? err.message : String(err) });
  }
}

// ── Testing Helpers ──────────────────────────────────────────────────────

/** Reset internal state (for tests only). */
export function _resetForTesting(): void {
  currentDate = todayUtc();
  dailyTotal = 0;
  alertsFired.clear();
}
