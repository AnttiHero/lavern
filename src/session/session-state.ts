/**
 * SessionState — The isolated state container for a single Shem session.
 *
 * BEFORE v3: All state was module-level (global). This meant:
 * - No concurrent sessions possible
 * - Tests needed reset*() functions everywhere
 * - No way to replay or inspect a session in isolation
 *
 * NOW: Every piece of mutable state lives in a SessionState instance.
 * Tools, hooks, and the MCP server all receive the session and read/write
 * through it. The EventBus is attached to the session for real-time events.
 */

import { ShemEventBus } from '../events/event-bus.js';
import { config } from '../config.js';
import type { GateResolver } from '../gates/gate-resolver.js';
import { ReadlineGateResolver } from '../gates/gate-resolver.js';
import type { DebateState, Finding, Challenge, Response, DebateResolution, DebateRound } from '../types/debate.js';
import type { WorkflowState, WorkflowStep, GenericWorkflowState } from '../types/workflow.js';
import type { AuditEntry, SubagentActivity } from '../types/audit.js';
import type { HumanGateDecision } from '../types/index.js';
import type { ClientIdentity } from '../types/client.js';
import type { SessionReportCard, DimensionSnapshot } from '../types/report-card.js';
import type { MatterRecord } from '../types/matter.js';

// ── Verification Result (moved from verification-engine module scope) ────

export interface VerificationResult {
  id: string;
  verificationType: 'self' | 'cross' | 'score';
  verifierRole: string;
  targetStep: string;
  passed: boolean;
  confidence: number;
  findings: string[];
  timestamp: string;
}

// ── Session State ────────────────────────────────────────────────────────

export class SessionState {
  public readonly id: string;
  public readonly events: ShemEventBus;
  public gateResolver: GateResolver;

  // ── Debate Board State ──
  public readonly debate: DebateState = {
    findings: [],
    challenges: [],
    responses: [],
    resolutions: [],
    rounds: [],
  };
  public debateCounters = {
    finding: 0,
    challenge: 0,
    response: 0,
    resolution: 0,
  };

  // ── Workflow State ──
  public workflow: WorkflowState = {
    currentStep: 'intake' as WorkflowStep,
    completedSteps: [],
    gateDecisions: {},
    startedAt: new Date().toISOString(),
    lastTransitionAt: new Date().toISOString(),
  };

  // ── Verification State ──
  public readonly verificationResults: VerificationResult[] = [];
  public verificationCounter = 0;

  // ── Approval Gate State ──
  public readonly gateDecisions: HumanGateDecision[] = [];

  // ── Audit State ──
  public readonly auditEntries: AuditEntry[] = [];
  public readonly subagentActivities: SubagentActivity[] = [];
  public readonly activeSubagents = new Map<string, { role: string; startedAt: string }>();
  public auditSessionId = '';
  public auditStartTimestamp = '';

  // ── Cost Tracker State ──
  public budgetUsd = 5.0;
  public accumulatedCost = 0;

  // ── Human Gate Enforcer State ──
  public readonly triggeredGates = new Set<string>();

  // ── Audit Persistence State ──
  public auditDir = config.auditDir;
  public auditCurrentFile: string | null = null;
  public auditLastHash = '';

  // ── Memory System State ──
  public memoryDir = config.memoryDir;

  // ── Client Identity (Phase 5) ──
  public clientIdentity?: ClientIdentity;

  // ── v5: Generic Workflow State ──
  public genericWorkflow?: GenericWorkflowState;
  public workflowTemplateId?: string;

  // ── v6: Risk Assessment State ──
  public riskAssessments: Array<{
    step: string;
    specialistRole: string;
    overallRiskScore: number;
    riskLevel: string;
    errorProbability: number;
    insurable: boolean;
    premiumEstimate: string;
    recommendations: string[];
    timestamp: string;
  }> = [];

  // ── Report Card & Learning State (v4) ──
  public beforeScores: DimensionSnapshot[] = [];
  public afterScores: DimensionSnapshot[] = [];
  public precedentsQueried: string[] = [];
  public precedentsApplied: string[] = [];
  public precedentsSaved: string[] = [];
  public reportCard: SessionReportCard | null = null;
  public reportsDir = config.reportsDir;
  public baselinesDir = config.baselinesDir;

  // ── v8: Pre-Engagement & Team Staffing State ──
  public matterRecord?: MatterRecord;
  public selectedTeam: string[] = [];
  public teamBudgetEstimate = 0;

  constructor(
    id?: string,
    options?: {
      gateResolver?: GateResolver;
      budgetUsd?: number;
      auditDir?: string;
      memoryDir?: string;
      clientIdentity?: ClientIdentity;
      reportsDir?: string;
      baselinesDir?: string;
    }
  ) {
    this.id = id || `shem-${Date.now()}`;
    this.events = new ShemEventBus();
    this.gateResolver = options?.gateResolver || new ReadlineGateResolver();
    if (options?.budgetUsd !== undefined) this.budgetUsd = options.budgetUsd;
    if (options?.auditDir) this.auditDir = options.auditDir;
    if (options?.memoryDir) this.memoryDir = options.memoryDir;
    if (options?.clientIdentity) this.clientIdentity = options.clientIdentity;
    if (options?.reportsDir) this.reportsDir = options.reportsDir;
    if (options?.baselinesDir) this.baselinesDir = options.baselinesDir;
  }
}
