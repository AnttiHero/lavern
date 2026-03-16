/**
 * Unit Tests — Gate Resolver (src/gates/gate-resolver.ts)
 *
 * Tests the AsyncGateResolver and AutoApproveGateResolver.
 * The gate system is security-critical — timeout → reject (never auto-approve),
 * and stale gates must be cleaned up safely.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AsyncGateResolver, AutoApproveGateResolver } from '../../src/gates/gate-resolver.js';
import type { GateRequest, GateDecision } from '../../src/gates/gate-resolver.js';

const makeRequest = (gateType: GateRequest['gateType'] = 'ethics_critical'): GateRequest => ({
  gateType,
  summary: 'Test gate',
  details: 'Test details',
  proposedAction: 'Proceed with test',
});

describe('AsyncGateResolver', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves when decision is submitted', async () => {
    const resolver = new AsyncGateResolver();
    const request = makeRequest();

    const promise = resolver.resolve(request);

    // Gate should be pending
    expect(resolver.hasPendingGate()).toBe(true);
    expect(resolver.getPendingGate()).toEqual(request);

    // Submit decision
    const accepted = resolver.submitDecision({ decision: 'approve', notes: 'LGTM' });
    expect(accepted).toBe(true);

    const result = await promise;
    expect(result.decision).toBe('approve');
    expect(result.notes).toBe('LGTM');
    expect(resolver.hasPendingGate()).toBe(false);
  });

  it('rejects on timeout (never auto-approves)', async () => {
    const resolver = new AsyncGateResolver(1000); // 1 second timeout
    const request = makeRequest();

    const promise = resolver.resolve(request);
    expect(resolver.hasPendingGate()).toBe(true);

    // Fast-forward past timeout
    vi.advanceTimersByTime(1001);

    const result = await promise;
    expect(result.decision).toBe('reject');
    expect(result.notes).toContain('timed out');
    expect(resolver.hasPendingGate()).toBe(false);
  });

  it('rejects stale gate when new gate arrives', async () => {
    const resolver = new AsyncGateResolver(60000);

    // First gate
    const promise1 = resolver.resolve(makeRequest('ethics_critical'));

    // Second gate supersedes the first
    const promise2 = resolver.resolve(makeRequest('final_delivery'));

    // First gate should have been rejected
    const result1 = await promise1;
    expect(result1.decision).toBe('reject');
    expect(result1.notes).toContain('Superseded');

    // Second gate is now pending
    expect(resolver.hasPendingGate()).toBe(true);
    expect(resolver.getPendingGate()?.gateType).toBe('final_delivery');

    // Resolve second gate
    resolver.submitDecision({ decision: 'approve' });
    const result2 = await promise2;
    expect(result2.decision).toBe('approve');
  });

  it('returns false when submitting without pending gate', () => {
    const resolver = new AsyncGateResolver();
    expect(resolver.submitDecision({ decision: 'approve' })).toBe(false);
  });

  it('cancel() rejects pending gate', async () => {
    const resolver = new AsyncGateResolver();
    const promise = resolver.resolve(makeRequest());

    resolver.cancel();

    const result = await promise;
    expect(result.decision).toBe('reject');
    expect(result.notes).toContain('cancelled');
    expect(resolver.hasPendingGate()).toBe(false);
  });

  it('cancel() is safe to call with no pending gate', () => {
    const resolver = new AsyncGateResolver();
    expect(() => resolver.cancel()).not.toThrow();
  });

  it('getPendingAge returns 0 when no gate is pending', () => {
    const resolver = new AsyncGateResolver();
    expect(resolver.getPendingAge()).toBe(0);
  });

  it('getPendingAge returns positive number when gate is pending', async () => {
    const resolver = new AsyncGateResolver(60000);
    const now = Date.now();
    vi.setSystemTime(now);

    const promise = resolver.resolve(makeRequest());

    vi.setSystemTime(now + 5000);
    expect(resolver.getPendingAge()).toBe(5000);

    // Clean up
    resolver.submitDecision({ decision: 'approve' });
    await promise;
  });

  it('disables timeout when timeoutMs is 0', async () => {
    const resolver = new AsyncGateResolver(0);
    const promise = resolver.resolve(makeRequest());

    // Fast-forward a long time — should not timeout
    vi.advanceTimersByTime(600000); // 10 minutes
    expect(resolver.hasPendingGate()).toBe(true);

    // Clean up
    resolver.submitDecision({ decision: 'approve' });
    const result = await promise;
    expect(result.decision).toBe('approve');
  });
});

describe('AutoApproveGateResolver', () => {
  it('auto-approves all gates', async () => {
    const resolver = new AutoApproveGateResolver();

    const result1 = await resolver.resolve(makeRequest('ethics_critical'));
    expect(result1.decision).toBe('approve');

    const result2 = await resolver.resolve(makeRequest('final_delivery'));
    expect(result2.decision).toBe('approve');
  });

  it('records all decisions for test verification', async () => {
    const resolver = new AutoApproveGateResolver();

    await resolver.resolve(makeRequest('ethics_critical'));
    await resolver.resolve(makeRequest('meaning_critical'));
    await resolver.resolve(makeRequest('final_delivery'));

    expect(resolver.decisions).toHaveLength(3);
    expect(resolver.decisions[0].request.gateType).toBe('ethics_critical');
    expect(resolver.decisions[1].request.gateType).toBe('meaning_critical');
    expect(resolver.decisions[2].request.gateType).toBe('final_delivery');
    expect(resolver.decisions.every(d => d.decision.decision === 'approve')).toBe(true);
  });
});
