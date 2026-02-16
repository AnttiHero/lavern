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

// ── Array size limits ─────────────────────────────────────────────────────
// Prevents unbounded growth of debate findings, challenges, audit entries, etc.
// MCP tools that push to session arrays should use boundedPush() for safety.

const MAX_ARRAY_SIZE = 5_000;

/**
 * Push an item to an array with a size cap. When the limit is hit,
 * the oldest 10% of entries are dropped. Returns the array for chaining.
 */
export function boundedPush<T>(arr: T[], item: T, max = MAX_ARRAY_SIZE): T[] {
  if (arr.length >= max) {
    arr.splice(0, Math.ceil(max * 0.1));
  }
  arr.push(item);
  return arr;
}

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

  /**
   * Update accumulated cost and emit a cost_update event.
   * Single source of truth for cost mutations.
   *
   * NOTE: The Claude Agent SDK only provides `total_cost_usd` at the END
   * of a query() call, not per-turn. So this is typically called once when
   * the session completes. The costTrackerHook still runs each turn but
   * will only see non-zero values after the first query finishes.
   */
  updateCost(cost: number): void {
    this.accumulatedCost = cost;
    this.events.emitEvent({
      type: 'cost_update',
      totalUsd: cost,
      budgetUsd: this.budgetUsd,
      timestamp: new Date().toISOString(),
    });
  }

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
