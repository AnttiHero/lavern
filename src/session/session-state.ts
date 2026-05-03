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

import * as crypto from 'node:crypto';
import { ShemEventBus } from '../events/event-bus.js';
import { config } from '../config.js';
import { createLogger } from '../utils/logger.js';
import { recordSpend } from '../utils/spend-tracker.js';
import type { GateResolver } from '../gates/gate-resolver.js';

const logger = createLogger('SESSION');
import { ReadlineGateResolver } from '../gates/gate-resolver.js';
import type { DebateState, Finding, Challenge, Response, DebateResolution, DebateRound } from '../types/debate.js';
import type { WorkflowState, WorkflowStep, GenericWorkflowState, HandoffSummary } from '../types/workflow.js';
import type { AuditEntry, SubagentActivity } from '../types/audit.js';
import type { HumanGateDecision } from '../types/index.js';
import type { ClientIdentity } from '../types/client.js';
import type { SessionReportCard, DimensionSnapshot } from '../types/report-card.js';
import type { MatterRecord } from '../types/matter.js';
import type { ParsedDocument } from '../documents/types.js';
import type { VerificationPipelineState } from '../types/verification.js';

// ── Array size limits ─────────────────────────────────────────────────────
// Prevents unbounded growth of debate findings, challenges, audit entries, etc.
// MCP tools that push to session arrays should use boundedPush() for safety.

const MAX_ARRAY_SIZE = 5_000;

/** Tracks how many entries have been dropped by boundedPush across all arrays. */
export let boundedPushDropCount = 0;

/**
 * Push an item to an array with a size cap. When the limit is hit,
 * the oldest 10% of entries are dropped. Returns the array for chaining.
 */
export function boundedPush<T>(arr: T[], item: T, max = MAX_ARRAY_SIZE): T[] {
  if (arr.length >= max) {
    const dropCount = Math.ceil(max * 0.1);
    arr.splice(0, dropCount);
    boundedPushDropCount += dropCount;
    logger.warn('bounded_push_drop', { dropCount, total: boundedPushDropCount });
  }
  arr.push(item);
  return arr;
}

// ── Verification Summary ─────────────────────────────────────────────────

export interface VerificationSummary {
  /** Total number of verification checks executed. */
  totalChecks: number;
  /** Number of checks that passed. */
  passed: number;
  /** Number of checks that failed. */
  failed: number;
  /** Average confidence across all checks (0.0-1.0). */
  averageConfidence: number;
  /** Key issues found during verification (from failed checks). */
  keyIssues: string[];
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

// ── Revision (partner-style review loop) ────────────────────────────────

export interface Revision {
  /** 1-indexed version number. v1 is the original delivery, v2..vN are revisions. */
  version: number;
  /** The full markdown deliverable for this version. */
  document: string;
  /** Partner's notes that drove this revision. Empty for v1 (the original). */
  instructions: string;
  /** Wall-clock timestamp the revision landed. */
  createdAt: string;
  /** USD cost of producing this revision (0 for v1). */
  costUsd: number;
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

  /** Compiled verification report result (set by compile_verification_report tool). */
  public verification?: {
    passed: boolean;
    overallScore: number;
    passResults: Array<{ pass: string; score: number; findings: number }>;
  };
  /** Aggregated verification summary — populated after verification tools run. */
  public verificationSummary: VerificationSummary | null = null;

  /** 10-pass verification pipeline pass results (populated by record_pass_result tool). */
  public readonly verificationPassResults: Array<{
    pass: string;
    score: number;
    findingsCount: number;
    criticalCount: number;
    majorCount: number;
    minorCount: number;
    timestamp: string;
  }> = [];

  // ── Approval Gate State ──
  public readonly gateDecisions: HumanGateDecision[] = [];

  // ── Audit State ──
  public readonly auditEntries: AuditEntry[] = [];
  public readonly subagentActivities: SubagentActivity[] = [];
  public readonly activeSubagents = new Map<string, { role: string; startedAt: string }>();
  public auditSessionId = '';
  public auditStartTimestamp = '';

  // ── Emergency Stop ──
  public readonly haltController = new AbortController();
  private _haltReason: string | null = null;

  /**
   * Emergency stop — immediately signals all hooks to cease execution.
   * The PreToolUse halt-check hook will return { continue: false } on the
   * next tool call, which stops the SDK query() loop.
   */
  halt(reason: string): void {
    if (this._haltReason) return; // already halted
    this._haltReason = reason;
    this.haltController.abort(reason);
    this.events.emitEvent({
      type: 'error',
      message: `⛔ Emergency stop: ${reason}`,
      source: 'halt',
      timestamp: new Date().toISOString(),
    });
    logger.error('session_halted', { sessionId: this.id, reason });
  }

  isHalted(): boolean {
    return this._haltReason !== null;
  }

  get haltReason(): string | null {
    return this._haltReason;
  }

  // ── Circuit Breaker — Pause/Resume ──
  private _paused = false;
  private _pauseReason = '';

