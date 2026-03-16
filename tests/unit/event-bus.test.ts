/**
 * Unit Tests — Event Bus (src/events/event-bus.ts)
 *
 * Tests the typed event system that all state mutations flow through.
 * Consumers: WebSocket, audit logger, cost tracker, session waiter.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ShemEventBus, eventTimestamp } from '../../src/events/event-bus.js';

describe('ShemEventBus', () => {
  let bus: ShemEventBus;

  beforeEach(() => {
    bus = new ShemEventBus();
  });

  // ── Basic Event Emission ──────────────────────────────────────────

  it('emits events via the "event" channel', () => {
    const handler = vi.fn();
    bus.on('event', handler);

    const event = {
      type: 'session_start' as const,
      sessionId: 'test-1',
      document: 'test.pdf',
      timestamp: eventTimestamp(),
    };
    bus.emitEvent(event);

    expect(handler).toHaveBeenCalledWith(event);
  });

  it('emits typed events on their own channel', () => {
    const handler = vi.fn();
    bus.on('session_start', handler);

    bus.emitEvent({
      type: 'session_start',
      sessionId: 'test-1',
      document: 'test.pdf',
      timestamp: eventTimestamp(),
    });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('emits error events on "shem_error" channel (not "error")', () => {
    const shemHandler = vi.fn();
    bus.on('shem_error', shemHandler);

    bus.emitEvent({
      type: 'error',
      message: 'Something went wrong',
      source: 'test',
      timestamp: eventTimestamp(),
    });

    expect(shemHandler).toHaveBeenCalledTimes(1);
  });

  it('does not throw ERR_UNHANDLED_ERROR for error events', () => {
    // Node.js EventEmitter throws if 'error' event has no listener.
    // ShemEventBus uses 'shem_error' alias to avoid this.
    expect(() => {
      bus.emitEvent({
        type: 'error',
        message: 'Test error',
        timestamp: eventTimestamp(),
      });
    }).not.toThrow();
  });

  // ── Event Log ──────────────────────────────────────────────────────

  it('records events in the log', () => {
    bus.emitEvent({
      type: 'session_start',
      sessionId: 'test-1',
      document: 'test.pdf',
      timestamp: eventTimestamp(),
    });

    const log = bus.getEventLog();
    expect(log).toHaveLength(1);
    expect(log[0].type).toBe('session_start');
  });

  it('returns a copy of the log (not the internal array)', () => {
    bus.emitEvent({
      type: 'session_start',
      sessionId: 'test-1',
      document: 'test.pdf',
      timestamp: eventTimestamp(),
    });

    const log1 = bus.getEventLog();
    const log2 = bus.getEventLog();
    expect(log1).not.toBe(log2);
    expect(log1).toEqual(log2);
  });

  it('tracks event count', () => {
    expect(bus.getEventCount()).toBe(0);

    for (let i = 0; i < 5; i++) {
      bus.emitEvent({
        type: 'tool_used',
        tool: `tool-${i}`,
        timestamp: eventTimestamp(),
      });
    }

    expect(bus.getEventCount()).toBe(5);
  });

  // ── Log Size Limiting ──────────────────────────────────────────────

  it('drops oldest events when log exceeds MAX_EVENTS', () => {
    // MAX_EVENTS is 10,000. We need to push past it.
    // This is expensive, so test with reflection on the internal array.
    // Push 10,001 events.
    for (let i = 0; i < 10_001; i++) {
      bus.emitEvent({
        type: 'tool_used',
        tool: `tool-${i}`,
        timestamp: '2025-01-01',
      });
    }

    // After hitting 10,000, oldest 1,000 are dropped, then the 10,001st is added
    // So we should have 9,001 events
    expect(bus.getEventCount()).toBe(9_001);
    expect(bus.isTruncated).toBe(true);
    expect(bus.getDroppedCount()).toBe(1_000);
  });

  // ── getEventsSince ─────────────────────────────────────────────────

  it('returns events since a given index', () => {
    for (let i = 0; i < 5; i++) {
      bus.emitEvent({
        type: 'tool_used',
        tool: `tool-${i}`,
        timestamp: eventTimestamp(),
      });
    }

    const since3 = bus.getEventsSince(3);
    expect(since3).toHaveLength(2);
  });

  it('handles index 0', () => {
    bus.emitEvent({ type: 'tool_used', tool: 'a', timestamp: eventTimestamp() });
    const all = bus.getEventsSince(0);
    expect(all).toHaveLength(1);
  });

  // ── Recording Control ──────────────────────────────────────────────

  it('stops recording when stopRecording is called', () => {
    bus.emitEvent({ type: 'tool_used', tool: 'a', timestamp: eventTimestamp() });
    expect(bus.getEventCount()).toBe(1);

    bus.stopRecording();

    bus.emitEvent({ type: 'tool_used', tool: 'b', timestamp: eventTimestamp() });
    expect(bus.getEventCount()).toBe(1); // Not recorded

    // But listeners still fire
    const handler = vi.fn();
    bus.on('event', handler);
    bus.emitEvent({ type: 'tool_used', tool: 'c', timestamp: eventTimestamp() });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('clears the log', () => {
    bus.emitEvent({ type: 'tool_used', tool: 'a', timestamp: eventTimestamp() });
    expect(bus.getEventCount()).toBe(1);

    bus.clear();
    expect(bus.getEventCount()).toBe(0);
    expect(bus.isTruncated).toBe(false);
    expect(bus.getDroppedCount()).toBe(0);
  });

  // ── eventTimestamp ────────────────────────────────────────────────

  it('returns an ISO 8601 timestamp', () => {
    const ts = eventTimestamp();
    expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});
