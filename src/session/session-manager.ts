/**
 * Session Manager — Creates, tracks, and destroys Shem sessions.
 *
 * For CLI mode: a single session is created and destroyed.
 * For API mode: multiple concurrent sessions, each with isolated state.
 *
 * Production hardening:
 * - TTL-based eviction (4 hours default)
 * - Max session cap (100 default)
 * - Lazy cleanup on createSession() + periodic sweep (every 5 min)
 * - 5-minute WebSocket warning before timeout
 * - Stale sessions marked as 'failed' with timeout reason
 */

import { SessionState } from './session-state.js';
import type { GateResolver } from '../gates/gate-resolver.js';
import { archiveSession, releaseHold } from '../db/database.js';
import { config } from '../config.js';
import { createLogger } from '../utils/logger.js';
import { captureError } from '../utils/sentry.js';

const log = createLogger('SESSION');

/** How often to run the background cleanup sweep (ms). */
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/** How long before TTL to send a warning via WebSocket (ms). */
const TTL_WARNING_MS = 5 * 60 * 1000; // 5-minute warning

interface SessionEntry {
  session: SessionState;
  createdAt: number;
  lastActivityAt: number;
  archived: boolean;
  ttlWarned: boolean;
}

export class SessionManager {
  private sessions = new Map<string, SessionEntry>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  /** Re-entrancy guard: prevents recursive cleanup calls (e.g., eviction → session_end → createSession → cleanup). */
  private cleaning = false;

