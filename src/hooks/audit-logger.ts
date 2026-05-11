/**
 * Audit Logger Hook — Captures every agent action for the audit trail.
 *
 * v3: Refactored to factory pattern — all state lives in SessionState.
 * Events emitted for visualization (agent_start, agent_stop).
 *
 * Supports hooks: PostToolUse, SubagentStart, SubagentStop.
 */

import type { HookInput, HookJSONOutput } from '@anthropic-ai/claude-agent-sdk';
import type { AuditEntry, AuditTrail, SubagentActivity } from '../types/audit.js';
import type { SessionState } from '../session/session-state.js';
import { boundedPush } from '../session/session-state.js';
import { initPersistentAudit, persistAuditEntry, finalizePersistentAudit } from '../utils/audit-persistence.js';
import { eventTimestamp } from '../events/event-bus.js';
import { config } from '../config.js';

/**
 * Initialize the audit log for a session.
 * Sets up the persistent JSONL file and resets in-memory state.
 */
export function initAuditLog(session: SessionState): void {
  session.auditSessionId = session.id;
  session.auditStartTimestamp = new Date().toISOString();

  // Initialize persistent audit file (JSONL + checksum chain)
  initPersistentAudit(session);
}

/**
 * Create all audit hooks bound to a specific session.
 */
export function createAuditHooks(session: SessionState) {
  // Queue of pending Task tool calls — maps subagent_type + prompt from the
  // PreToolUse/PostToolUse "Task" call to the SubagentStart that follows.
  // The SDK fires PostToolUse(Task) → SubagentStart in sequence, so a simple
  // FIFO queue reliably pairs them.
  const pendingTaskCalls: Array<{ role: string; task: string }> = [];

  /**
   * PostToolUse hook — logs every tool invocation to both memory and disk.
   * Also captures Task tool calls to extract the real agent role name.
   */
  const auditLoggerHook = async (
    input: HookInput,
    _toolUseId: string | undefined,
    _options: { signal: AbortSignal }
  ): Promise<HookJSONOutput> => {
    const toolName = 'tool_name' in input ? input.tool_name : undefined;
    const toolInput = 'tool_input' in input ? input.tool_input : undefined;
    const toolResponse = 'tool_response' in input ? input.tool_response : undefined;

    // Capture Task tool calls to extract the real subagent role name + prompt.
    // The SDK only reports "general-purpose" as agent_type in SubagentStart,
    // but the Task tool_input contains the actual subagent_type from our definitions.
    if (toolName === 'Task' && toolInput && typeof toolInput === 'object') {
      const ti = toolInput as Record<string, unknown>;
      const role = typeof ti.subagent_type === 'string' ? ti.subagent_type : '';
      const task = typeof ti.prompt === 'string' ? ti.prompt.slice(0, 200) : '';
      const desc = typeof ti.description === 'string' ? ti.description : '';
      pendingTaskCalls.push({ role: role || 'unknown', task: desc || task });
    }

    // CRITICAL: Capture subagent output in session.finalOutput.
    // The SDK's tool_response for Task calls is an OBJECT (not a string).
    // It contains the specialist's full work product which the assembly step
    // needs to produce the clean deliverable document.
    // Cap at ~2MB to prevent unbounded growth in full-bench workflows (25+ agents).
    const MAX_FINAL_OUTPUT = 2_000_000;
    if (toolName === 'Task' && toolResponse) {
      const responseStr = typeof toolResponse === 'string'
        ? toolResponse
        : JSON.stringify(toolResponse);
      if (responseStr.length > 100 && session.finalOutput.length < MAX_FINAL_OUTPUT) {
        const available = MAX_FINAL_OUTPUT - session.finalOutput.length;
        session.finalOutput += '\n\n' + responseStr.slice(0, available);
      }
    }

    const entry: AuditEntry = {
      timestamp: new Date().toISOString(),
      sessionId: session.id,
      agentRole: 'orchestrator',
      action: `${input.hook_event_name}: ${toolName || 'unknown'}`,
      toolName,
      toolInput,
      toolResponseSummary: typeof toolResponse === 'string'
        ? toolResponse.slice(0, 200)
        : undefined,
    };

    boundedPush(session.auditEntries, entry);
    persistAuditEntry(session, entry);

    session.events.emitEvent({
      type: 'tool_used',
      tool: toolName || 'unknown',
      timestamp: eventTimestamp(),
    });

    if (config.logLevel === 'debug') {
      process.stderr.write(`[AUDIT] ${entry.timestamp} ${entry.action}\n`);
    }

    return { continue: true };
  };

  /**
   * SubagentStart hook — tracks when a specialist agent begins work.
   * Resolves the real role name from the pending Task call queue.
   */
  const subagentStartHook = async (
    input: HookInput,
    _toolUseId: string | undefined,
    _options: { signal: AbortSignal }
  ): Promise<HookJSONOutput> => {
    const agentId = 'agent_id' in input ? (input.agent_id as string) : `agent-${Date.now()}`;

    // Resolve the real role name: prefer the Task tool call queue (accurate),
    // fall back to SDK's agent_type (usually "general-purpose").
    const pending = pendingTaskCalls.shift();
    const agentName = pending?.role
      || ('agent_type' in input ? (input.agent_type as string) : 'unknown');
    const taskDescription = pending?.task || '';

    session.activeSubagents.set(agentId, {
      role: agentName,
      startedAt: new Date().toISOString(),
    });

    const entry: AuditEntry = {
      timestamp: new Date().toISOString(),
      sessionId: session.id,
      agentRole: agentName as AuditEntry['agentRole'],
      action: `SubagentStart: ${agentName}`,
    };
    boundedPush(session.auditEntries, entry);
    persistAuditEntry(session, entry);

    session.events.emitEvent({
      type: 'agent_start',
      agentId,
      role: agentName,
      task: taskDescription,
      timestamp: eventTimestamp(),
    });

    if (config.logLevel === 'debug') {
      process.stderr.write(`[AUDIT] Subagent started: ${agentName} (${agentId}) — ${taskDescription.slice(0, 80)}\n`);
    }

    return { continue: true };
  };

  /**
   * SubagentStop hook — tracks when a specialist agent finishes.
   * Uses the role name stored at start time (from the resolved queue).
   */
  const subagentStopHook = async (
    input: HookInput,
    _toolUseId: string | undefined,
    _options: { signal: AbortSignal }
  ): Promise<HookJSONOutput> => {
    const agentId = 'agent_id' in input ? (input.agent_id as string) : '';

    // Use the role stored at start time (already resolved from Task queue)
    const startInfo = session.activeSubagents.get(agentId);
    const agentName = startInfo?.role
      || ('agent_type' in input ? (input.agent_type as string) : 'unknown');
    const stoppedAt = new Date().toISOString();
    const durationMs = startInfo
      ? new Date(stoppedAt).getTime() - new Date(startInfo.startedAt).getTime()
      : 0;

    const activity: SubagentActivity = {
      agentRole: agentName as SubagentActivity['agentRole'],
      startedAt: startInfo?.startedAt || stoppedAt,
      stoppedAt,
      durationMs,
      turnCount: 0,
      findingsPosted: 0,
      challengesIssued: 0,
      estimatedCost: 0,
    };
    boundedPush(session.subagentActivities, activity);
    session.activeSubagents.delete(agentId);

    const entry: AuditEntry = {
      timestamp: stoppedAt,
      sessionId: session.id,
      agentRole: activity.agentRole,
      action: `SubagentStop: ${agentName} (${(durationMs / 1000).toFixed(1)}s)`,
    };
    boundedPush(session.auditEntries, entry);
    persistAuditEntry(session, entry);

    session.events.emitEvent({
      type: 'agent_stop',
      agentId,
      role: agentName,
      durationMs,
      timestamp: eventTimestamp(),
    });

    if (config.logLevel === 'debug') {
      process.stderr.write(`[AUDIT] Subagent stopped: ${agentName} (${(durationMs / 1000).toFixed(1)}s)\n`);
    }

    return { continue: true };
  };

  return { auditLoggerHook, subagentStartHook, subagentStopHook };
}

