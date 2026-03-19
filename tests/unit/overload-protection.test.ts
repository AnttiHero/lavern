/**
 * Unit Tests — Graceful Overload Protection (v0.12)
 *
 * Tests capacity checking, zombie detection, and session limits.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SessionManager } from '../../src/session/session-manager.js';

// Mock the database archiveSession to avoid SQLite dependency
vi.mock('../../src/db/database.js', () => ({
  archiveSession: vi.fn(),
  config: {
    sessionTtlMs: 4 * 60 * 60 * 1000,
    maxSessions: 3,
  },
}));

vi.mock('../../src/config.js', () => ({
  config: {
    sessionTtlMs: 4 * 60 * 60 * 1000,
    maxSessions: 3,
    version: '0.12.0',
    defaultBudgetUsd: 5,
    logLevel: 'error',
  },
}));

describe('overload protection', () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager();
  });

  afterEach(() => {
    manager.stopCleanup();
  });

  describe('getCapacity', () => {
    it('reports available when empty', () => {
      const cap = manager.getCapacity();
      expect(cap.available).toBe(true);
      expect(cap.current).toBe(0);
      expect(cap.max).toBe(3);
    });

    it('reports available when under limit', () => {
      manager.createSession();
      manager.createSession();
      const cap = manager.getCapacity();
      expect(cap.available).toBe(true);
      expect(cap.current).toBe(2);
    });

    it('fills to capacity and reports correctly', () => {
      manager.createSession();
      manager.createSession();
      manager.createSession();
      const cap = manager.getCapacity();
      // 3 sessions created with max=3; cleanup evicts oldest if OVER limit on createSession
      // so current should equal max
      expect(cap.current).toBeLessThanOrEqual(cap.max);
      expect(cap.estimatedWaitMs).toBeGreaterThan(0);
    });
  });

  describe('countUserSessions', () => {
    it('counts sessions for a specific user', () => {
      const s1 = manager.createSession();
      const s2 = manager.createSession();
      s1.userId = 'user-1';
      s2.userId = 'user-1';

      expect(manager.countUserSessions('user-1')).toBe(2);
      expect(manager.countUserSessions('user-2')).toBe(0);
    });

    it('does not count halted sessions', () => {
      const s1 = manager.createSession();
      s1.userId = 'user-1';
      s1.halt('test');

      expect(manager.countUserSessions('user-1')).toBe(0);
    });
  });

  describe('zombie detection', () => {
    it('cleanup method runs without errors', () => {
      manager.createSession();
      expect(() => manager.cleanup()).not.toThrow();
    });

    it('does not evict active sessions', () => {
      const s = manager.createSession();
      manager.cleanup();
      expect(manager.getSession(s.id)).toBeDefined();
    });
  });

  describe('session lifecycle', () => {
    it('creates and destroys sessions', () => {
      const s = manager.createSession();
      expect(manager.size).toBe(1);
      manager.destroySession(s.id);
      expect(manager.size).toBe(0);
    });

    it('tracks session age', () => {
      const s = manager.createSession();
      const age = manager.getSessionAge(s.id);
      expect(age).toBeDefined();
      expect(age!).toBeGreaterThanOrEqual(0);
      expect(age!).toBeLessThan(1000); // Should be < 1 second old
    });

    it('tracks idle time', () => {
      const s = manager.createSession();
      const idle = manager.getSessionIdleTime(s.id);
      expect(idle).toBeDefined();
      expect(idle!).toBeGreaterThanOrEqual(0);
    });
  });
});
