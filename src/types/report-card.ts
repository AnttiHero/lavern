/**
 * Session Report Card Types — Structured quality metrics from every session.
 *
 * The report card is the input to everything:
 * - Feedback loop reads it to update memory effectiveness
 * - Baselines aggregate it to establish quality expectations
 * - Regression tests compare it against baselines
 * - LEGAL.md compiler references it for agent performance data
 *
 * Compiled at session end by the compile_report_card tool.
 */

import type { Severity } from './index.js';

// ── Dimension Snapshots ─────────────────────────────────────────────────

export interface DimensionSnapshot {
  dimension: string;
  score: number;
  classification: 'RED' | 'YELLOW' | 'GREEN';
}

export interface DimensionDelta {
  dimension: string;
  before: number;
  after: number;
  delta: number;
  regressed: boolean;
}

// ── Agent Performance ───────────────────────────────────────────────────

export interface AgentPerformanceSnapshot {
  agentId: string;
  role: string;
  findingsCount: number;
  challengesReceived: number;
  challengesSurvived: number;
  averageConfidence: number;
  durationMs: number;
}

// ── The Report Card ─────────────────────────────────────────────────────

export interface SessionReportCard {
  sessionId: string;
  timestamp: string;
  documentType: string;
  jurisdiction: string;

  scores: {
    before: DimensionSnapshot[];
    after: DimensionSnapshot[];
    deltas: DimensionDelta[];
    overallImprovement: number;
  };

  verification: {
    selfVerification: { passed: boolean; confidence: number };
    crossVerification: { passed: boolean; confidence: number };
    scoreVerification: { passed: boolean; regressionCount: number };
    overallPassRate: number;
    overallConfidence: number;
  };

  debate: {
    totalFindings: number;
    findingsBySeverity: Record<Severity, number>;
    findingsByAgent: Record<string, number>;
    totalChallenges: number;
    totalResolutions: number;
    resolutionRate: number;
    averageResolutionConfidence: number;
  };

  precedents: {
    queried: string[];
    applied: string[];
    saved: string[];
  };

  agentPerformance: AgentPerformanceSnapshot[];

  gates: { type: string; decision: string; confidence: number }[];

  cost: { totalUsd: number; budgetUsd: number };
  durationMs: number;
}

// ── Memory Outcome Types ────────────────────────────────────────────────

export interface MemoryOutcome {
  sessionId: string;
  timestamp: string;
  applied: boolean;
  outcomeScore: number; // 0-1: how well did this memory help?
  notes?: string;
}

export interface PrecedentOutcome {
  sessionId: string;
  timestamp: string;
  applied: boolean;
  scoreDelta: number; // improvement in the dimension this precedent targets
  verificationPassed: boolean;
  notes?: string;
}

// ── Anti-Pattern ────────────────────────────────────────────────────────

export interface AntiPattern {
  id: string;
  documentType: string;
  jurisdiction: string;
  description: string;
  source: string; // session ID or agent that discovered it
  category: 'regression' | 'verification_failure' | 'gate_rejection' | 'performance' | 'other';
  severity: Severity;
  addedAt: string;
  occurrences: number;
  lastSeenAt: string;
  relatedPrecedentIds?: string[];
}