  constructor() {
    // Start periodic cleanup sweep
    this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS);
    this.cleanupTimer.unref(); // Don't keep the process alive
  }

  createSession(options?: {
    id?: string;
    gateResolver?: GateResolver;
    budgetUsd?: number;
    auditDir?: string;
    memoryDir?: string;
  }): SessionState {
    // Lazy cleanup before creating a new session
    this.cleanup();

    const session = new SessionState(options?.id, options);
    const now = Date.now();
    const entry: SessionEntry = { session, createdAt: now, lastActivityAt: now, archived: false, ttlWarned: false };
    this.sessions.set(session.id, entry);

    // Track activity: any event means the session is alive
    session.events.on('event', () => {
      entry.lastActivityAt = Date.now();
      // Reset TTL warning so it can fire again if session goes idle later
      entry.ttlWarned = false;
    });

    // Archive to SQLite when session completes (guard against double archival)
    session.events.on('session_end', () => {
      if (entry.archived) return;
      entry.archived = true;
      try {
        const userId = session.userId ?? session.clientIdentity?.id ?? null;
        archiveSession(session, userId);
      } catch (err) {
        log.error(`[SESSION] Failed to archive session ${session.id}:`, err);
        // Report to Sentry: archive failure means the completed session's
        // findings/assembly/debate are lost, and any billable-hours hold is
        // stuck. Both are data-loss / billing-integrity events that ops must
        // see. The session_end listener can't release the hold (no guarantee
        // a session_end path holds one), so we surface loudly instead.
        captureError(err, { sessionId: session.id, phase: 'session_end_archive' });
      }
    });

    return session;
  }

  getSession(id: string): SessionState | undefined {
    const entry = this.sessions.get(id);
    return entry?.session;
  }

  getAllSessions(): SessionState[] {
    return [...this.sessions.values()].map(e => e.session);
  }

  destroySession(id: string, reason?: string): boolean {
    const entry = this.sessions.get(id);
    if (entry) {
      // Archive before removing listeners so work product is preserved
      // (halt() emits 'error' not 'session_end', so the event listener
      // in createSession() may never fire — archive explicitly like evictSession())
      if (!entry.archived) {
        entry.archived = true;
        try {
          const userId = entry.session.userId ?? entry.session.clientIdentity?.id ?? null;
          archiveSession(entry.session, userId);
        } catch (err) {
          log.error(`[SESSION] Failed to archive destroyed session ${id}:`, err);
          captureError(err, { sessionId: id, phase: 'destroy_archive' });
          // Safety net: if archive transaction rolled back, the hold is still locked.
          // Release it to prevent the user's billable hours from being permanently frozen.
          try { releaseHold(id); } catch (releaseErr) {
            // A failure here is worse than the archive miss: the user's
            // balance is now frozen. Report so ops can unlock manually.
            captureError(releaseErr, { sessionId: id, phase: 'destroy_release_hold' });
          }
        }
      }
      // Halt running agents
      if (!entry.session.isHalted()) {
        entry.session.halt(reason ?? 'Session destroyed');
      }
      entry.session.events.stopRecording();
      entry.session.events.removeAllListeners();
      this.sessions.delete(id);
      return true;
    }
    return false;
  }

  get size(): number {
    return this.sessions.size;
  }

  /**
   * Get session age in milliseconds (for diagnostics).
   */
  getSessionAge(id: string): number | undefined {
    const entry = this.sessions.get(id);
    return entry ? Date.now() - entry.createdAt : undefined;
  }

  /**
   * Get time since last activity for a session (ms).
   */
  getSessionIdleTime(id: string): number | undefined {
    const entry = this.sessions.get(id);
    return entry ? Date.now() - entry.lastActivityAt : undefined;
  }

  /**
   * Stop the periodic cleanup timer (for graceful shutdown).
   */
  stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Evict a single session: archive it, halt agents, then remove.
   */
  private evictSession(id: string, entry: SessionEntry, reason: string): void {
    // Emit timeout event so WebSocket clients get notified
    if (!entry.session.isHalted()) {
      entry.session.events.emitEvent({
        type: 'error',
        message: `Session timed out: ${reason}`,
        source: 'session-manager',
        timestamp: new Date().toISOString(),
      });
    }

    // If assembly is running, don't evict — reset the activity timer instead
    // so the session stays alive until assembly completes.
    if (entry.session.isAssembling) {
      entry.lastActivityAt = Date.now();
      return;
    }

    // Archive before removing listeners so work product is preserved (guard against double archival)
    if (!entry.archived) {
      entry.archived = true;
      try {
        const userId = entry.session.userId ?? entry.session.clientIdentity?.id ?? null;
        archiveSession(entry.session, userId);
      } catch (err) {
        log.error(`[SESSION] Failed to archive evicted session ${id}:`, err);
        captureError(err, { sessionId: id, phase: 'evict_archive', reason });
        // Safety net: if archive transaction rolled back, the hold is still locked.
        // Release it to prevent the user's billable hours from being permanently frozen.
        try { releaseHold(id); } catch (releaseErr) {
          captureError(releaseErr, { sessionId: id, phase: 'evict_release_hold' });
        }
      }
    }
    // Halt any running agents
    if (!entry.session.isHalted()) {
      entry.session.halt(reason);
    }
    entry.session.events.stopRecording();
    entry.session.events.removeAllListeners();
    this.sessions.delete(id);
  }

  /**
   * Evict expired sessions (TTL) and enforce max session cap.
   * Called lazily at the start of createSession() and periodically by timer.
   */
  cleanup(): number {
    // Re-entrancy guard: if cleanup triggers a session_end event that eventually
    // calls createSession (which calls cleanup again), skip the nested call.
    if (this.cleaning) return 0;
    this.cleaning = true;

    const now = Date.now();
    let evicted = 0;

    try {
      // Phase 0: Send TTL warnings to sessions approaching timeout
      // Uses lastActivityAt so active sessions don't get premature warnings
      for (const [, entry] of this.sessions) {
        if (entry.ttlWarned) continue;
        const idleTime = now - entry.lastActivityAt;
        const ttlRemaining = config.sessionTtlMs - idleTime;
        if (ttlRemaining > 0 && ttlRemaining <= TTL_WARNING_MS) {
          entry.ttlWarned = true;
          const minutesLeft = Math.ceil(ttlRemaining / 60000);
          entry.session.events.emitEvent({
            type: 'error',
            message: `Session will timeout in ${minutesLeft} minute${minutesLeft === 1 ? '' : 's'} of inactivity. Save your work.`,
            source: 'session-manager',
            timestamp: new Date().toISOString(),
          });
        }
      }

      // Phase 1: TTL eviction — evict sessions idle longer than TTL
      // Uses lastActivityAt so active sessions stay alive regardless of creation time
      const expired: [string, SessionEntry][] = [];
      for (const [id, entry] of this.sessions) {
        if (now - entry.lastActivityAt > config.sessionTtlMs) {
          expired.push([id, entry]);
        }
      }
      for (const [id, entry] of expired) {
        const idle = Math.round((now - entry.lastActivityAt) / 60000);
        this.evictSession(id, entry, `Session idle for ${idle} minutes (TTL: ${config.sessionTtlMs / 60000}min)`);
        evicted++;
      }

      // Phase 2: Cap enforcement — remove least recently active sessions if still over limit
      if (this.sessions.size > config.maxSessions) {
        const sorted = [...this.sessions.entries()].sort(
          (a, b) => a[1].lastActivityAt - b[1].lastActivityAt
        );
        const excess = this.sessions.size - config.maxSessions;
        const toRemove = sorted.slice(0, excess);
        for (const [id, entry] of toRemove) {
          this.evictSession(id, entry, `Session evicted (cap: ${config.maxSessions})`);
          evicted++;
        }
      }

      // Phase 3: Zombie detection — terminate sessions idle 15+ minutes in working phase
      const ZOMBIE_IDLE_MS = 15 * 60 * 1000;
      for (const [id, entry] of this.sessions) {
        if (entry.archived) continue;
        const idleMs = now - entry.lastActivityAt;
        if (idleMs > ZOMBIE_IDLE_MS && !entry.session.isHalted()) {
          // Only terminate if session has started (has events) but went quiet
          if (entry.session.events.getEventLog().length > 0) {
            log.info(`[SESSION] Zombie detected: ${id} idle ${Math.round(idleMs / 60000)}min — terminating`);
            this.evictSession(id, entry, `Zombie session: idle ${Math.round(idleMs / 60000)} minutes`);
            evicted++;
          }
        }
      }

      if (evicted > 0) {
        log.info(`[SESSION] Cleanup: evicted ${evicted} session(s), ${this.sessions.size} remaining`);
      }
    } finally {
      this.cleaning = false;
    }

    return evicted;
  }

  /** Check if the server has capacity for a new session. */
  getCapacity(): { current: number; max: number; available: boolean; estimatedWaitMs: number } {
    const current = this.sessions.size;
    const max = config.maxSessions;
    const available = current < max;

    // Estimate wait based on average session duration from active sessions
    let estimatedWaitMs = 5 * 60 * 1000; // Default: 5 minutes
    if (!available && current > 0) {
      // Find the oldest active session's age as a rough estimate
      let oldestAge = 0;
      for (const [, entry] of this.sessions) {
        const age = Date.now() - entry.createdAt;
        if (age > oldestAge) oldestAge = age;
      }
      // Rough estimate: oldest session is ~halfway done
      estimatedWaitMs = Math.max(60_000, Math.min(oldestAge / 2, 30 * 60 * 1000));
    }

    return { current, max, available, estimatedWaitMs };
  }

  /** Count sessions for a specific user. */
  countUserSessions(userId: string): number {
    let count = 0;
    for (const [, entry] of this.sessions) {
      if (!entry.session.isHalted()) {
        const uid = entry.session.userId ?? entry.session.clientIdentity?.id;
        if (uid === userId) count++;
      }
    }
    return count;
  }
}
