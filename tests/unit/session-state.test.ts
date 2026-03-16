/**
 * Unit Tests — SessionState (src/session/session-state.ts)
 *
 * Tests the isolated session container: construction, halt mechanism,
 * cost tracking, state isolation between instances.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionState } from '../../src/session/session-state.js';

// Mock config
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

describe('SessionState', () => {
  // ── Constructor ─────────────────────────────────────────────────────

  it('generates unique IDs when none provided', () => {
    const s1 = new SessionState();
    const s2 = new SessionState();
    expect(s1.id).not.toBe(s2.id);
    expect(s1.id).toMatch(/^shem-/);
  });

  it('uses the provided ID', () => {
    const session = new SessionState('my-session-42');
    expect(session.id).toBe('my-session-42');
  });

  it('creates an event bus', () => {
    const session = new SessionState('test');
    expect(session.events).toBeDefined();
    expect(typeof session.events.emitEvent).toBe('function');
  });

  it('uses default budget of 5.0', () => {
    const session = new SessionState('test');
    expect(session.budgetUsd).toBe(5.0);
  });

  it('accepts custom budget', () => {
    const session = new SessionState('test', { budgetUsd: 25.0 });
    expect(session.budgetUsd).toBe(25.0);
  });

  it('accepts custom directories', () => {
    const session = new SessionState('test', {
      auditDir: '/custom/audit',
      memoryDir: '/custom/memory',
      reportsDir: '/custom/reports',
      baselinesDir: '/custom/baselines',
    });
    expect(session.auditDir).toBe('/custom/audit');
    expect(session.memoryDir).toBe('/custom/memory');
    expect(session.reportsDir).toBe('/custom/reports');
    expect(session.baselinesDir).toBe('/custom/baselines');
  });

  // ── State Isolation ─────────────────────────────────────────────────

  it('has isolated debate state between sessions', () => {
    const s1 = new SessionState('s1');
    const s2 = new SessionState('s2');

    s1.debate.findings.push({ severity: 'RED' } as any);
    expect(s1.debate.findings).toHaveLength(1);
    expect(s2.debate.findings).toHaveLength(0);
  });

  it('has isolated audit entries between sessions', () => {
    const s1 = new SessionState('s1');
    const s2 = new SessionState('s2');

    s1.auditEntries.push({ event: 'test' } as any);
    expect(s1.auditEntries).toHaveLength(1);
    expect(s2.auditEntries).toHaveLength(0);
  });

  it('has isolated event buses between sessions', () => {
    const s1 = new SessionState('s1');
    const s2 = new SessionState('s2');

    const handler = vi.fn();
    s1.events.on('event', handler);

    s2.events.emitEvent({
      type: 'tool_used',
      tool: 'test',
      timestamp: new Date().toISOString(),
    });

    expect(handler).not.toHaveBeenCalled();
  });

  // ── Halt Mechanism ─────────────────────────────────────────────────

  it('starts in non-halted state', () => {
    const session = new SessionState('test');
    expect(session.isHalted()).toBe(false);
    expect(session.haltReason).toBeNull();
  });

  it('halts with a reason', () => {
    const session = new SessionState('test');
    session.halt('Budget exceeded');
    expect(session.isHalted()).toBe(true);
    expect(session.haltReason).toBe('Budget exceeded');
  });

  it('emits error event on halt', () => {
    const session = new SessionState('test');
    const handler = vi.fn();
    session.events.on('shem_error', handler);

    session.halt('Test halt');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('ignores second halt call', () => {
    const session = new SessionState('test');
    const handler = vi.fn();
    session.events.on('shem_error', handler);

    session.halt('First reason');
    session.halt('Second reason');

    expect(session.haltReason).toBe('First reason');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('aborts the controller on halt', () => {
    const session = new SessionState('test');
    expect(session.haltController.signal.aborted).toBe(false);

    session.halt('Stop now');
    expect(session.haltController.signal.aborted).toBe(true);
  });

  // ── Cost Tracking ─────────────────────────────────────────────────

  it('starts with zero accumulated cost', () => {
    const session = new SessionState('test');
    expect(session.accumulatedCost).toBe(0);
  });

  it('updates cost and emits cost_update event', () => {
    const session = new SessionState('test');
    const handler = vi.fn();
    session.events.on('cost_update', handler);

    session.updateCost(1.5);
    expect(session.accumulatedCost).toBe(1.5);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({
      type: 'cost_update',
      totalUsd: 1.5,
      budgetUsd: 5.0,
    }));
  });

  it('replaces cost (not additive)', () => {
    const session = new SessionState('test');
    session.updateCost(1.0);
    session.updateCost(2.5);
    expect(session.accumulatedCost).toBe(2.5);
  });

  // ── Default State Values ───────────────────────────────────────────

  it('initializes debate state as empty', () => {
    const session = new SessionState('test');
    expect(session.debate.findings).toEqual([]);
    expect(session.debate.challenges).toEqual([]);
    expect(session.debate.responses).toEqual([]);
    expect(session.debate.resolutions).toEqual([]);
    expect(session.debate.rounds).toEqual([]);
  });

  it('initializes workflow state with intake step', () => {
    const session = new SessionState('test');
    expect(session.workflow.currentStep).toBe('intake');
    expect(session.workflow.completedSteps).toEqual([]);
  });

  it('initializes verification state as empty', () => {
    const session = new SessionState('test');
    expect(session.verificationResults).toEqual([]);
    expect(session.verificationCounter).toBe(0);
    expect(session.verificationSummary).toBeNull();
  });

  it('initializes documents as empty array', () => {
    const session = new SessionState('test');
    expect(session.documents).toEqual([]);
  });

  it('initializes finalOutput and assembledDocument as empty strings', () => {
    const session = new SessionState('test');
    expect(session.finalOutput).toBe('');
    expect(session.assembledDocument).toBe('');
  });

  it('initializes triggered gates as empty set', () => {
    const session = new SessionState('test');
    expect(session.triggeredGates.size).toBe(0);
  });

  it('initializes queried memory IDs as empty set', () => {
    const session = new SessionState('test');
    expect(session.queriedMemoryIds.size).toBe(0);
  });
});
