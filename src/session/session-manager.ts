/**
 * Session Manager — Creates, tracks, and destroys Shem sessions.
 *
 * For CLI mode: a single session is created and destroyed.
 * For API mode: multiple concurrent sessions, each with isolated state.
 */

import { SessionState } from './session-state.js';
import type { GateResolver } from '../gates/gate-resolver.js';

export class SessionManager {
  private sessions = new Map<string, SessionState>();

  createSession(options?: {
    id?: string;
    gateResolver?: GateResolver;
    budgetUsd?: number;
    auditDir?: string;
    memoryDir?: string;
  }): SessionState {
    const session = new SessionState(options?.id, options);
    this.sessions.set(session.id, session);
    return session;
  }

  getSession(id: string): SessionState | undefined {
    return this.sessions.get(id);
  }

  getAllSessions(): SessionState[] {
    return [...this.sessions.values()];
  }

  destroySession(id: string): boolean {
    const session = this.sessions.get(id);
    if (session) {
      session.events.stopRecording();
      session.events.removeAllListeners();
      this.sessions.delete(id);
      return true;
    }
    return false;
  }

  get size(): number {
    return this.sessions.size;
  }
}
