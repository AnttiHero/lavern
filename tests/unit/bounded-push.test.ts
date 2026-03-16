/**
 * Unit Tests — boundedPush (src/session/session-state.ts)
 *
 * Tests the array size cap that prevents unbounded memory growth
 * in debate findings, challenges, audit entries, etc.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { boundedPush, boundedPushDropCount } from '../../src/session/session-state.js';

describe('boundedPush', () => {
  it('pushes item to array', () => {
    const arr: number[] = [];
    boundedPush(arr, 42);
    expect(arr).toEqual([42]);
  });

  it('returns the array for chaining', () => {
    const arr: number[] = [];
    const result = boundedPush(arr, 1);
    expect(result).toBe(arr);
  });

  it('allows push up to the limit', () => {
    const arr: number[] = [];
    for (let i = 0; i < 10; i++) {
      boundedPush(arr, i, 10);
    }
    expect(arr).toHaveLength(10);
    expect(arr).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('drops oldest 10% when limit is hit', () => {
    const arr: number[] = Array.from({ length: 10 }, (_, i) => i);
    // Array is at max (10). Next push should drop oldest 10% (1 item).
    boundedPush(arr, 99, 10);
    // After drop: [1,2,3,4,5,6,7,8,9] + [99] = 10 items
    expect(arr).toHaveLength(10);
    expect(arr[0]).toBe(1); // 0 was dropped
    expect(arr[arr.length - 1]).toBe(99);
  });

  it('drops correct count for larger arrays', () => {
    const arr: number[] = Array.from({ length: 100 }, (_, i) => i);
    boundedPush(arr, 999, 100);
    // Drops ceil(100 * 0.1) = 10 oldest, then pushes new item
    expect(arr).toHaveLength(91);
    expect(arr[0]).toBe(10); // 0-9 dropped
    expect(arr[arr.length - 1]).toBe(999);
  });

  it('handles repeated pushes past the cap', () => {
    const arr: number[] = Array.from({ length: 5 }, (_, i) => i);
    // Push 3 more — each triggers eviction at max=5
    boundedPush(arr, 10, 5);
    boundedPush(arr, 11, 5);
    boundedPush(arr, 12, 5);
    // Each eviction drops ceil(5 * 0.1) = 1 oldest
    expect(arr.length).toBeLessThanOrEqual(5);
    expect(arr).toContain(12);
  });

  it('uses default max of 5000 when not specified', () => {
    const arr: number[] = [];
    for (let i = 0; i < 100; i++) {
      boundedPush(arr, i);
    }
    // Well under 5000 — no drops
    expect(arr).toHaveLength(100);
  });

  it('works with different types', () => {
    const strArr: string[] = [];
    boundedPush(strArr, 'hello');
    boundedPush(strArr, 'world');
    expect(strArr).toEqual(['hello', 'world']);

    const objArr: { id: number }[] = [];
    boundedPush(objArr, { id: 1 });
    expect(objArr[0].id).toBe(1);
  });

  it('increments global drop counter', () => {
    const before = boundedPushDropCount;
    const arr = Array.from({ length: 20 }, (_, i) => i);
    boundedPush(arr, 99, 20);
    // Should have dropped ceil(20 * 0.1) = 2
    expect(boundedPushDropCount).toBe(before + 2);
  });
});
