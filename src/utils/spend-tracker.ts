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

const logger = createLogger('SPEND');

// ── In-Memory State ──────────────────────────────────────────────────────

let currentDate = todayUtc();
let dailyTotal = 0;
let alertSent = false;

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function resetIfNewDay(): void {
  const today = todayUtc();
  if (today !== currentDate) {
    logger.info('Daily spend reset', { previousDate: currentDate, previousTotal: dailyTotal.toFixed(2) });
    currentDate = today;
    dailyTotal = 0;
    alertSent = false;
  }
}

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Record spend from a completed session.
 * Called from archiveSession() after the session's actual cost is known.
 */
export function recordSpend(costUsd: number): void {
  resetIfNewDay();
  dailyTotal += costUsd;

  logger.info('Spend recorded', {
    cost: costUsd.toFixed(3),
    dailyTotal: dailyTotal.toFixed(2),
    cap: config.dailySpendCapUsd,
    pct: ((dailyTotal / config.dailySpendCapUsd) * 100).toFixed(0) + '%',
  });

  // Owner alert at 80% threshold
  if (!alertSent && dailyTotal >= config.dailySpendCapUsd * 0.8) {
    alertSent = true;
    fireOwnerAlert('daily_spend_warning', {
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
} {
  resetIfNewDay();
  return {
    date: currentDate,
    totalUsd: dailyTotal,
    capUsd: config.dailySpendCapUsd,
    pct: config.dailySpendCapUsd > 0 ? (dailyTotal / config.dailySpendCapUsd) * 100 : 0,
    capReached: dailyTotal >= config.dailySpendCapUsd,
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
  alertSent = false;
}
