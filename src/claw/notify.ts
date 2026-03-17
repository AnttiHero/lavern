/**
 * Claw Notifications — Alert the partners.
 *
 * Sends lightweight notifications on critical events:
 * - Webhook POST (Slack, Discord, generic JSON)
 * - macOS native notification via osascript
 *
 * Design: fire-and-forget. Never blocks document processing.
 * Deduplication: same type+title suppressed for 5 minutes.
 */

import { execFileSync } from 'node:child_process';
import { config } from '../config.js';

// ── Types ────────────────────────────────────────────────────────────────

export type ClawNotificationType =
  | 'budget_warning'
  | 'budget_exhausted'
  | 'document_failed'
  | 'document_flagged'
  | 'document_confidential'
  | 'daemon_error'
  | 'heartbeat';

export interface ClawNotification {
  type: ClawNotificationType;
  title: string;
  message: string;
  details?: Record<string, unknown>;
}

// ── Deduplication ────────────────────────────────────────────────────────

const recentNotifications = new Map<string, number>();
/** Hard cap on dedup map size to prevent memory leaks in long-running daemons. */
const MAX_DEDUP_ENTRIES = 10_000;

function shouldSend(notification: ClawNotification): boolean {
  const key = `${notification.type}:${notification.title}`;
  const lastSent = recentNotifications.get(key);
  const now = Date.now();

  if (lastSent && now - lastSent < config.claw.notifyDedupMs) return false;

  recentNotifications.set(key, now);

  // Housekeeping: prune expired entries to prevent unbounded growth
  for (const [k, ts] of recentNotifications) {
    if (now - ts > config.claw.notifyDedupMs) recentNotifications.delete(k);
  }

  // Hard cap: if the map still exceeds the limit after pruning,
  // evict oldest entries to prevent memory leaks
  if (recentNotifications.size > MAX_DEDUP_ENTRIES) {
    const entries = [...recentNotifications.entries()].sort((a, b) => a[1] - b[1]);
    const toRemove = entries.slice(0, recentNotifications.size - MAX_DEDUP_ENTRIES);
    for (const [k] of toRemove) recentNotifications.delete(k);
  }

  return true;
}

// ── Senders ──────────────────────────────────────────────────────────────

async function sendWebhook(notification: ClawNotification, retries = 2): Promise<void> {
  const url = config.claw.webhookUrl;
  if (!url) return;

  const payload = JSON.stringify({
    source: 'whiteshoe-claw',
    ...notification,
    timestamp: new Date().toISOString(),
  });

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok || res.status < 500) return; // success or client error — don't retry
    } catch {
      // Network error or timeout — fall through to retry
    }
    if (attempt < retries) {
      await new Promise(r => setTimeout(r, Math.min(1000 * Math.pow(2, attempt), 30_000)));
    }
  }
  console.warn(`[CLAW] Webhook delivery failed for ${notification.type} after ${retries + 1} attempts`);
}

function sendMacOsNotification(notification: ClawNotification): void {
  if (!config.claw.notifyMacOs) return;
  if (process.platform !== 'darwin') return;

  try {
    // SECURITY: Strip all characters except safe alphanumerics and basic punctuation
    // to prevent command injection via crafted notification content.
    // Using execFileSync with array args avoids shell interpolation entirely.
    const clean = (s: string) => s.replace(/[^a-zA-Z0-9 .,!?_-]/g, '');
    const title = clean(notification.title);
    const message = clean(notification.message);
    execFileSync('osascript', [
      '-e',
      `display notification "${message}" with title "Whiteshoe" subtitle "${title}"`,
    ], { timeout: 3000, stdio: 'ignore' });
  } catch (err) {
    console.warn(`[CLAW] macOS notification failed for ${notification.type}:`, (err as Error).message ?? err);
  }
}

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Send a notification through all configured channels.
 * Fire-and-forget — never blocks, never throws.
 */
export function notify(notification: ClawNotification): void {
  if (!shouldSend(notification)) return;

  // Fire both in parallel, don't await
  sendWebhook(notification).catch(err => console.error('[NOTIFY] Webhook send failed:', err));
  sendMacOsNotification(notification);
}
