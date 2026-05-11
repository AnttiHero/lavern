/**
 * Mass-Action Guard — Detects bulk legal document generation patterns.
 *
 * Flags when a user creates many sessions with the same workflow template
 * or similar request text in a short window. This prevents abuse like
 * mass-generating demand letters or cease-and-desist notices.
 *
 * In-memory tracking only — no persistence. Entries are cleaned up
 * periodically and hard-capped per user to prevent memory leaks.
 */

export interface MassActionConfig {
  /** Max sessions with same template in window before flagging (default: 10) */
  templateThreshold: number;
  /** Max sessions with similar request text in window before flagging (default: 5) */
  similarRequestThreshold: number;
  /** Time window in ms (default: 1 hour) */
  windowMs: number;
  /** Action on detection: 'flag' adds warning to session, 'block' returns 429 (default: 'flag') */
  action: 'flag' | 'block';
}

export interface MassActionResult {
  allowed: boolean;
  flagged: boolean;
  reason?: string;
  templateCount?: number;
  similarCount?: number;
}

interface SessionEvent {
  timestamp: number;
  templateId: string;
  requestFingerprint: string;
}

/** Max entries per user to prevent memory leaks. */
const MAX_ENTRIES_PER_USER = 1000;

/** Normalize request text into a fingerprint for similarity matching.
 *  Uses a hash of the full normalized text to avoid truncation bypass. */
import { createHash } from 'crypto';

function fingerprint(text: string): string {
  if (!text) return '';
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  return createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

import { config } from '../../config.js';

function resolveConfig(partial?: Partial<MassActionConfig>): MassActionConfig {
  return {
    templateThreshold: partial?.templateThreshold ?? config.massAction.threshold,
    similarRequestThreshold: partial?.similarRequestThreshold ?? 5,
    windowMs: partial?.windowMs ?? config.massAction.windowMs,
    action: partial?.action ?? (config.massAction.mode === 'block' ? 'block' : 'flag'),
  };
}

export function createMassActionGuard(partialConfig?: Partial<MassActionConfig>) {
  const cfg = resolveConfig(partialConfig);
  const tracker = new Map<string, SessionEvent[]>();

  function evictOld(events: SessionEvent[], now: number): SessionEvent[] {
    // Remove entries older than 2x window
    const cutoff = now - cfg.windowMs * 2;
    return events.filter((e) => e.timestamp > cutoff);
  }

  function check(
    userId: string,
    templateId: string,
    requestText: string,
  ): MassActionResult {
    const now = Date.now();
    const fp = fingerprint(requestText ?? '');

    // Get or create user events
    let events = tracker.get(userId) ?? [];

    // Evict stale entries
    events = evictOld(events, now);

    // Record the new event
    events.push({ timestamp: now, templateId, requestFingerprint: fp });

    // Hard cap
    if (events.length > MAX_ENTRIES_PER_USER) {
      events = events.slice(events.length - MAX_ENTRIES_PER_USER);
    }

    tracker.set(userId, events);

    // Count events in the active window
    const windowStart = now - cfg.windowMs;
    const windowEvents = events.filter((e) => e.timestamp > windowStart);

    const templateCount = windowEvents.filter(
      (e) => e.templateId === templateId,
    ).length;

    const similarCount =
      fp !== ''
        ? windowEvents.filter((e) => e.requestFingerprint === fp).length
        : 0;

    // Check thresholds
    const templateExceeded = templateCount > cfg.templateThreshold;
    const similarExceeded =
      similarCount > cfg.similarRequestThreshold && fp !== '';

    if (templateExceeded || similarExceeded) {
      const reasons: string[] = [];
      if (templateExceeded) {
        reasons.push(
          `${templateCount} sessions with template '${templateId}' in ${cfg.windowMs / 60_000}min (threshold: ${cfg.templateThreshold})`,
        );
      }
      if (similarExceeded) {
        reasons.push(
          `${similarCount} sessions with similar request text in ${cfg.windowMs / 60_000}min (threshold: ${cfg.similarRequestThreshold})`,
        );
      }

      return {
        allowed: cfg.action !== 'block',
        flagged: true,
        reason: reasons.join('; '),
        templateCount,
        similarCount,
      };
    }

    return {
      allowed: true,
      flagged: false,
      templateCount,
      similarCount,
    };
  }

  /** Remove all entries older than 2x window for every user. Remove empty users. */
  function cleanup(): void {
    const now = Date.now();
    for (const [userId, events] of tracker) {
      const cleaned = evictOld(events, now);
      if (cleaned.length === 0) {
        tracker.delete(userId);
      } else {
        tracker.set(userId, cleaned);
      }
    }
  }

  return { check, cleanup };
}