  /** Pause the session. Agents will stop at the next tool call boundary. */
  pause(reason: string): void {
    if (this._paused || this._haltReason) return;
    this._paused = true;
    this._pauseReason = reason;
    this.events.emitEvent({
      type: 'session_paused' as 'error', // reuse error type for compat
      message: `⏸ Session paused: ${reason}`,
      source: 'circuit-breaker',
      timestamp: new Date().toISOString(),
    });
    logger.info('session_paused', { sessionId: this.id, reason });
  }

  /** Resume a paused session. */
  resume(): void {
    if (!this._paused) return;
    this._paused = false;
    this._pauseReason = '';
    this.events.emitEvent({
      type: 'session_resumed' as 'error', // reuse error type for compat
      message: '▶ Session resumed',
      source: 'circuit-breaker',
      timestamp: new Date().toISOString(),
    });
    logger.info('session_resumed', { sessionId: this.id });
  }

  isPaused(): boolean {
    return this._paused;
  }

  get pauseReason(): string {
    return this._pauseReason;
  }

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
    const delta = cost - this.accumulatedCost;
    this.accumulatedCost = cost;
    this.events.emitEvent({
      type: 'cost_update',
      totalUsd: cost,
      budgetUsd: this.budgetUsd,
      timestamp: new Date().toISOString(),
    });
    // Feed the global daily-spend tracker IN REAL TIME — the circuit
    // breaker must fire even when a session loops without ever archiving.
    // Non-blocking: any error here must not disrupt the running session.
    if (delta > 0) {
      try {
        recordSpend(delta);
      } catch (err) {
        logger.warn('daily_spend_record_failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  // ── Human Gate Enforcer State ──
  public readonly triggeredGates = new Set<string>();

  // ── Memory Query Tracking ──
  /** Memory IDs queried during this session (for feedback loop targeting). */
  public readonly queriedMemoryIds = new Set<string>();

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

  // ── Handoff Summaries ──
  /** Structured handoff summaries recorded at each workflow phase transition. */
  public handoffs: HandoffSummary[] = [];

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

  // ── v14: User Identity (auth) ──
  /** ID of the authenticated user who created this session. */
  public userId?: string;

  // ── v17: Soul — User-defined firm personality ──
  /** Shapes how agents communicate, make decisions, and present their work. */
  public soul?: string;

  // ── v18: Per-Session Provider Selection ──
  /** LLM provider for this session. When set, overrides the global config.provider. */
  public provider?: 'anthropic' | 'mistral' | 'managed';

  // ── v12: Document Storage ──
  /** Parsed documents uploaded by the client, available to agents via MCP tools. */
  public documents: ParsedDocument[] = [];

  // ── v10: Agent API — Final Output Capture ──
  /** Accumulated final assistant output text (populated by streamMessages). */
  public finalOutput = '';

  // ── v15: Document Assembly — Clean Deliverable ──
  /** The assembled deliverable document, produced by the document-assembler after
   *  the multi-agent pipeline completes. This is the ACTUAL deliverable (ToS, review,
   *  memo) — separate from finalOutput which retains the process log for audit. */
  public assembledDocument = '';

  /** True while document assembly is running. Prevents TTL eviction from aborting assembly. */
  public isAssembling = false;

  /** Tabulate workflow result — set by document-assembler when workflow=tabulate
   *  and the orchestrator's JSON output validated. The download routes serve
   *  this as CSV / DOCX-with-tables / HTML / JSON. Typed as `unknown` here to
   *  avoid a circular import with the assembly module; the route casts to
   *  TabulateResult. */
  public tabulateResult: unknown = null;

  /** Revision history — partner-style review loop.
   *  Every time the partner sends the work product back with notes, a new
   *  revision is appended. v1 is the original (assembledDocument as it
   *  existed at delivery), v2..vN are produced by POST /api/sessions/:id/revise
   *  via a focused single-Opus call (cheap + fast: ~$0.50, 30-60s).
   *  Each revision is independently downloadable. */
  public revisions: Revision[] = [];

  /** Tiered output — tracks what's available at each quality level.
   *  Tier 1: Full deliverable (assembly passed all gates)
   *  Tier 2: Best-effort deliverable (assembly passed structural but not quality gate)
   *  Tier 3: Raw findings + debate (no assembly, but analysis is available)
   *  Tier 4: Partial findings (session halted/errored mid-analysis) */
  public outputTier: 1 | 2 | 3 | 4 = 4;
  public outputTierReason = '';

  /** The original legal request that created this session (stored for assembly context). */
  public legalRequest?: import('../types/index.js').LegalRequest;

  // ── v16: Verification Pipeline State ──
  /** 10-pass verification pipeline state. Initialized when pipeline starts. */
  public verificationPipeline?: VerificationPipelineState;

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
    this.id = id || `shem-${Date.now()}-${crypto.randomBytes(16).toString('hex')}`;
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
