/**
 * Unit Tests — Human Gate Enforcer Hook (src/hooks/human-gate.ts)
 *
 * Tests that the gate enforcer tracks triggered gates correctly.
 * This hook ensures mandatory human gates are never skipped.
 */

import { describe, it, expect, vi } from 'vitest';
import { createGateHooks } from '../../src/hooks/human-gate.js';

function makeSession() {
  return {
    triggeredGates: new Set<string>(),
  } as any;
}

const SIGNAL = { signal: new AbortController().signal };

describe('humanGateEnforcerHook', () => {
  it('passes through non-PreToolUse events', async () => {
    const session = makeSession();
    const { humanGateEnforcerHook } = createGateHooks(session);

    const result = await humanGateEnforcerHook(
      { hook_event_name: 'PostToolUse', tool_name: 'mcp__shem__request_approval', tool_input: { gate_type: 'ethics_critical' } } as any,
      undefined,
      SIGNAL
    );
    expect(result.continue).toBe(true);
    expect(session.triggeredGates.size).toBe(0);
  });

  it('tracks approval gate invocations', async () => {
    const session = makeSession();
    const { humanGateEnforcerHook } = createGateHooks(session);

    await humanGateEnforcerHook(
      { hook_event_name: 'PreToolUse', tool_name: 'mcp__shem__request_approval', tool_input: { gate_type: 'ethics_critical' } } as any,
      undefined,
      SIGNAL
    );
    expect(session.triggeredGates.has('ethics_critical')).toBe(true);

    await humanGateEnforcerHook(
      { hook_event_name: 'PreToolUse', tool_name: 'mcp__shem__request_approval', tool_input: { gate_type: 'final_delivery' } } as any,
      undefined,
      SIGNAL
    );
    expect(session.triggeredGates.has('final_delivery')).toBe(true);
    expect(session.triggeredGates.size).toBe(2);
  });

  it('ignores non-approval tools', async () => {
    const session = makeSession();
    const { humanGateEnforcerHook } = createGateHooks(session);

    await humanGateEnforcerHook(
      { hook_event_name: 'PreToolUse', tool_name: 'mcp__shem__post_finding', tool_input: {} } as any,
      undefined,
      SIGNAL
    );
    expect(session.triggeredGates.size).toBe(0);
  });

  it('handles missing gate_type gracefully', async () => {
    const session = makeSession();
    const { humanGateEnforcerHook } = createGateHooks(session);

    await humanGateEnforcerHook(
      { hook_event_name: 'PreToolUse', tool_name: 'mcp__shem__request_approval', tool_input: {} } as any,
      undefined,
      SIGNAL
    );
    // No gate_type → nothing tracked
    expect(session.triggeredGates.size).toBe(0);
  });

  it('handles undefined tool_input gracefully', async () => {
    const session = makeSession();
    const { humanGateEnforcerHook } = createGateHooks(session);

    const result = await humanGateEnforcerHook(
      { hook_event_name: 'PreToolUse', tool_name: 'mcp__shem__request_approval' } as any,
      undefined,
      SIGNAL
    );
    expect(result.continue).toBe(true);
    expect(session.triggeredGates.size).toBe(0);
  });
});
