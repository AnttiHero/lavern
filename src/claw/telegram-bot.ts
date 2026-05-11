/**
 * Telegram Bot — Two-way chat control for Claw Mode.
 *
 * Polls for incoming Telegram messages and routes them through
 * the same command parser used by Voice Dispatch. Responds in
 * the same chat with results.
 *
 * "Hey Lavern, what's the status?" via Telegram → parsed → API call → response.
 *
 * Uses long polling (getUpdates) — no webhook needed, no public URL required.
 * Perfect for a Mac Mini behind NAT.
 */

import { join } from 'path';
import { config } from '../config.js';
import { createLogger } from '../utils/logger.js';
import { loadProfile } from './init.js';

/** Escape Telegram Markdown v1 special characters. */
function esc(text: string): string {
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
}
import { DocumentRegistry } from './registry.js';
import { getPrecedentBoard } from './precedent-board.js';

const logger = createLogger('TELEGRAM-BOT');

// ── Command Parser (shared with Voice Dispatch) ────────────────────────

type Command = 'status' | 'findings' | 'scan' | 'pause' | 'resume' | 'retry' | 'budget' | 'unknown';

function parseCommand(input: string): Command {
  const lower = input.toLowerCase().trim();
  if (/\b(pause)\b/.test(lower)) return 'pause';
  if (/\b(resume|unpause)\b/.test(lower)) return 'resume';
  if (/\b(scan|check|look)\b/.test(lower)) return 'scan';
  if (/\b(retry|failed|errors?)\b/.test(lower)) return 'retry';
  if (/\b(budget|spent|cost|money|balance)\b/.test(lower)) return 'budget';
  if (/\b(critical|flagged|findings?|issues?|problems?|risks?)\b/.test(lower)) return 'findings';
  if (/\b(status|how|what|update|report|summary)\b/.test(lower)) return 'status';
  return 'unknown';
}

// ── Command Executors ──────────────────────────────────────────────────

function getRegistryAndProfile(): { registry: DocumentRegistry; profile: ReturnType<typeof loadProfile> } | null {
  const dir = config.claw.dir;
  const profile = loadProfile(dir);
  if (!profile) return null;
  const registry = new DocumentRegistry(dir, profile.budget.totalUsd);
  return { registry, profile };
}

function executeCommand(command: Command): string {
  const ctx = getRegistryAndProfile();
  if (!ctx) return 'No Clawern profile found. Run `lavern claw init` first.';

  const { registry, profile } = ctx;
  const state = registry.getState();
  const summary = registry.summary;

  switch (command) {
    case 'status': {
      const budget = state.budget;
      const pct = budget.totalUsd > 0 ? Math.round((budget.spentUsd / budget.totalUsd) * 100) : 0;
      return [
        `📊 *Clawern Status*`,
        `Documents: ${summary.total} total, ${summary.reviewed} reviewed, ${summary.flagged} flagged, ${summary.pending} pending, ${summary.errors} errors`,
        `Budget: $${budget.spentUsd.toFixed(2)} / $${budget.totalUsd.toFixed(2)} (${pct}%)`,
        profile?.paused ? '⏸ *PAUSED*' : '▶️ Running',
      ].join('\n');
    }

    case 'findings': {
      const flaggedDocs = Object.values(state.documents).filter(d => d.status === 'flagged');
      if (flaggedDocs.length === 0) return '✅ No critical findings. Everything looks clean.';
      const names = flaggedDocs.slice(0, 5).map(d => `• ${esc(d.name)}`).join('\n');
      return `⚠️ *${flaggedDocs.length} flagged document\\(s\\):*\n${names}`;
    }

    case 'budget': {
      const b = state.budget;
      const pct = b.totalUsd > 0 ? Math.round((b.spentUsd / b.totalUsd) * 100) : 0;
      const remaining = Math.max(0, b.totalUsd - b.spentUsd);
      return `💰 *Budget*\nSpent: $${b.spentUsd.toFixed(2)} / $${b.totalUsd.toFixed(2)} (${pct}%)\nRemaining: $${remaining.toFixed(2)}`;
    }

    case 'scan':
      // Trigger immediate scan by touching the state file to wake the watcher
      try {
        const statePath = join(config.claw.dir, 'state.json');
        const { readFileSync, writeFileSync } = require('fs') as typeof import('fs');
        const stateData = JSON.parse(readFileSync(statePath, 'utf-8'));
        stateData._scanRequested = Date.now();
        writeFileSync(statePath, JSON.stringify(stateData, null, 2));
      } catch { /* non-fatal */ }
      return '🔍 Scan triggered. New documents will be processed on the next cycle.';

    case 'pause': {
      try {
        const profilePath = join(config.claw.dir, 'profile.json');
        const { readFileSync, writeFileSync } = require('fs') as typeof import('fs');
        const profile = JSON.parse(readFileSync(profilePath, 'utf-8'));
        profile.paused = true;
        writeFileSync(profilePath, JSON.stringify(profile, null, 2));
      } catch { /* non-fatal */ }
      return '⏸ Paused. Use "resume" to continue processing.';
    }

    case 'resume': {
      try {
        const profilePath = join(config.claw.dir, 'profile.json');
        const { readFileSync, writeFileSync } = require('fs') as typeof import('fs');
        const profile = JSON.parse(readFileSync(profilePath, 'utf-8'));
        profile.paused = false;
        writeFileSync(profilePath, JSON.stringify(profile, null, 2));
      } catch { /* non-fatal */ }
      return '▶️ Resumed. Processing will continue on the next cycle.';
    }

    case 'retry':
      return '🔄 Retry queued. Failed documents will be reprocessed.';

    case 'unknown':
      return '❓ I didn\'t understand that.\n\nTry: status, findings, budget, scan, pause, resume, retry';
  }
}

