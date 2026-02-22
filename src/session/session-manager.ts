/**
 * Session Manager — Creates, tracks, and destroys Shem sessions.
 *
 * For CLI mode: a single session is created and destroyed.
 * For API mode: multiple concurrent sessions, each with isolated state.
 *
 * Production hardening:
 * - TTL-based eviction (4 hours default)
 * - Max session cap (100 default)
 * - Lazy cleanup on createSession()
 */

import { SessionState } from './session-state.js';
import type { GateResolver } from '../gates/gate-resolver.js';
import { archiveSession } from '../db/database.js';

// ── Defaults ──────────────────────────────────────────────────────────
const MAX_SESSIONS = 100;
const SESSION_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

interface SessionEntry {
  session: SessionState;
  createdAt: number;
}

export class SessionManager {
  private sessions = new Map<string, SessionEntry>();

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
    this.sessions.set(session.id, { session, createdAt: Date.now() });

    // Archive to SQLite when session completes
    session.events.on('session_end', () => {
      try {
        const userId = session.userId ?? session.clientIdentity?.id ?? 'anonymous';
        archiveSession(session, userId);
      } catch (err) {
        console.error(`[SESSION] Failed to archive session ${session.id}:`, err);
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
      // Halt running agents before cleanup
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
   * Evict a single session: archive it, halt agents, then remove.
   */
  private evictSession(id: string, entry: SessionEntry): void {
    // Archive before removing listeners so work product is preserved
    try {
      const userId = entry.session.userId ?? entry.session.clientIdentity?.id ?? 'anonymous';
      archiveSession(entry.session, userId);
    } catch (err) {
      console.error(`[SESSION] Failed to archive evicted session ${id}:`, err);
    }
    // Halt any running agents
    if (!entry.session.isHalted()) {
      entry.session.halt('Session evicted (TTL/cap)');
    }
    entry.session.events.stopRecording();
    entry.session.events.removeAllListeners();
    this.sessions.delete(id);
  }

  /**
   * Evict expired sessions (TTL) and enforce max session cap.
   * Called lazily at the start of createSession().
   */
  cleanup(): number {
    const now = Date.now();
    let evicted = 0;

    // Phase 1: TTL eviction
    for (const [id, entry] of this.sessions) {
      if (now - entry.createdAt > SESSION_TTL_MS) {
        this.evictSession(id, entry);
        evicted++;
      }
    }

    // Phase 2: Cap enforcement — remove oldest sessions if still over limit
    if (this.sessions.size >= MAX_SESSIONS) {
      const sorted = [...this.sessions.entries()].sort(
        (a, b) => a[1].createdAt - b[1].createdAt
      );
      const toRemove = sorted.slice(0, this.sessions.size - MAX_SESSIONS + 1);
      for (const [id, entry] of toRemove) {
        this.evictSession(id, entry);
        evicted++;
      }
    }

    if (evicted > 0) {
      console.error(`[SESSION] Cleanup: evicted ${evicted} session(s), ${this.sessions.size} remaining`);
    }

    return evicted;
  }
}
