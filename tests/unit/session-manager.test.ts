/**
 * Unit Tests — Session Manager (src/session/session-manager.ts)
 *
 * Tests:
 * - Session creation (ID assignment, budget, options)
 * - Session retrieval and listing
 * - Session destruction (halt, event cleanup)
 * - TTL-based eviction
 * - Max session cap enforcement
 * - Lazy cleanup on createSession()
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SessionManager } from '../../src/session/session-manager.js';

// Mock archiveSession to avoid needing a real database
vi.mock('../../src/db/database.js', () => ({
  archiveSession: vi.fn(),
}));

// Mock config for controllable TTL and session cap
vi.mock('../../src/config.js', () => ({
  config: {
    sessionTtlMs: 10_000,   // 10 seconds (short for testing)
    maxSessions: 5,          // low cap for testing
    auditDir: './audit-logs',
    memoryDir: '.shem/memory',
    reportsDir: '.shem/reports',
    baselinesDir: '.shem/baselines',
    defaultBudgetUsd: 5.0,
    port: 3000,
    host: '0.0.0.0',
    corsOrigins: '*',
    baseUrl: 'http://localhost:3000',
    trustProxy: false,
    defaultModel: 'claude-opus-4-7',
    routerModel: 'claude-sonnet-4-5',
    logLevel: 'info',
    version: '0.8.1',
  },
}));

describe('SessionManager', () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Creation ────────────────────────────────────────────────────────────

  describe('createSession', () => {
    it('should create a session with auto-generated ID', () => {
      const session = manager.createSession();
      expect(session.id).toMatch(/^shem-/);
      expect(manager.size).toBe(1);
    });

    it('should create a session with a custom ID', () => {
      const session = manager.createSession({ id: 'test-session-1' });
      expect(session.id).toBe('test-session-1');
    });

    it('should create a session with custom budget', () => {
      const session = manager.createSession({ budgetUsd: 25.0 });
      expect(session.budgetUsd).toBe(25.0);
    });

    it('should create multiple concurrent sessions', () => {
      manager.createSession({ id: 'a' });
      manager.createSession({ id: 'b' });
      manager.createSession({ id: 'c' });
      expect(manager.size).toBe(3);
    });

    it('should trigger lazy cleanup on creation', () => {
      // Fill to capacity
      for (let i = 0; i < 5; i++) {
        manager.createSession({ id: `s-${i}` });
      }
      expect(manager.size).toBe(5);

      // Creating one more pushes past cap (cleanup runs before creation,
      // but at exactly cap it doesn't evict — only when exceeding cap)
      const newest = manager.createSession({ id: 'overflow' });
      expect(manager.size).toBe(6); // Temporarily over cap
      expect(manager.getSession('overflow')).toBe(newest);

      // Next creation triggers cleanup which evicts the excess
      const newest2 = manager.createSession({ id: 'overflow2' });
      expect(manager.size).toBeLessThanOrEqual(6);
      expect(manager.getSession('overflow2')).toBe(newest2);
    });
  });

  // ── Retrieval ─────────────────────────────────────────────────────────

  describe('getSession', () => {
    it('should return a session by ID', () => {
      const session = manager.createSession({ id: 'lookup-test' });
      expect(manager.getSession('lookup-test')).toBe(session);
    });

    it('should return undefined for unknown ID', () => {
      expect(manager.getSession('nonexistent')).toBeUndefined();
    });
  });

  describe('getAllSessions', () => {
    it('should return empty array when no sessions exist', () => {
      expect(manager.getAllSessions()).toEqual([]);
    });

    it('should return all active sessions', () => {
      manager.createSession({ id: 'x' });
      manager.createSession({ id: 'y' });
      const all = manager.getAllSessions();
      expect(all).toHaveLength(2);
      expect(all.map(s => s.id).sort()).toEqual(['x', 'y']);
    });
  });

  // ── Destruction ───────────────────────────────────────────────────────

  describe('destroySession', () => {
    it('should destroy a session and return true', () => {
      manager.createSession({ id: 'destroy-me' });
      expect(manager.destroySession('destroy-me')).toBe(true);
      expect(manager.getSession('destroy-me')).toBeUndefined();
      expect(manager.size).toBe(0);
    });

    it('should return false for unknown session ID', () => {
      expect(manager.destroySession('nonexistent')).toBe(false);
    });

    it('should halt the session on destruction', () => {
      const session = manager.createSession({ id: 'halt-test' });
      expect(session.isHalted()).toBe(false);
      manager.destroySession('halt-test', 'User cancelled');
      expect(session.isHalted()).toBe(true);
    });

    it('should not double-halt an already halted session', () => {
      const session = manager.createSession({ id: 'double-halt' });
      session.halt('Manual halt');
      expect(session.isHalted()).toBe(true);

      // destroySession should not throw when session is already halted
      expect(manager.destroySession('double-halt')).toBe(true);
    });
  });

  // ── Session Age ───────────────────────────────────────────────────────

  describe('getSessionAge', () => {
    it('should return 0 for a freshly created session', () => {
      manager.createSession({ id: 'age-test' });
      const age = manager.getSessionAge('age-test');
      expect(age).toBe(0);
    });

    it('should return elapsed time after advancing the clock', () => {
      manager.createSession({ id: 'age-elapsed' });
      vi.advanceTimersByTime(5000);
      const age = manager.getSessionAge('age-elapsed');
      expect(age).toBe(5000);
    });

    it('should return undefined for unknown session', () => {
      expect(manager.getSessionAge('nope')).toBeUndefined();
    });
  });

  // ── TTL Eviction ──────────────────────────────────────────────────────

  describe('cleanup — TTL eviction', () => {
    it('should evict sessions older than TTL', () => {
      manager.createSession({ id: 'old-1' });
      manager.createSession({ id: 'old-2' });

      // Advance past TTL (10 seconds in our mock config)
      vi.advanceTimersByTime(11_000);

      // Create new session — triggers cleanup
      manager.createSession({ id: 'fresh' });

      // Old sessions should be gone
      expect(manager.getSession('old-1')).toBeUndefined();
      expect(manager.getSession('old-2')).toBeUndefined();
      // Only the fresh one remains
      expect(manager.getSession('fresh')).toBeDefined();
      expect(manager.size).toBe(1);
    });

    it('should not evict sessions within TTL', () => {
      manager.createSession({ id: 'young' });
      vi.advanceTimersByTime(5000); // Within 10s TTL

      const evicted = manager.cleanup();
      expect(evicted).toBe(0);
      expect(manager.getSession('young')).toBeDefined();
    });

    it('should return the number of evicted sessions', () => {
      manager.createSession({ id: 'e1' });
      manager.createSession({ id: 'e2' });
      manager.createSession({ id: 'e3' });
      vi.advanceTimersByTime(11_000);

      const evicted = manager.cleanup();
      expect(evicted).toBe(3);
    });
  });

  // ── Cap Enforcement ───────────────────────────────────────────────────

  describe('cleanup — max session cap', () => {
    it('should evict oldest sessions when over capacity', () => {
      // Create 5 sessions (at cap)
      for (let i = 0; i < 5; i++) {
        manager.createSession({ id: `cap-${i}` });
        vi.advanceTimersByTime(100); // Stagger creation times
      }
      expect(manager.size).toBe(5);

      // Creating one more pushes to 6 (cleanup runs before creation at size=5, no eviction)
      manager.createSession({ id: 'cap-new' });
      expect(manager.size).toBe(6); // Temporarily over cap

      // Creating another triggers cleanup which now sees size=6 > 5
      manager.createSession({ id: 'cap-new2' });
      // Oldest should have been evicted during cleanup
      expect(manager.getSession('cap-0')).toBeUndefined();
      expect(manager.getSession('cap-new2')).toBeDefined();
    });

    it('should keep sessions under cap without eviction', () => {
      manager.createSession({ id: 'ok-1' });
      manager.createSession({ id: 'ok-2' });
      // Well under cap of 5
      const evicted = manager.cleanup();
      expect(evicted).toBe(0);
    });
  });

  // ── Size ──────────────────────────────────────────────────────────────

  describe('size', () => {
    it('should be 0 initially', () => {
      expect(manager.size).toBe(0);
    });

    it('should track additions', () => {
      manager.createSession({ id: 'add-1' });
      manager.createSession({ id: 'add-2' });
      expect(manager.size).toBe(2);
    });

    it('should track removals', () => {
      manager.createSession({ id: 'removable' });
      manager.createSession({ id: 'keeper' });
      manager.destroySession('removable');
      expect(manager.size).toBe(1);
    });
  });
});