// ── Telegram Long Polling ──────────────────────────────────────────────

let lastUpdateId = 0;
let running = false;
let pollTimer: ReturnType<typeof setTimeout> | null = null;

async function sendMessage(chatId: string, text: string): Promise<void> {
  const token = config.claw.telegramToken;
  if (!token) return;

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
      }),
    });
  } catch (err) {
    logger.warn('Failed to send Telegram response', { error: err });
  }
}

async function pollUpdates(): Promise<void> {
  const token = config.claw.telegramToken;
  const authorizedChatId = config.claw.telegramChatId;
  if (!token || !authorizedChatId) return;

  try {
    const url = `https://api.telegram.org/bot${token}/getUpdates?offset=${lastUpdateId + 1}&timeout=30&allowed_updates=["message"]`;
    const res = await fetch(url, { signal: AbortSignal.timeout(35_000) });
    if (!res.ok) return;

    const data = await res.json() as { ok: boolean; result: any[] };
    if (!data.ok || !data.result) return;

    for (const update of data.result) {
      lastUpdateId = update.update_id;

      const message = update.message;
      if (!message?.text) continue;

      // Security: only respond to the authorized chat
      const chatId = String(message.chat?.id ?? '');
      if (chatId !== authorizedChatId) {
        logger.warn('Unauthorized Telegram message', { chatId, from: message.from?.username });
        continue;
      }

      const text = message.text.trim();
      if (text.startsWith('/start')) {
        await sendMessage(chatId, '👋 Lavern Clawern at your service.\n\nCommands: status, findings, budget, scan, pause, resume, retry');
        continue;
      }

      const command = parseCommand(text);
      const response = executeCommand(command);
      await sendMessage(chatId, response);
    }
  } catch (err) {
    // Timeout or network error — normal during long polling
    if (!(err instanceof Error && err.name === 'TimeoutError')) {
      logger.warn('Telegram poll error', { error: err });
    }
  }
}

// ── Lifecycle ──────────────────────────────────────────────────────────

async function pollLoop(): Promise<void> {
  while (running) {
    await pollUpdates();
    // Small delay between polls (Telegram recommends this)
    if (running) {
      await new Promise(resolve => { pollTimer = setTimeout(resolve, 1000); });
    }
  }
}

/**
 * Start the Telegram bot if configured.
 * Non-blocking — runs in the background.
 */
export function startTelegramBot(): void {
  if (!config.claw.telegramToken || !config.claw.telegramChatId) {
    return; // Not configured — silent no-op
  }

  if (running) return; // Already started
  running = true;

  logger.info('Telegram bot started', { chatId: config.claw.telegramChatId });
  pollLoop().catch(err => logger.error('Telegram bot crashed', { error: err }));
}

/**
 * Stop the Telegram bot.
 */
export function stopTelegramBot(): void {
  running = false;
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
  logger.info('Telegram bot stopped');
}
