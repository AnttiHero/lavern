/**
 * Telegram Notification Sender — Push alerts to a Telegram chat.
 *
 * Sends plain-text messages to a Telegram bot chat.
 * Requires LAVERN_CLAW_TELEGRAM_TOKEN and LAVERN_CLAW_TELEGRAM_CHAT_ID.
 *
 * Fire-and-forget — never blocks document processing.
 */

import { config } from '../config.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('NOTIFY-TELEGRAM');

/**
 * Send a message to the configured Telegram chat.
 * No-op if Telegram is not configured.
 */
export async function sendTelegramMessage(text: string): Promise<void> {
  const token = config.claw.telegramToken;
  const chatId = config.claw.telegramChatId;

  if (!token || !chatId) return;

  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      logger.warn('Telegram send failed', { status: res.status, body: body.slice(0, 200) });
    }
  } catch (err) {
    logger.warn('Telegram send error', { error: err });
  }
}

/**
 * Format a Claw notification for Telegram.
 */
export function formatTelegramAlert(title: string, message: string): string {
  return `*${escapeMarkdown(title)}*\n${escapeMarkdown(message)}`;
}

/** Escape Telegram Markdown v1 special characters. */
function escapeMarkdown(text: string): string {
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
}
