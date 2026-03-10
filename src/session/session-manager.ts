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
import { config } from '../config.js';

interface SessionEntry {
  session: SessionState;
  createdAt: number;
  archived: boolean;
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
    const entry: SessionEntry = { session, createdAt: Date.now(), archived: false };
    this.sessions.set(session.id, entry);

    // Archive to SQLite when session completes (guard against double archival)
    session.events.on('session_end', () => {
      if (entry.archived) return;
      entry.archived = true;
      try {
        const userId = session.userId ?? session.clientIdentity?.id ?? null;
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
      // Halt running agents — fires session_end which triggers archival via event listener
      if (!entry.session.isHalted()) {
        entry.session.halt(reason ?? 'Session destroyed');
      }
      // Archival handled by session_end listener in createSession(). No duplicate call here.
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
    // Archive before removing listeners so work product is preserved (guard against double archival)
    if (!entry.archived) {
      entry.archived = true;
      try {
        const userId = entry.session.userId ?? entry.session.clientIdentity?.id ?? null;
        archiveSession(entry.session, userId);
      } catch (err) {
        console.error(`[SESSION] Failed to archive evicted session ${id}:`, err);
      }
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

    // Phase 1: TTL eviction (collect first to avoid modifying map during iteration)
    const expired: [string, SessionEntry][] = [];
    for (const [id, entry] of this.sessions) {
      if (now - entry.createdAt > config.sessionTtlMs) {
        expired.push([id, entry]);
      }
    }
    for (const [id, entry] of expired) {
      this.evictSession(id, entry);
      evicted++;
    }

    // Phase 2: Cap enforcement — remove oldest sessions if still over limit
    if (this.sessions.size >= config.maxSessions) {
      const sorted = [...this.sessions.entries()].sort(
        (a, b) => a[1].createdAt - b[1].createdAt
      );
      const excess = Math.max(1, this.sessions.size - config.maxSessions);
      const toRemove = sorted.slice(0, excess);
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
