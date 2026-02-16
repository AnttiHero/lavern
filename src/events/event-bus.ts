/**
 * Typed Event Bus — The nervous system of The Shem.
 *
 * Every state mutation in the system emits a typed event.
 * Consumers: WebSocket (visualization + agentic API), audit logger, cost tracker.
 *
 * Uses Node.js EventEmitter. All events are serializable JSON for
 * WebSocket transmission and JSONL replay.
 */

import { EventEmitter } from 'node:events';
import type { AgentRole, Severity } from '../types/index.js';
import type { WorkflowStep } from '../types/workflow.js';

// ── Event Types ──────────────────────────────────────────────────────────

export type ShemEvent =
  | { type: 'session_start'; sessionId: string; document: string; timestamp: string }
  | { type: 'session_end'; sessionId: string; totalCost: number; duration: number; timestamp: string }
  | { type: 'workflow_step'; step: WorkflowStep; previousStep: WorkflowStep; timestamp: string }
  | { type: 'agent_start'; agentId: string; role: string; task: string; timestamp: string }
  | { type: 'agent_stop'; agentId: string; role: string; durationMs: number; timestamp: string }
  | { type: 'finding_posted'; findingId: string; agent: string; category: string; severity: Severity; confidence: number; timestamp: string }
  | { type: 'challenge_posted'; challengeId: string; challenger: string; targetFindingId: string; timestamp: string }
  | { type: 'response_posted'; responseId: string; responder: string; challengeId: string; accepted: boolean; timestamp: string }
  | { type: 'debate_resolved'; resolutionId: string; topic: string; resolution: string; confidence: number; timestamp: string }
  | { type: 'gate_requested'; gateType: string; summary: string; details: string; timestamp: string }
  | { type: 'gate_decided'; gateType: string; decision: string; notes?: string; timestamp: string }
  | { type: 'verification_run'; verificationId: string; verificationType: string; passed: boolean; confidence: number; timestamp: string }
  | { type: 'tool_used'; tool: string; agent?: string; timestamp: string }
  | { type: 'cost_update'; totalUsd: number; budgetUsd: number; timestamp: string }
  | { type: 'memory_saved'; memoryType: string; key: string; timestamp: string }
  | { type: 'error'; message: string; source?: string; timestamp: string }
  // v4: Learning & Testing events
  | { type: 'report_card_compiled'; sessionId: string; overallImprovement: number; timestamp: string }
  | { type: 'feedback_loop_completed'; sessionId: string; precedentsUpdated: number; antiPatternsRecorded: number; timestamp: string }
  | { type: 'baseline_violation'; sessionId: string; dimension: string; severity: string; timestamp: string }
  | { type: 'legal_md_compiled'; entriesCount: number; timestamp: string }
  // v5: Router & Evaluator events
  | { type: 'routing_decision'; requestType: string; selectedWorkflow: string; complexity: string; reasoning: string; timestamp: string }
  | { type: 'evaluator_gate_run'; specialistRole: string; step: string; revisionNumber: number; timestamp: string }
  | { type: 'evaluator_gate_result'; passed: boolean; score: number; step: string; timestamp: string }
  // v6: Risk assessment events
  | { type: 'risk_assessment_requested'; step: string; timestamp: string }
  | { type: 'risk_assessment_completed'; riskLevel: string; score: number; step: string; timestamp: string }
  // v7: Error recovery events
  | { type: 'session_error'; sessionId: string; step: string; message: string; recoverable: boolean; timestamp: string }
  // v8: Pre-engagement events
  | { type: 'conflict_check_completed'; clientName: string; conflictFound: boolean; timestamp: string }
  | { type: 'kyc_completed'; clientName: string; riskLevel: string; timestamp: string }
  | { type: 'engagement_letter_generated'; estimatedBudget: number; feeStructure: string; timestamp: string }
  | { type: 'engagement_accepted'; matterId: string; timestamp: string }
  | { type: 'team_selected'; teamSize: number; roles: string[]; timestamp: string }
  | { type: 'matter_opened'; matterId: string; matterNumber: string; status: string; timestamp: string };

// ── Event Bus ────────────────────────────────────────────────────────────

const MAX_EVENTS = 10_000;
const EVICT_BATCH = 1_000; // Drop oldest 10% when limit is hit

export class ShemEventBus extends EventEmitter {
  private eventLog: ShemEvent[] = [];
  private recording = true;
  private droppedCount = 0;

  constructor() {
    super();
    this.setMaxListeners(50); // Multiple WebSocket clients + internal consumers
  }

  /**
   * Emit a typed event. All events are timestamped and recorded.
   * When the log exceeds MAX_EVENTS, the oldest batch is dropped.
   */
  emitEvent(event: ShemEvent): void {
    if (this.recording) {
      if (this.eventLog.length >= MAX_EVENTS) {
        this.eventLog.splice(0, EVICT_BATCH);
        this.droppedCount += EVICT_BATCH;
      }
      this.eventLog.push(event);
    }
    this.emit('event', event);
    this.emit(event.type, event);
  }

  /**
   * Get all recorded events (for replay, audit, or late-joining WebSocket clients).
   */
  getEventLog(): ShemEvent[] {
    return [...this.eventLog];
  }

  /**
   * Get events since a specific index (for reconnection/catch-up).
   * Note: indices are relative to the current log, not the original.
   */
  getEventsSince(index: number): ShemEvent[] {
    return this.eventLog.slice(index);
  }

  /**
   * Get the total number of recorded events (in current log).
   */
  getEventCount(): number {
    return this.eventLog.length;
  }

  /**
   * Whether older events have been truncated from the log.
   */
  get isTruncated(): boolean {
    return this.droppedCount > 0;
  }

  /**
   * Number of events dropped due to log size limits.
   */
  getDroppedCount(): number {
    return this.droppedCount;
  }

  /**
   * Stop recording events (useful when session ends).
   */
  stopRecording(): void {
    this.recording = false;
  }

  /**
   * Clear the event log.
   */
  clear(): void {
    this.eventLog.length = 0;
    this.droppedCount = 0;
  }
}

/**
 * Helper: create a timestamp for events.
 */
export function eventTimestamp(): string {
  return new Date().toISOString();
}
