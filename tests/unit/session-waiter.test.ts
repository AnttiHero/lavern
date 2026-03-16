/**
 * Unit Tests — Session Waiter (src/session/session-waiter.ts)
 *
 * Tests the promise-based blocking that converts fire-and-forget
 * dispatch() calls into synchronous responses for the engage endpoint.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { waitForSessionCompletion } from '../../src/session/session-waiter.js';
import { SessionState } from '../../src/session/session-state.js';

// Mock config (needed by SessionState constructor)
vi.mock('../../src/config.js', () => ({
  config: {
    auditDir: './audit-logs',
    memoryDir: '.shem/memory',
    reportsDir: '.shem/reports',
    baselinesDir: '.shem/baselines',
    version: '0.10.0',
  },
}));

// Mock gate resolver
vi.mock('../../src/gates/gate-resolver.js', () => ({
  ReadlineGateResolver: class { async resolve() { return { decision: 'approve', notes: '' }; } },
}));

describe('waitForSessionCompletion', () => {
  let session: SessionState;

  beforeEach(() => {
    vi.useFakeTimers();
    session = new SessionState('test-waiter');
  });

  afterEach(() => {
    vi.useRealTimers();
    session.events.removeAllListeners();
  });

  it('resolves when session_end event fires', async () => {
    const promise = waitForSessionCompletion(session, 5000);

    // Emit session_end
    session.events.emitEvent({
      type: 'session_end',
      sessionId: 'test-waiter',
      totalCost: 1.5,
      duration: 30,
      timestamp: new Date().toISOString(),
    });

    await expect(promise).resolves.toBeUndefined();
  });

  it('rejects on error event', async () => {
    const promise = waitForSessionCompletion(session, 5000);

    session.events.emitEvent({
      type: 'error',
      message: 'Something went wrong',
      source: 'test',
      timestamp: new Date().toISOString(),
    });

    await expect(promise).rejects.toThrow('Something went wrong');
  });

  it('rejects on timeout', async () => {
    const promise = waitForSessionCompletion(session, 3000);

    // Advance past timeout
    vi.advanceTimersByTime(4000);

    await expect(promise).rejects.toThrow('timed out');
  });

  it('cleans up listeners on session_end', async () => {
    const listenersBefore = session.events.listenerCount('session_end');
    const promise = waitForSessionCompletion(session, 5000);

    // Should have added a listener
    expect(session.events.listenerCount('session_end')).toBe(listenersBefore + 1);

    session.events.emitEvent({
      type: 'session_end',
      sessionId: 'test-waiter',
      totalCost: 0,
      duration: 0,
      timestamp: new Date().toISOString(),
    });

    await promise;

    // Listener should be removed
    expect(session.events.listenerCount('session_end')).toBe(listenersBefore);
  });

  it('cleans up listeners on error', async () => {
    const promise = waitForSessionCompletion(session, 5000);

    session.events.emitEvent({
      type: 'error',
      message: 'fail',
      timestamp: new Date().toISOString(),
    });

    await promise.catch(() => {}); // Swallow rejection

    // Both listeners should be removed
    expect(session.events.listenerCount('shem_error')).toBe(0);
  });

  it('cleans up listeners on timeout', async () => {
    const promise = waitForSessionCompletion(session, 1000);

    vi.advanceTimersByTime(2000);

    await promise.catch(() => {});

    expect(session.events.listenerCount('session_end')).toBe(0);
    expect(session.events.listenerCount('shem_error')).toBe(0);
  });

  it('uses default timeout of 5 minutes', async () => {
    const promise = waitForSessionCompletion(session);

    // 4 minutes — should not have timed out yet
    vi.advanceTimersByTime(4 * 60 * 1000);

    // Resolve before it times out
    session.events.emitEvent({
      type: 'session_end',
      sessionId: 'test-waiter',
      totalCost: 0,
      duration: 0,
      timestamp: new Date().toISOString(),
    });

    await expect(promise).resolves.toBeUndefined();
  });

  it('first event wins — session_end before timeout', async () => {
    const promise = waitForSessionCompletion(session, 5000);

    // Emit session_end immediately
    session.events.emitEvent({
      type: 'session_end',
      sessionId: 'test-waiter',
      totalCost: 0,
      duration: 0,
      timestamp: new Date().toISOString(),
    });

    await expect(promise).resolves.toBeUndefined();

    // Advancing past timeout should not cause issues
    vi.advanceTimersByTime(10000);
  });
});