/**
 * Compile the full audit trail at end of session.
 */
export function compileAuditTrail(session: SessionState, documentName: string, totalCost: number, totalTurns: number): AuditTrail {
  const trail: AuditTrail = {
    sessionId: session.id,
    startTimestamp: session.auditStartTimestamp,
    endTimestamp: new Date().toISOString(),
    totalCostUsd: totalCost,
    totalTurns,
    documentName,
    agentActivity: [...session.auditEntries],
    agentSummaries: [],
    subagentActivities: [...session.subagentActivities],
    verificationRecords: [],
    debateResolutions: [],
    humanGateDecisions: [],
  };

  // Include report card summary if available (v4)
  const reportCardSummary = session.reportCard ? {
    overallImprovement: session.reportCard.scores.overallImprovement,
    verificationPassRate: session.reportCard.verification.overallPassRate,
    totalFindings: session.reportCard.debate.totalFindings,
    precedentsApplied: session.reportCard.precedents.applied.length,
    precedentsSaved: session.reportCard.precedents.saved.length,
  } : undefined;

  finalizePersistentAudit(session, {
    sessionId: session.id,
    documentName,
    totalCostUsd: totalCost,
    totalTurns,
    totalEntries: session.auditEntries.length,
    subagentCount: session.subagentActivities.length,
    ...(reportCardSummary && { reportCardSummary }),
  });

  return trail;
}
