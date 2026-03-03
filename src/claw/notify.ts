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

import { execSync } from 'node:child_process';
import { config } from '../config.js';

// ── Types ────────────────────────────────────────────────────────────────

export type ClawNotificationType =
  | 'budget_warning'
  | 'budget_exhausted'
  | 'document_failed'
  | 'document_flagged'
  | 'document_confidential'
  | 'daemon_error';

export interface ClawNotification {
  type: ClawNotificationType;
  title: string;
  message: string;
  details?: Record<string, unknown>;
}

// ── Deduplication ────────────────────────────────────────────────────────

const recentNotifications = new Map<string, number>();

function shouldSend(notification: ClawNotification): boolean {
  const key = `${notification.type}:${notification.title}`;
  const lastSent = recentNotifications.get(key);
  const now = Date.now();

  if (lastSent && now - lastSent < config.claw.notifyDedupMs) return false;

  recentNotifications.set(key, now);

  // Housekeeping: clean up old entries
  if (recentNotifications.size > 200) {
    for (const [k, ts] of recentNotifications) {
      if (now - ts > config.claw.notifyDedupMs) recentNotifications.delete(k);
    }
  }

  return true;
}

// ── Senders ──────────────────────────────────────────────────────────────

async function sendWebhook(notification: ClawNotification): Promise<void> {
  const url = config.claw.webhookUrl;
  if (!url) return;

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'marble-claw',
        ...notification,
        timestamp: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Fire-and-forget — log but don't block
    console.warn(`[CLAW] Webhook delivery failed for ${notification.type}`);
  }
}

function sendMacOsNotification(notification: ClawNotification): void {
  if (!config.claw.notifyMacOs) return;
  if (process.platform !== 'darwin') return;

  try {
    const title = notification.title.replace(/"/g, '\\"');
    const message = notification.message.replace(/"/g, '\\"');
    execSync(
      `osascript -e 'display notification "${message}" with title "Marble" subtitle "${title}"'`,
      { timeout: 3000, stdio: 'ignore' },
    );
  } catch {
    // Non-fatal — osascript may not be available
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
  sendWebhook(notification).catch(() => {});
  sendMacOsNotification(notification);
}
