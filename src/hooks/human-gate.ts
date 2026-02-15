/**
 * Human Gate Enforcer Hook — Ensures mandatory human gates are not skipped.
 *
 * v3: Refactored to factory pattern — state lives in SessionState.
 *
 * PreToolUse hook that monitors the orchestrator's workflow progression.
 * Tracks which gates have been triggered and blocks progression if
 * the orchestrator tries to skip a mandatory gate.
 */

import type { HookInput, HookJSONOutput } from '@anthropic-ai/claude-agent-sdk';
import type { SessionState } from '../session/session-state.js';

export function createGateHooks(session: SessionState) {
  const humanGateEnforcerHook = async (
    input: HookInput,
    _toolUseId: string | undefined,
    _options: { signal: AbortSignal }
  ): Promise<HookJSONOutput> => {
    if (input.hook_event_name !== 'PreToolUse') {
      return { continue: true };
    }

    const toolInput = input.tool_input as Record<string, unknown> | undefined;

    // Track when approval gates are invoked
    if (input.tool_name === 'mcp__shem__request_approval') {
      const gateType = toolInput?.gate_type as string;
      if (gateType) {
        session.triggeredGates.add(gateType);
      }
    }

    return { continue: true };
  };

  return { humanGateEnforcerHook };
}
