/**
 * Types for the audit trail — every agent action logged for liability/insurance.
 *
 * v2: Added checksum chain for tamper evidence.
 * Added SubagentActivity for tracking agent start/stop/cost.
 * Added VerificationRecord for tracking verification loop results.
 */

import type { AgentRole, HumanGateDecision } from './index.js';

export interface AuditEntry {
  timestamp: string;
  sessionId: string;
  agentRole: AgentRole;
  action: string;
  toolName?: string;
  toolInput?: unknown;
  toolResponseSummary?: string;
  durationMs?: number;
  cost?: number;
  /** SHA-256 hash of previous entry for tamper-evident chain */
  previousHash?: string;
}

export interface SubagentActivity {
  agentRole: AgentRole;
  startedAt: string;
  stoppedAt?: string;
  durationMs?: number;
  turnCount: number;
  findingsPosted: number;
  challengesIssued: number;
  estimatedCost?: number;
}

export interface AgentActivitySummary {
  agentRole: AgentRole;
  invocations: number;
  findingsPosted: number;
  challengesIssued: number;
  challengesReceived: number;
  debateResolutions: number;
  averageConfidence?: number;
}

export interface DebateResolutionRecord {
  debateId: string;
  agents: AgentRole[];
  rounds: number;
  resolution: string;
  escalatedToHuman: boolean;
  confidence: number;
}

export interface VerificationRecord {
  verificationId: string;
  verificationType: 'self' | 'cross' | 'score';
  passed: boolean;
  confidence: number;
  findings: string[];
}

export interface AuditTrail {
  sessionId: string;
  startTimestamp: string;
  endTimestamp: string;
  totalCostUsd: number;
  totalTurns: number;
  documentName: string;
  agentActivity: AuditEntry[];
  subagentActivities: SubagentActivity[];
  agentSummaries: AgentActivitySummary[];
  debateResolutions: DebateResolutionRecord[];
  verificationRecords: VerificationRecord[];
  humanGateDecisions: HumanGateDecision[];
}
