/**
 * Unit Tests — Claw Event Bus (src/claw/events.ts)
 *
 * Tests the singleton ClawEventBus: event emission, subscription,
 * event log recording, and replay.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ShemEventBus, eventTimestamp } from '../../src/events/event-bus.js';
import type { ShemEvent } from '../../src/events/event-bus.js';

describe('ClawEventBus', () => {
  let bus: ShemEventBus;

  beforeEach(() => {
    bus = new ShemEventBus();
  });

  it('emits claw_scan_completed and records in event log', () => {
    const events: ShemEvent[] = [];
    bus.on('event', (e: ShemEvent) => events.push(e));

    bus.emitEvent({
      type: 'claw_scan_completed',
      newDocs: 3,
      changedDocs: 1,
      totalDocs: 10,
      timestamp: eventTimestamp(),
    });

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('claw_scan_completed');
    expect(bus.getEventCount()).toBe(1);
  });

  it('emits claw_job_completed with full payload', () => {
    const events: ShemEvent[] = [];
    bus.on('event', (e: ShemEvent) => events.push(e));

    bus.emitEvent({
      type: 'claw_job_completed',
      documentPath: '/docs/contract.pdf',
      documentHash: 'abc123',
      costUsd: 1.50,
      durationMs: 5000,
      findings: { critical: 1, major: 2, minor: 0 },
      timestamp: eventTimestamp(),
    });

    expect(events).toHaveLength(1);
    const e = events[0] as Extract<ShemEvent, { type: 'claw_job_completed' }>;
    expect(e.findings.critical).toBe(1);
    expect(e.costUsd).toBe(1.50);
  });

  it('emits claw_paused and claw_resumed round-trip', () => {
    const events: ShemEvent[] = [];
    bus.on('event', (e: ShemEvent) => events.push(e));

    const pausedAt = new Date().toISOString();
    bus.emitEvent({ type: 'claw_paused', pausedAt, timestamp: eventTimestamp() });
    bus.emitEvent({ type: 'claw_resumed', resumedAt: pausedAt, pendingRescan: true, timestamp: eventTimestamp() });

    expect(events).toHaveLength(2);
    expect(events[0].type).toBe('claw_paused');
    expect(events[1].type).toBe('claw_resumed');
  });

  it('supports getEventsSince for late-join replay', () => {
    bus.emitEvent({ type: 'claw_scan_started', watchPaths: ['/docs'], timestamp: eventTimestamp() });
    bus.emitEvent({ type: 'claw_scan_completed', newDocs: 1, changedDocs: 0, totalDocs: 1, timestamp: eventTimestamp() });
    bus.emitEvent({ type: 'claw_job_started', documentPath: '/docs/a.pdf', documentHash: 'h1', documentType: 'NDA', trigger: 'new', timestamp: eventTimestamp() });

    // Late joiner missed first 2 events
    const missed = bus.getEventsSince(2);
    expect(missed).toHaveLength(1);
    expect(missed[0].type).toBe('claw_job_started');
  });

  it('emits claw_budget_warning with numeric fields', () => {
    const events: ShemEvent[] = [];
    bus.on('event', (e: ShemEvent) => events.push(e));

    bus.emitEvent({
      type: 'claw_budget_warning',
      percentUsed: 85,
      remainingUsd: 7.50,
      timestamp: eventTimestamp(),
    });

    expect(events).toHaveLength(1);
    const e = events[0] as Extract<ShemEvent, { type: 'claw_budget_warning' }>;
    expect(e.percentUsed).toBe(85);
    expect(e.remainingUsd).toBe(7.50);
  });

  it('emits claw_precedent_indexed', () => {
    const events: ShemEvent[] = [];
    bus.on('event', (e: ShemEvent) => events.push(e));

    bus.emitEvent({
      type: 'claw_precedent_indexed',
      precedentId: 'PREC-abc',
      patternName: 'Contract Risk Pattern',
      documentType: 'NDA',
      timestamp: eventTimestamp(),
    });

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('claw_precedent_indexed');
  });

  it('emits claw_job_failed with error string', () => {
    const events: ShemEvent[] = [];
    bus.on('event', (e: ShemEvent) => events.push(e));

    bus.emitEvent({
      type: 'claw_job_failed',
      documentPath: '/docs/bad.pdf',
      documentHash: 'xyz',
      error: 'Parse error: corrupted PDF',
      timestamp: eventTimestamp(),
    });

    const e = events[0] as Extract<ShemEvent, { type: 'claw_job_failed' }>;
    expect(e.error).toBe('Parse error: corrupted PDF');
  });
});
