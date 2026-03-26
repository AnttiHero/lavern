/**
 * Unit Tests — Cost Tracker & Halt-Check Hooks (src/hooks/cost-tracker.ts)
 *
 * Tests budget enforcement, pre-flight cost estimation, halt mechanism,
 * and warning thresholds. These hooks fire on every tool invocation — if
 * they break, sessions either run up infinite bills or get stuck.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { estimateToolCost, createCostHooks } from '../../src/hooks/cost-tracker.js';

// Minimal SessionState mock
function makeSession(budgetUsd: number, accumulatedCost: number, halted = false, haltReason?: string) {
  return {
    budgetUsd,
    accumulatedCost,
    isHalted: () => halted,
    isPaused: () => false,
    haltReason: haltReason ?? null,
    events: {
      emitEvent: vi.fn(),
    },
  } as any;
}

const PRE_TOOL_INPUT = { hook_event_name: 'PreToolUse', tool_name: 'mcp__shem__post_finding', tool_input: {} };

describe('estimateToolCost', () => {
  it('returns known cost for registered tools', () => {
    expect(estimateToolCost('post_finding')).toBe(0.02);
    expect(estimateToolCost('score_document')).toBe(0.05);
    expect(estimateToolCost('get_workflow')).toBe(0.001);
  });

  it('strips MCP namespace prefix', () => {
    expect(estimateToolCost('mcp__shem__post_finding')).toBe(0.02);
    expect(estimateToolCost('mcp__shem__score_document')).toBe(0.05);
  });

  it('returns default cost for unknown tools', () => {
    expect(estimateToolCost('unknown_tool')).toBe(0.01);
    expect(estimateToolCost('mcp__shem__unknown_tool')).toBe(0.01);
  });
});

describe('haltCheckHook', () => {
  it('allows tool use when session is not halted', async () => {
    const session = makeSession(10, 0, false);
    const { haltCheckHook } = createCostHooks(session);

    const result = await haltCheckHook(PRE_TOOL_INPUT as any, undefined, { signal: new AbortController().signal });
    expect(result.continue).toBe(true);
  });

  it('blocks tool use when session is halted', async () => {
    const session = makeSession(10, 0, true, 'User cancelled');
    const { haltCheckHook } = createCostHooks(session);

    const result = await haltCheckHook(PRE_TOOL_INPUT as any, undefined, { signal: new AbortController().signal });
    expect(result.continue).toBe(false);
    expect(result.stopReason).toContain('Emergency stop');
    expect(result.stopReason).toContain('User cancelled');
  });

  it('includes default halt reason when none provided', async () => {
    const session = makeSession(10, 0, true);
    const { haltCheckHook } = createCostHooks(session);

    const result = await haltCheckHook(PRE_TOOL_INPUT as any, undefined, { signal: new AbortController().signal });
    expect(result.continue).toBe(false);
    expect(result.stopReason).toContain('Session halted');
  });
});

describe('costTrackerHook', () => {
  it('allows tool use when budget has room', async () => {
    const session = makeSession(10, 1);
    const { costTrackerHook } = createCostHooks(session);

    const result = await costTrackerHook(PRE_TOOL_INPUT as any, undefined, { signal: new AbortController().signal });
    expect(result.continue).toBe(true);
  });

  it('blocks when budget is exceeded', async () => {
    const session = makeSession(5, 5.01);
    const { costTrackerHook } = createCostHooks(session);

    const result = await costTrackerHook(PRE_TOOL_INPUT as any, undefined, { signal: new AbortController().signal });
    expect(result.continue).toBe(false);
    expect(result.stopReason).toContain('Budget limit');
    expect(session.events.emitEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'cost_update' })
    );
  });

  it('blocks when budget is exactly zero remaining', async () => {
    const session = makeSession(5, 5);
    const { costTrackerHook } = createCostHooks(session);

    const result = await costTrackerHook(PRE_TOOL_INPUT as any, undefined, { signal: new AbortController().signal });
    expect(result.continue).toBe(false);
  });

  it('pre-flight rejects tool call that would exceed budget', async () => {
    // Budget: $1, used: $0.96, post_finding costs $0.02 → $0.96 + $0.02 = $0.98 < $1 → allowed
    const session1 = makeSession(1, 0.96);
    const { costTrackerHook: hook1 } = createCostHooks(session1);
    const result1 = await hook1(
      { hook_event_name: 'PreToolUse', tool_name: 'mcp__shem__post_finding' } as any,
      undefined,
      { signal: new AbortController().signal }
    );
    expect(result1.continue).toBe(true);

    // Budget: $1, used: $0.99, post_finding costs $0.02 → $0.99 + $0.02 = $1.01 > $1 → blocked
    const session2 = makeSession(1, 0.99);
    const { costTrackerHook: hook2 } = createCostHooks(session2);
    const result2 = await hook2(
      { hook_event_name: 'PreToolUse', tool_name: 'mcp__shem__post_finding' } as any,
      undefined,
      { signal: new AbortController().signal }
    );
    expect(result2.continue).toBe(false);
    expect(result2.stopReason).toContain('Insufficient budget');
    expect(result2.stopReason).toContain('post_finding');
  });

  it('allows tool use when no tool_name in input (non-tool hooks)', async () => {
    const session = makeSession(1, 0.999);
    const { costTrackerHook } = createCostHooks(session);

    // Input without tool_name — should skip pre-flight check
    const result = await costTrackerHook(
      { hook_event_name: 'PreToolUse' } as any,
      undefined,
      { signal: new AbortController().signal }
    );
    expect(result.continue).toBe(true);
  });

  it('fires 50% warning only once', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const session = makeSession(10, 5.5); // 55% used, 45% remaining
    const { costTrackerHook } = createCostHooks(session);
    const opts = { signal: new AbortController().signal };

    // First call — should trigger 50% warning
    await costTrackerHook({ hook_event_name: 'PreToolUse' } as any, undefined, opts);
    const firstCallWarnings = consoleError.mock.calls.filter(c => c[0]?.includes('50%+'));
    expect(firstCallWarnings.length).toBe(1);

    // Second call — should NOT re-trigger
    consoleError.mockClear();
    await costTrackerHook({ hook_event_name: 'PreToolUse' } as any, undefined, opts);
    const secondCallWarnings = consoleError.mock.calls.filter(c => c[0]?.includes('50%+'));
    expect(secondCallWarnings.length).toBe(0);

    consoleError.mockRestore();
  });
});
