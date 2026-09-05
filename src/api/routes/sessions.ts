/**
 * Session Routes — CRUD for analysis sessions.
 *
 * v5: POST /api/sessions now accepts two formats:
 *   - Legacy: { documentPath, context, options } → runTheShem()
 *   - New:    { request: LegalRequest, workflow?: string } → dispatch()
 *
 * POST   /api/sessions                  — Create a new analysis session
 * GET    /api/sessions                  — List active sessions
 * GET    /api/sessions/:id              — Get session status + metadata
 * GET    /api/sessions/:id/download     — Download work product (md, json, summary)
 * POST   /api/sessions/:id/derivatives  — Generate derivative document (memo, checklist, etc.)
 * POST   /api/sessions/:id/conversation — Ask the team (SSE streaming Q&A)
 * GET    /api/sessions/:id/events       — WebSocket event stream
 * POST   /api/sessions/:id/gate         — Submit gate decision
 * POST   /api/sessions/:id/inject       — Inject user voice/context message into feed
 * DELETE /api/sessions/:id              — Cancel session
 */

import type { FastifyInstance } from 'fastify';
import { SessionManager } from '../../session/session-manager.js';
import { AsyncGateResolver, AutoApproveGateResolver, WebhookGateResolver } from '../../gates/gate-resolver.js';
import { runTheShem } from '../../orchestrator.js';
import { dispatch } from '../../dispatch.js';
import { attachEventStream } from '../ws-handler.js';
import {
  CreateSessionSchema,
  GateDecisionSchema,
  DerivativeSchema,
  validateBody,
  validateDocumentPath,
  type CreateSessionBody,
  type GateDecisionBody,
  type DerivativeBody,
} from '../middleware/validation.js';
import { crossProviderChat } from '../../providers/cross-provider-chat.js';
import { DERIVATIVE_TYPES, DERIVATIVE_TYPE_LIST, buildFullContext } from '../derivatives/derivative-types.js';
import { agentProfiles } from '../../agents/profiles.js';
import { getOrchestratorForWorkflow } from '../../workflows/orchestrator-mapping.js';
import { getSessionArchive, getAllSessionArchive, getArchivedSession, getArchivedSessionById, getUserById, logAuditEvent, holdBillableHours, debitBillableHours, updateArchiveUserId, updateArchiveTitle, updateArchivedSummary } from '../../db/database.js';
import { getPrecedents } from '../../orchestration/precedents.js';
import { getLedger } from '../../orchestration/record-engagement-routing.js';
import { recordPanelistOutcomes } from '../../orchestration/panels.js';
import type { DissentResult } from '../../orchestration/dissent.js';
import type { Moment, Audience, Jurisdiction } from '../../types/index.js';
import type { ClientIdentity } from '../../types/client.js';
import { config } from '../../config.js';
import { checkDailySpendCap } from '../../utils/spend-tracker.js';
import type { ParsedDocument } from '../../documents/types.js';
import { getMatter } from './matters.js';
import { convertToDocx, convertToHtml, convertToPdf, extractSoulBranding, type DocumentStyle } from '../../assembly/format-converter.js';
import { validateDeliverable, isProcessDump } from '../../assembly/validate-deliverable.js';
import { assembleDocument } from '../../assembly/document-assembler.js';
import {
  convertTabulateToSingleCsv, convertTabulateToCsvBundle,
  convertTabulateToHtml, convertTabulateToDocx,
} from '../../assembly/tabulate-format-converter.js';
import type { TabulateResult } from '../../assembly/tabulate-types.js';
import { hydrateSessionFromArchive, isHydratedFromArchive, type HydratedSession } from '../../session/hydrate-from-archive.js';
import type { SessionState } from '../../session/session-state.js';
import { createLogger } from '../../utils/logger.js';
import { createMassActionGuard } from '../middleware/mass-action-guard.js';

const logger = createLogger('SESSIONS');
const massActionGuard = createMassActionGuard();

// Periodic cleanup of stale mass-action tracking entries (every 10 minutes)
setInterval(() => massActionGuard.cleanup(), 10 * 60_000);

/** Safely parse JSON, returning fallback on failure. */
function safeJsonParse<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try { return JSON.parse(json) as T; } catch { return fallback; }
}

/**
 * Build a Lavern-branded download filename from a session ID.
 *
 * The internal session ID format `shem-<timestamp>-<hex>` was leaking into
 * downloaded deliverable filenames (e.g. `shem-1777230605-7bf...-workproduct.docx`).
 * That's an internal codename — no client should ever see it. This produces
 * names like `Lavern-WorkProduct-2026-04-26-7bf52068.docx`.
 *
 * @param sessionId  The full internal session ID (e.g. `shem-1777230605765-7bf...`)
 * @param suffix     File suffix, with extension. e.g. `docx` or `summary.md`
 */
function lavernFilename(sessionId: string, suffix: string): string {
  // Pull the last 8 hex chars of the id for uniqueness; fall back to full id
  const hexMatch = sessionId.match(/[a-f0-9]{8,}$/i);
  const shortId = hexMatch ? hexMatch[0].slice(-8) : sessionId.replace(/^shem-/i, '').slice(0, 8);
  const today = new Date().toISOString().slice(0, 10);
  // Suffix may be a bare extension ("docx") or a dotted name ("summary.md")
  const tail = suffix.includes('.') ? suffix : suffix.toLowerCase();
  // Title-case the leading "WorkProduct" tag for bare-extension calls
  const isBareExt = !suffix.includes('.');
  const tag = isBareExt ? 'WorkProduct' : '';
  const parts = ['Lavern', tag, today, shortId].filter(Boolean);
  return `${parts.join('-')}.${tail}`.replace('..', '.');
}

/**
 * Pick a human-readable title for the session_archive row at create time.
 * Order: matter title → request text (first sentence) → first uploaded doc
 * (sans extension) → legacy documentPath basename. Returns '' when nothing
 * usable is available — caller leaves the early-archive default in place.
 */
function deriveCreateTitle(body: CreateSessionBody, session: SessionState): string {
  const matterTitle = session.matterRecord?.title?.trim();
  if (matterTitle) return matterTitle;

  const requestText = body.request?.requestText?.trim();
  if (requestText) {
    const oneLine = requestText.replace(/\s+/g, ' ');
    const sentenceEnd = oneLine.search(/[.?!]\s/);
    const cut = sentenceEnd > 0 ? oneLine.slice(0, sentenceEnd + 1) : oneLine;
    return cut.length > 100 ? cut.slice(0, 97).trimEnd() + '…' : cut;
  }

  const firstDoc = session.documents[0]?.name?.trim();
  if (firstDoc) return firstDoc.replace(/\.[^.]+$/, '');

  const legacyPath = body.documentPath?.trim();
  if (legacyPath) {
    const base = legacyPath.split(/[/\\]/).pop() ?? legacyPath;
    return base.replace(/\.[^.]+$/, '');
  }

  return '';
}

/** Check if the requesting user owns the session (or session has no owner). */
function checkSessionOwnership(
  request: unknown,
  session: { userId?: string },
): boolean {
  const requestUserId = (request as { userId?: string }).userId;
  // No owner set (legacy/anonymous sessions) — allow access
  if (!session.userId) return true;
  // No authenticated user — deny
  if (!requestUserId) return false;
  return requestUserId === session.userId;
}

/**
 * Audit fix H6: per-session async lock. Used by /revise to ensure two
 * concurrent submits don't race on `nextVersion` (which would double-charge
 * the user and push duplicate version numbers into the stack).
 *
 * Returns a `release` function on success, or `null` if a revision is
 * already in flight for this session.
 */
const revisionLocks = new Set<string>();
function acquireRevisionLock(sessionId: string): (() => void) | null {
  if (revisionLocks.has(sessionId)) return null;
  revisionLocks.add(sessionId);
  return () => { revisionLocks.delete(sessionId); };
}

/**
 * Audit fix H5: ownership guard for endpoints that fall back to the
 * hydrated archive shape. Returns `true` when the requester may access,
 * `false` to reject (404 to avoid disclosing existence).
 */
function checkSessionOrHydrateOwnership(
  request: unknown,
  session: SessionState | HydratedSession,
): boolean {
  return checkSessionOwnership(request, session as { userId?: string });
}

/**
 * Get a session for post-delivery operations (derivatives, conversation,
 * download). Returns the live in-memory session if available; otherwise
 * falls back to a read-only hydrated session from the archive.
 *
 * Returns `null` when no record exists anywhere.
 */
function getSessionOrHydrate(
  sessionManager: SessionManager,
  id: string,
): SessionState | HydratedSession | null {
  const live = sessionManager.getSession(id);
  if (live) return live;
  const archived = getArchivedSessionById(id);
  if (!archived) return null;
  return hydrateSessionFromArchive(archived);
}

export function registerSessionRoutes(
  fastify: FastifyInstance,
  sessionManager: SessionManager
): void {

  // ── POST /api/sessions — Create a new analysis session ──────────────
  //
  // Accepts two body formats:
  //   Legacy: { documentPath, context, options }
  //   v5:     { request: LegalRequest, workflow?: string, options }

  fastify.post('/api/sessions', {
    config: {
      rateLimit: {
        max: config.rateLimitSessionMax,
        timeWindow: config.rateLimitWindowMs,
      },
    },
  }, async (request, reply) => {
    // Validate request body
    const body = validateBody<CreateSessionBody>(CreateSessionSchema, request, reply);
    if (!body) return; // 400 already sent

    // Path safety check for document paths
    if (body.documentPath && !validateDocumentPath(body.documentPath, reply)) return;
    if (body.request?.documentPath && !validateDocumentPath(body.request.documentPath, reply)) return;

    // v10: Agent-aware gate resolver selection
    //   YOLO mode → AutoApproveGateResolver
    //   Agent with callbackUrl → WebhookGateResolver
    //   Agent without callbackUrl → AutoApproveGateResolver
    //   Human → AsyncGateResolver (waits for POST /gate)
    const yoloMode = body.options?.yoloMode === true;
    const client = (request as typeof request & { client?: ClientIdentity }).client;
    const isAgent = client?.type === 'agent';

    // LOCAL MODE: auth check removed — all sessions allowed
    const userId = (request as typeof request & { userId?: string }).userId;

    // Global daily spend cap — protect the founder's wallet
    const spendCheck = checkDailySpendCap();
    if (!spendCheck.allowed) {
      const retryAfterSec = Math.ceil((spendCheck.retryAfterMs ?? 3600_000) / 1000);
      reply.header('Retry-After', retryAfterSec.toString());
      return reply.status(503).send({
        error: 'Lavern is resting.',
        message: spendCheck.reason,
        retryAfterMs: spendCheck.retryAfterMs,
      });
    }

    // v27: Graceful overload protection — return 503 if at capacity
    const capacity = sessionManager.getCapacity();
    if (!capacity.available) {
      const retryAfterSec = Math.ceil(capacity.estimatedWaitMs / 1000);
      reply.header('Retry-After', retryAfterSec.toString());
      return reply.status(503).send({
        error: 'Lavern is at capacity.',
        current: capacity.current,
        max: capacity.max,
        retryAfterMs: capacity.estimatedWaitMs,
        message: `All ${capacity.max} session slots are in use. Estimated wait: ~${Math.ceil(retryAfterSec / 60)} minutes.`,
      });
    }

    // v21: Per-user monthly budget cap enforcement
    let sessionBudget = body.options?.budget ?? config.defaultBudgetUsd;

    // LOCAL MODE: billing + mass-action checks removed

    const gateResolver = yoloMode
      ? new AutoApproveGateResolver()
      : isAgent && client?.callbackUrl
        ? new WebhookGateResolver(client.callbackUrl)
        : isAgent
          ? new AutoApproveGateResolver()
          : new AsyncGateResolver();
    const session = sessionManager.createSession({
      gateResolver,
      budgetUsd: sessionBudget,
    });

    // Audit: session creation
    logAuditEvent({ userId: userId || undefined, action: 'session_create', resource: `session:${session.id}`, ip: request.ip, userAgent: request.headers['user-agent'] });

    // v14: Attach user identity for session archiving
    if (userId) {
      session.userId = userId;
      // Update the early-archive row with the user ID
      try { updateArchiveUserId(session.id, userId); } catch { /* non-fatal */ }

      // LOCAL MODE: billable hours hold removed

      // v17: Load soul from user profile
      try {
        const user = getUserById(userId);
        if (user?.profile_json) {
          const profile = JSON.parse(user.profile_json);
          if (typeof profile.soul === 'string' && profile.soul.trim()) {
            session.soul = profile.soul.trim();
          }
        }
      } catch (err) {
        logger.warn('Failed to parse soul from user profile', { userId, error: err });
      }
    }

    // v8: If matterId is provided, load the matter's team into the session
    const matterId = body.request?.matterId;
    if (matterId) {
      const matter = getMatter(matterId);
      if (matter && matter.assignedTeam.length > 0) {
        session.selectedTeam = matter.assignedTeam;
        session.matterRecord = matter;
      }
    }

    // v12: Store parsed documents in session state
    if (body.documents && Array.isArray(body.documents)) {
      session.documents = (body.documents as ParsedDocument[]).slice(0, 20);

      // SMAC-L1: Alert agents if any documents had invisible content stripped
      const sanitizedDocs = session.documents.filter(d => d.sanitizationLog && d.sanitizationLog.length > 0);
      if (sanitizedDocs.length > 0) {
        const totalRemoved = sanitizedDocs.reduce(
          (sum, d) => sum + (d.sanitizationLog?.reduce((s, e) => s + e.count, 0) ?? 0), 0,
        );
        session.events.emitEvent({
          type: 'tool_used',
          tool: `document_sanitization_warning: ${sanitizedDocs.length} doc(s), ${totalRemoved} hidden char(s) removed`,
          agent: 'system',
          timestamp: new Date().toISOString(),
        });
      }
    }

    // v13: Accept team roles from frontend staffing
    if (body.team && Array.isArray(body.team) && body.team.length > 0) {
      session.selectedTeam = body.team as string[];
    }

    // v18: Per-session provider selection
    if (body.options?.provider) {
      session.provider = body.options.provider;
    }

    // Overwrite the early-archive title now that documents / matter / request
    // are attached. Without this, every row in My Cases collapses to the
    // "Session Results" fallback set at sessionManager.createSession() time
    // (long before this handler sees the body).
    try {
      const derivedTitle = deriveCreateTitle(body, session);
      if (derivedTitle) {
        session.title = derivedTitle;
        updateArchiveTitle(session.id, derivedTitle);
      }
    } catch (err) {
      logger.warn('Failed to set session title', { sessionId: session.id, error: err });
    }

    if (body.request) {
      // v5 dispatch mode
      let legalRequest = body.request;

      // v0.14.4 — Auto-brief: when the user submits a brief instruction with
      // attached documents (the classic "covering email + contract" case),
      // read the docs and synthesise the actual task before dispatch. This
      // matches how Harvey/Spellbook avoid forcing users to retype prompts —
      // we go further by extracting the task from the cover doc itself.
      try {
        const { enrichRequestFromDocs } = await import('../intake/auto-brief.js');
        const enrichResult = await enrichRequestFromDocs(legalRequest, session.documents);
        if (enrichResult.enriched) {
          legalRequest = enrichResult.request;
          session.events.emitEvent({
            type: 'tool_used',
            tool: `auto_brief: enriched request from ${session.documents.length} document(s) (cost $${enrichResult.costUsd.toFixed(3)})`,
            agent: 'system',
            timestamp: new Date().toISOString(),
          });
        }
      } catch (err) {
        // Best effort. Never block dispatch on enrichment errors.
        logger.warn('Auto-brief enrichment errored, dispatching with original request', {
          sessionId: session.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      dispatch(legalRequest, {
        session,
        gateResolver,
        forceWorkflow: body.workflow,
        matterId,
        maxBudgetUsd: sessionBudget,
        model: body.options?.model,
        maxTurns: body.options?.maxTurns,
        intensity: body.options?.intensity,
        effort: body.options?.effort,
        yoloMode: body.options?.yoloMode,
        provider: body.options?.provider,
      }).catch((err) => {
        try {
          logger.error('Session failed', { sessionId: session.id, error: err });
          // Make the failure legible on the session itself: without this the
          // API kept reporting "intake, $0" forever for a session that died at start.
          session.halt(`Session failed: ${err instanceof Error ? err.message : String(err)}`);
          session.events.emitEvent({
            type: 'error',
            message: `Session failed: ${err instanceof Error ? err.message : String(err)}`,
            source: 'orchestrator',
            timestamp: new Date().toISOString(),
          });
          // Emit session_end so frontend transitions and session gets archived
          session.events.emitEvent({
            type: 'session_end',
            sessionId: session.id,
            totalCost: session.accumulatedCost,
            duration: Date.now() - new Date(session.workflow.startedAt).getTime(),
            timestamp: new Date().toISOString(),
          });
        } catch (innerErr) {
          logger.error('Session error handler failed', { sessionId: session.id, error: innerErr });
        }
      });
    } else if (body.documentPath) {
      // Legacy mode — runTheShem directly
      const context = {
        moment: body.context?.moment ?? 'signup' as Moment,
        audience: body.context?.audience ?? 'consumer' as Audience,
        jurisdiction: body.context?.jurisdiction ?? 'US' as Jurisdiction,
        documentType: body.context?.documentType,
        focus: body.context?.focus,
      };

      runTheShem(body.documentPath, context, {
        session,
        gateResolver,
        maxBudgetUsd: sessionBudget,
        model: body.options?.model,
        maxTurns: body.options?.maxTurns,
      }).catch((err) => {
        logger.error('Session failed', { sessionId: session.id, error: err });
        session.events.emitEvent({
          type: 'error',
          message: `Session failed: ${err instanceof Error ? err.message : String(err)}`,
          source: 'orchestrator',
          timestamp: new Date().toISOString(),
        });
        // Emit session_end so frontend transitions and session gets archived
        session.events.emitEvent({
          type: 'session_end',
          sessionId: session.id,
          totalCost: session.accumulatedCost,
          duration: Date.now() - new Date(session.workflow.startedAt).getTime(),
          timestamp: new Date().toISOString(),
        });
      });
    }

    return reply.status(201).send({
      sessionId: session.id,
      status: 'running',
      createdAt: new Date().toISOString(),
      endpoints: {
        status: `/api/sessions/${session.id}`,
        events: `/api/sessions/${session.id}/events`,
        gate: `/api/sessions/${session.id}/gate`,
        cancel: `/api/sessions/${session.id}`,
      },
    });
  });

  // ── GET /api/sessions — List active sessions ───────────────────────

  fastify.get('/api/sessions', async (request, reply) => {
    const userId = (request as typeof request & { userId?: string }).userId;
    const allSessions = sessionManager.getAllSessions();
    // Multi-user installs (auth on): scope the listing to the requester.
    // LOCAL MODE (the default in v0.15.0): userId is always 'local-user'.
    // Filtering on it would hide any session whose userId is something
    // else — historical sessions, CLI-created sessions, integration-test
    // fixtures — so we show everything instead. The CLI-backward-compat
    // branch (no userId at all) keeps working untouched.
    const activeSessions =
      userId && userId !== 'local-user'
        ? allSessions.filter(s => s.userId === userId)
        : allSessions;
    const active = activeSessions.map((s) => ({
      id: s.id,
      currentStep: s.genericWorkflow?.currentStep ?? s.workflow.currentStep,
      completedSteps: (s.genericWorkflow?.completedSteps ?? s.workflow.completedSteps).length,
      eventCount: s.events.getEventCount(),
      cost: s.accumulatedCost,
      budget: s.budgetUsd,
    }));

    // Archived sessions are surfaced separately via /api/sessions/archive and
    // routed through the delivery view (which hydrates from SQLite). Including
    // them here used to leak post-restart sessions into the "Active Sessions"
    // list, where clicking opened the working view and triggered a "Session
    // Expired" overlay because the WS handshake couldn't find them in memory.
    return reply.send({
      sessions: active,
      total: active.length,
    });
  });

  // ── GET /api/sessions/archive — List archived sessions for user ─────
  // IMPORTANT: Registered BEFORE /api/sessions/:id to prevent route shadowing.
  // Fastify's parametric `:id` would catch "archive" as the id value otherwise.

  fastify.get('/api/sessions/archive', async (request, reply) => {
    const userId = (request as typeof request & { userId?: string }).userId;

    // SECURITY: Anonymous access used to fall through to getAllSessionArchive(),
    // which leaked every user's titles, costs, deliverables across the server.
    // Closed in audit fix C1 — auth required for the archive list.
    if (!userId) {
      return reply.status(401).send({ error: 'Authentication required to view session archive.' });
    }

    const archived = getSessionArchive(userId);
    return reply.send({
      sessions: archived.map(s => ({
        id: s.id,
        title: s.title,
        status: s.status,
        workflowId: s.workflow_id,
        teamRoles: safeJsonParse(s.team_roles, []),
        findingsCount: s.findings_count,
        resolutionsCount: s.resolutions_count,
        costUsd: s.cost_usd,
        budgetUsd: s.budget_usd,
        createdAt: s.created_at,
        completedAt: s.completed_at,
        durationMs: s.duration_ms,
      })),
      total: archived.length,
    });
  });

  // ── GET /api/sessions/archive/:id — Get single archived session ────

  fastify.get('/api/sessions/archive/:id', async (request, reply) => {
    const userId = (request as typeof request & { userId?: string }).userId;
    const { id } = request.params as { id: string };

    // SECURITY: Anonymous access used to fall through to getArchivedSessionById(),
    // returning any user's full deliverable. Closed in audit fix C1.
    if (!userId) {
      return reply.status(401).send({ error: 'Authentication required to view archived session.' });
    }

    // Scope strictly to the authenticated user — owner-only.
    const session = getArchivedSession(id, userId);

    if (!session) {
      return reply.status(404).send({ error: `Archived session not found: ${id}` });
    }

    // v18: Serve assembled_document (clean deliverable), not final_output (process dump)
    return reply.send({
      id: session.id,
      title: session.title,
      status: session.status,
      workflowId: session.workflow_id,
      teamRoles: safeJsonParse(session.team_roles, []),
      findingsCount: session.findings_count,
      resolutionsCount: session.resolutions_count,
      costUsd: session.cost_usd,
      budgetUsd: session.budget_usd,
      assembledDocument: session.assembled_document || null,
      summary: safeJsonParse(session.summary_json, {}),
      createdAt: session.created_at,
      completedAt: session.completed_at,
      durationMs: session.duration_ms,
    });
  });

  // ── GET /api/sessions/:id — Get session status ─────────────────────

  fastify.get('/api/sessions/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = sessionManager.getSession(id);

    if (!session) {
      // Fallback: check archive (survives server restarts)
      const archived = getArchivedSessionById(id);
      if (archived) {
        const summary = safeJsonParse<Record<string, unknown>>(archived.summary_json, {});
        return reply.send({
          id: archived.id,
          workflow: {
            currentStep: 'delivered',
            completedSteps: Array.from({ length: archived.completed_steps_count ?? 0 }, (_, i) => `step-${i + 1}`),
            completedStepsCount: archived.completed_steps_count ?? 0,
            gateDecisions: [],
          },
          debate: {
            findingsCount: archived.findings_count,
            challengesCount: 0,
            resolutionsCount: archived.resolutions_count,
            unresolvedCount: 0,
          },
          verification: { resultsCount: 0, passed: 0, failed: 0 },
          cost: { accumulated: archived.cost_usd, budget: archived.budget_usd, remaining: archived.budget_usd - archived.cost_usd },
          eventCount: 0,
          pendingGate: null,
          evaluator: { results: [], bestScore: (summary as Record<string, unknown>).bestEvalScore ?? 0 },
          agentPerformance: [],
          assembledDocument: archived.assembled_document || null,
          finalOutput: archived.final_output || null,
          debateResolutions: ((summary as Record<string, unknown>).resolutions as Array<Record<string, unknown>>) ?? [],
          gateDecisionRecords: [],
          findings: (((summary as Record<string, unknown>).topFindings as Array<Record<string, unknown>>) ?? []).map(f => ({
            id: '', agent: f.agent ?? '', category: '', severity: f.severity ?? 'medium', content: f.content ?? '', evidence: '', confidence: 0,
          })),
          documents: [],
          beforeScores: (summary as Record<string, unknown>).beforeScores ?? null,
          afterScores: (summary as Record<string, unknown>).afterScores ?? null,
          reportCard: (summary as Record<string, unknown>).reportCard ?? null,
          // Hivemind + Dissent survive eviction via summary_json. Archives
          // written before the rename used `collectiveIntelligence`.
          hivemind: (summary as Record<string, unknown>).hivemind
            ?? (summary as Record<string, unknown>).collectiveIntelligence ?? [],
          dissents: (summary as Record<string, unknown>).dissents ?? [],
          quorumChecks: (summary as Record<string, unknown>).quorumChecks ?? [],
          qualityEscalation: (summary as Record<string, unknown>).qualityEscalation ?? null,
          outcome: (summary as Record<string, unknown>).outcome ?? null,
          outcomeReasons: (summary as Record<string, unknown>).outcomeReasons ?? [],
          matterTitle: archived.title,
          workflowTemplateId: archived.workflow_id,
          provider: 'anthropic',
          selectedTeam: safeJsonParse(archived.team_roles, []),
          halted: false,
          haltReason: null,
          durationMs: archived.duration_ms,
          _restored: true,  // flag so frontend knows this came from archive
        });
      }
      return reply.status(404).send({ error: `Session not found: ${id}` });
    }

    // Session ID is a capability token — individual GET by ID is intentionally public
    // (per v0.11.2 spec: "individual session access via ID remains public as a capability token").
    // Only enforce ownership for listing endpoints, not for direct ID lookup.

    const gateResolver = session.gateResolver;
    const pendingGate = gateResolver instanceof AsyncGateResolver
      ? gateResolver.getPendingGate()
      : null;

    // Compute evaluator results (from generic workflow state)
    const evaluatorResults = session.genericWorkflow?.evaluatorResults ?? [];
    const bestEvalScore = evaluatorResults.length > 0
      ? Math.max(...evaluatorResults.map(r => r.score))
      : 0;

    // Subagent performance summaries
    const agentPerformance = session.subagentActivities.map(a => ({
      role: a.agentRole,
      durationMs: a.durationMs,
      findingsPosted: a.findingsPosted,
      challengesIssued: a.challengesIssued,
    }));

    return reply.send({
      id: session.id,
      workflow: {
        currentStep: session.genericWorkflow?.currentStep ?? session.workflow.currentStep,
        completedSteps: session.genericWorkflow?.completedSteps ?? session.workflow.completedSteps,
        gateDecisions: session.genericWorkflow?.gateDecisions ?? session.workflow.gateDecisions,
      },
      debate: {
        findingsCount: session.debate.findings.length,
        challengesCount: session.debate.challenges.length,
        resolutionsCount: session.debate.resolutions.length,
        unresolvedCount: session.debate.findings.filter(
          (f) => !session.debate.resolutions.some(
            (r) => r.findingIds.includes(f.id)
          )
        ).length,
      },
      verification: {
        resultsCount: session.verificationResults.length,
        passed: session.verificationResults.filter((v) => v.passed).length,
        failed: session.verificationResults.filter((v) => !v.passed).length,
      },
      cost: {
        accumulated: session.accumulatedCost,
        budget: session.budgetUsd,
        remaining: session.budgetUsd - session.accumulatedCost,
        // Hivemind panel calls run outside the SDK cost pipeline — estimated.
        hivemindEstimated: session.hivemindCostUsd,
      },
      eventCount: session.events.getEventCount(),
      // Hivemind: per-agent model-routing decisions for this engagement.
      hivemind: session.hivemind,
      // Dissent Mode: independent-panel splits surfaced this engagement.
      dissents: session.dissents,
      // Hivemind quorum: panel checks run on CRITICAL verification findings.
      quorumChecks: session.quorumChecks,
      qualityEscalation: session.genericWorkflow?.qualityEscalation ?? null,
      outcome: session.outcome ?? null,
      outcomeReasons: session.outcomeReasons,
      pendingGate: pendingGate ? {
        gateId: pendingGate.gateId,
        artifactDigest: pendingGate.artifactDigest,
        requestedAt: pendingGate.requestedAt,
        gateType: pendingGate.gateType,
        summary: pendingGate.summary,
        details: pendingGate.details,
        proposedAction: pendingGate.proposedAction,
      } : null,

      // ── Rich data for delivery view ────────────────────────────────
      evaluator: {
        results: evaluatorResults.map(r => ({
          step: r.step,
          passed: r.passed,
          score: r.score,
          failureReasons: r.failureReasons,
          revisionNumber: r.revisionNumber,
          timestamp: r.timestamp,
        })),
        bestScore: bestEvalScore,
      },
      agentPerformance,
      // ── Deliverable content ────────────────────────────────────────
      assembledDocument: session.assembledDocument || null,
      finalOutput: session.finalOutput || null,
      debateResolutions: session.debate.resolutions.map(r => ({
        topic: r.debateTopic,
        resolution: r.resolution,
        winningPosition: r.winningPosition,
        evidenceWeight: r.evidenceWeight,
        escalationNeeded: r.escalationNeeded,
        confidence: r.confidence,
      })),
      gateDecisionRecords: session.gateDecisions.map(g => ({
        gateType: g.gateType,
        decision: g.decision,
        notes: g.notes,
      })),
      findings: session.debate.findings.map(f => ({
        id: f.id,
        agent: f.agentRole,
        category: f.findingType,
        severity: f.severity,
        content: f.content,
        evidence: f.evidence,
        confidence: f.confidence,
        groundingScore: f.groundingScore ?? null,
      })),

      // ── Confidence summary ──────────────────────────────────────
      confidenceSummary: (() => {
        const findings = session.debate.findings;
        const resolutions = session.debate.resolutions;
        const avgFinding = findings.length > 0
          ? findings.reduce((s, f) => s + f.confidence, 0) / findings.length : 0;
        const avgResolution = resolutions.length > 0
          ? resolutions.reduce((s, r) => s + r.confidence, 0) / resolutions.length : 0;
        const avgGrounding = findings.filter(f => f.groundingScore != null).length > 0
          ? findings.filter(f => f.groundingScore != null).reduce((s, f) => s + (f.groundingScore ?? 0), 0) / findings.filter(f => f.groundingScore != null).length : null;
        const avgVerification = session.verificationSummary?.averageConfidence ?? 0;
        const weights = config.confidenceWeights;
        const overall = (avgFinding * weights.findings) + (avgResolution * weights.resolutions)
          + (avgVerification * weights.verification) + (bestEvalScore * weights.evaluator);
        return {
          overall: Math.round(overall * 100) / 100,
          findings: Math.round(avgFinding * 100) / 100,
          resolutions: Math.round(avgResolution * 100) / 100,
          verification: Math.round(avgVerification * 100) / 100,
          grounding: avgGrounding != null ? Math.round(avgGrounding * 100) / 100 : null,
          evaluatorScore: Math.round(bestEvalScore * 100) / 100,
          lowConfidenceCount: findings.filter(f => f.confidence < 0.7).length,
        };
      })(),

      // ── Documents ──────────────────────────────────────────────────
      documents: session.documents.map(d => ({
        id: d.id,
        name: d.name,
        mimeType: d.mimeType,
        pageCount: d.pageCount,
        wordCount: d.wordCount,
        sectionCount: d.sections.length,
        definedTermCount: d.definedTerms.length,
        tableCount: d.tables.length,
      })),

      // ── Scores for delivery dimensions ───────────────────────────
      beforeScores: session.beforeScores,
      afterScores: session.afterScores,

      reportCard: session.reportCard ?? null,
      matterTitle: session.matterRecord?.title
        ?? session.documents[0]?.name?.replace(/\.[^.]+$/, '')
        ?? null,
      workflowTemplateId: session.workflowTemplateId ?? null,
      provider: session.provider ?? config.provider,
      selectedTeam: session.selectedTeam,
      outputTier: session.outputTier,
      outputTierReason: session.outputTierReason,
      halted: session.isHalted(),
      haltReason: session.haltReason,
      durationMs: (() => {
        const startedAt = session.genericWorkflow?.startedAt ?? session.workflow.startedAt;
        return startedAt ? Date.now() - new Date(startedAt).getTime() : 0;
      })(),
    });
  });

  // ── GET /api/sessions/:id/download — Download work product ─────────
  // v15: Serves assembledDocument (the clean deliverable) by default.
  // Supports: md, docx, pdf, json, summary, raw (process log)

  fastify.get('/api/sessions/:id/download', async (request, reply) => {
    const { id } = request.params as { id: string };
    // Session ID is a capability token; downloads work from the archive after
    // eviction/restart. All formats (md, docx, pdf, json) work on either path.
    const session = getSessionOrHydrate(sessionManager, id);

    if (!session) {
      return reply.status(404).send({ error: `Session not found: ${id}` });
    }
    // Audit follow-up: deliverable text is sensitive — owner-only. The
    // session-ID-as-capability model is fine for non-PII reads but the
    // assembled work product can leak attorney work-product if a URL is
    // shared / screenshotted / logged. Layered ownership check closes that.
    if (!checkSessionOrHydrateOwnership(request, session)) {
      return reply.status(404).send({ error: `Session not found: ${id}` });
    }

    const reqQuery = request.query as { format?: string; style?: string };
    const format = reqQuery.format ?? 'md';
    const title = session.matterRecord?.title ?? 'Work Product';

    // Validate document style
    const validStyles: DocumentStyle[] = ['traditional', 'elegant', 'accessible'];
    const style: DocumentStyle | undefined = validStyles.includes(reqQuery.style as DocumentStyle)
      ? (reqQuery.style as DocumentStyle)
      : undefined;

    // v18: The deliverable is the assembled document ONLY. Never fall back to finalOutput.
    // finalOutput contains the orchestrator's internal thinking/process log — serving
    // that as a work product would be catastrophic for credibility.
    const deliverable = session.assembledDocument || '';
    const soulBranding = extractSoulBranding(session.soul);

    // ── TABULATE downloads ─────────────────────────────────────────────
    // When the session ran the Tabulate workflow, its structured result lives
    // on session.tabulateResult. Serve it in any of: csv (single concatenated),
    // csv-bundle (multi-file zip), docx (Word with native tables), html
    // (self-contained preview), tabulate-json (just the structured result).
    // Falls through to the standard handlers if the format isn't tabulate-specific.
    if (session.workflowTemplateId === 'tabulate' && session.tabulateResult) {
      const tabulateResult = session.tabulateResult as TabulateResult;

      if (format === 'csv') {
        const csv = convertTabulateToSingleCsv(tabulateResult);
        return reply
          .header('Content-Type', 'text/csv; charset=utf-8')
          .header('Content-Disposition', `attachment; filename="${lavernFilename(id, 'csv')}"`)
          .send(csv);
      }

      if (format === 'csv-bundle') {
        // Return a JSON object of {filename: csv} — frontend can zip client-side
        // (avoids adding a JSZip backend dep). Most users will want format=csv.
        const bundle = convertTabulateToCsvBundle(tabulateResult);
        return reply
          .header('Content-Type', 'application/json; charset=utf-8')
          .send(bundle);
      }

      if (format === 'tabulate-html' || (format === 'html' && session.workflowTemplateId === 'tabulate')) {
        const html = convertTabulateToHtml(tabulateResult, title);
        return reply
          .header('Content-Type', 'text/html; charset=utf-8')
          .header('Content-Disposition', `attachment; filename="${lavernFilename(id, 'html')}"`)
          .send(html);
      }

      if (format === 'tabulate-docx' || (format === 'docx' && session.workflowTemplateId === 'tabulate')) {
        const buf = await convertTabulateToDocx(tabulateResult, title);
        return reply
          .header('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
          .header('Content-Disposition', `attachment; filename="${lavernFilename(id, 'docx')}"`)
          .send(buf);
      }

      if (format === 'tabulate-json') {
        return reply
          .header('Content-Type', 'application/json; charset=utf-8')
          .send(tabulateResult);
      }
      // Other formats (md, pdf, json, summary) fall through to standard
      // handlers — md uses the markdown rendering already stored in
      // session.assembledDocument (built by convertTabulateToMarkdown).
    }

    // For document formats (md, docx, pdf), validate before serving
    if (format === 'md' || format === 'docx' || format === 'pdf') {
      const validation = validateDeliverable(deliverable);
      if (!validation.valid) {
        logger.error('Blocked invalid deliverable', { sessionId: id, reason: validation.reason });
        return reply.status(503).send({
          error: 'The document is not ready. Assembly may still be in progress or failed. Try downloading structured data (JSON) instead, or retry later.',
          reason: validation.reason,
          hasFindings: session.debate.findings.length > 0,
        });
      }
    }

    if (format === 'md') {
      const filename = `${lavernFilename(id, 'md')}`;
      return reply
        .header('Content-Type', 'text/markdown; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .send(deliverable);
    }

    if (format === 'docx') {
      try {
        const docxBuffer = await convertToDocx(deliverable, title, style, soulBranding);
        const filename = `${lavernFilename(id, 'docx')}`;
        return reply
          .header('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
          .header('Content-Disposition', `attachment; filename="${filename}"`)
          .send(docxBuffer);
      } catch (err) {
        logger.error('DOCX conversion error', { sessionId: id, error: err });
        return reply.status(500).send({ error: 'Failed to generate DOCX. Try downloading as Markdown instead.' });
      }
    }

    if (format === 'pdf') {
      try {
        const { buffer, isRealPdf } = await convertToPdf(deliverable, title, style, soulBranding);
        if (isRealPdf) {
          const filename = `${lavernFilename(id, 'pdf')}`;
          return reply
            .header('Content-Type', 'application/pdf')
            .header('Content-Disposition', `attachment; filename="${filename}"`)
            .send(buffer);
        } else {
          // Puppeteer unavailable — serve styled HTML as fallback
          const filename = `${lavernFilename(id, 'html')}`;
          return reply
            .header('Content-Type', 'text/html; charset=utf-8')
            .header('Content-Disposition', `attachment; filename="${filename}"`)
            .send(buffer);
        }
      } catch (err) {
        logger.error('PDF conversion error', { sessionId: id, error: err });
        return reply.status(500).send({ error: 'Failed to generate PDF. Try downloading as Markdown instead.' });
      }
    }

    if (format === 'json') {
      const data = {
        sessionId: session.id,
        exportedAt: new Date().toISOString(),
        assembledDocument: session.assembledDocument || null,
        debate: {
          findings: session.debate.findings.map(f => ({
            id: f.id, agent: f.agentRole, category: f.findingType,
            severity: f.severity, content: f.content, evidence: f.evidence,
            confidence: f.confidence,
          })),
          resolutions: session.debate.resolutions.map(r => ({
            topic: r.debateTopic, resolution: r.resolution,
            winningPosition: r.winningPosition, evidenceWeight: r.evidenceWeight,
            escalationNeeded: r.escalationNeeded, confidence: r.confidence,
          })),
        },
        verification: session.verificationResults.map(v => ({
          type: v.verificationType, passed: v.passed, confidence: v.confidence,
        })),
        cost: {
          accumulated: session.accumulatedCost,
          budget: session.budgetUsd,
        },
      };
      const filename = `${lavernFilename(id, 'data.json')}`;
      return reply
        .header('Content-Type', 'application/json; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .send(JSON.stringify(data, null, 2));
    }

    if (format === 'summary') {
      // v19: Block summary download when assembly failed AND no findings exist.
      // A summary without assembled document AND without findings is a skeleton.
      const hasAssembledDoc = !!session.assembledDocument && session.assembledDocument.length > 100;
      const hasFindings = session.debate.findings.length > 0;
      const hasResolutions = session.debate.resolutions.length > 0;

      if (!hasAssembledDoc && !hasFindings && !hasResolutions) {
        logger.error('Blocked empty summary', { sessionId: id, reason: 'no document, no findings, no resolutions' });
        return reply.status(503).send({
          error: 'Summary not available. Document assembly failed and no analysis findings were produced. Try downloading structured data (JSON) instead.',
          reason: 'no_content',
        });
      }

      const lines: string[] = [];
      lines.push(`# ${title}`, '');
      lines.push(`**Date:** ${new Date().toLocaleDateString()}`, '');

      // Executive summary from assembled document only (never from process log)
      const source = session.assembledDocument;
      if (source) {
        const firstParagraph = source.split('\n\n').find(p => p.trim() && !p.startsWith('#'));
        if (firstParagraph) {
          lines.push('## Executive Summary', '', firstParagraph.trim(), '');
        }
      }

      // Key findings by severity
      const redFindings = session.debate.findings.filter(f => f.severity === 'RED');
      const yellowFindings = session.debate.findings.filter(f => f.severity === 'YELLOW');
      if (redFindings.length > 0 || yellowFindings.length > 0) {
        lines.push('## Key Findings', '');
        for (const f of redFindings) {
          lines.push(`- **[RED]** ${f.content}`);
        }
        for (const f of yellowFindings) {
          lines.push(`- **[YELLOW]** ${f.content}`);
        }
        lines.push('');
      }

      // Debate resolutions
      if (session.debate.resolutions.length > 0) {
        lines.push('## Resolutions', '');
        for (const r of session.debate.resolutions) {
          lines.push(`- **${r.debateTopic}:** ${r.resolution}`);
        }
        lines.push('');
      }

      // v19: Validate the assembled summary has substance before serving
      const summaryContent = lines.join('\n');
      if (summaryContent.length < 200) {
        logger.error('Blocked thin summary', { sessionId: id, chars: summaryContent.length });
        return reply.status(503).send({
          error: 'Summary content is insufficient. The analysis may not have produced enough findings. Try downloading structured data (JSON) instead.',
          reason: 'thin_summary',
        });
      }

      lines.push('---', '', '*This summary was generated from AI-assisted analysis. For matters involving regulatory filings, litigation, or binding contractual obligations, independent counsel verification is recommended.*', '');

      const filename = `${lavernFilename(id, 'summary.md')}`;
      return reply
        .header('Content-Type', 'text/markdown; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .send(lines.join('\n'));
    }

    // v15: Raw format — the original process log (for debugging/audit)
    if (format === 'raw') {
      const content = session.finalOutput || '# No process output\n\nNo orchestrator output was captured.';
      const filename = `${lavernFilename(id, 'processlog.md')}`;
      return reply
        .header('Content-Type', 'text/markdown; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .send(content);
    }

    return reply.status(400).send({ error: `Unknown format: ${format}. Use md, docx, pdf, json, summary, or raw.` });
  });

  // ── POST /api/sessions/:id/reassemble — Retry document assembly ────────
  //
  // Called when assembly timed out or failed. Re-runs assembleDocument()
  // using the session's existing finalOutput and legalRequest.

  fastify.post('/api/sessions/:id/reassemble', async (request, reply) => {
    const { id } = request.params as { id: string };
    const liveSession = sessionManager.getSession(id);

    // Audit fix H5: ownership guard. Session ID is the capability token,
    // but for POST mutations that bill the owner we layer a second check
    // so a leaked URL can't drain another user's billable hours.
    if (liveSession && !checkSessionOwnership(request, liveSession)) {
      return reply.status(404).send({ error: `Session not found: ${id}` });
    }

    // If session is not in memory, check the archive. If it already has a
    // valid assembled document there, return success. Otherwise we can't
    // reassemble a session that's no longer live.
    if (!liveSession) {
      const archived = getArchivedSessionById(id);
      if (!archived) return reply.status(404).send({ error: `Session not found: ${id}` });
      if (archived.user_id && !checkSessionOwnership(request, { userId: archived.user_id })) {
        return reply.status(404).send({ error: `Session not found: ${id}` });
      }
      if (archived.assembled_document && validateDeliverable(archived.assembled_document).valid) {
        return reply.send({ success: true, hasDocument: true, message: 'Document already assembled (from archive).' });
      }
      return reply.status(409).send({
        error: 'This session is no longer in memory and does not have a completed deliverable to reassemble. Please start a new session.',
      });
    }

    const session = liveSession;

    // Guard: already have a valid assembled document
    if (session.assembledDocument && validateDeliverable(session.assembledDocument).valid) {
      return reply.send({ success: true, hasDocument: true, message: 'Document already assembled.' });
    }

    // Guard: need finalOutput to assemble from
    if (!session.finalOutput || session.finalOutput.length < 100) {
      return reply.status(409).send({
        error: 'Session has no pipeline output to assemble from. The workflow may still be running.',
      });
    }

    try {
      const result = await assembleDocument(session, session.legalRequest);

      if (result && result.length > 0) {
        session.assembledDocument = result;
        return reply.send({ success: true, hasDocument: true });
      }

      return reply.status(503).send({
        error: 'Assembly produced no output. Please try again.',
        success: false,
      });
    } catch (err) {
      logger.error('Reassembly failed', { sessionId: id, error: err });
      // Audit follow-up: generic client message; full error to server logs only.
      return reply.status(500).send({ error: 'Assembly failed. Please try again.' });
    }
  });

  // ── POST /api/sessions/:id/derivatives — Generate derivative document ──

  fastify.post('/api/sessions/:id/derivatives', async (request, reply) => {
    const { id } = request.params as { id: string };
    // Session ID is a capability token — post-delivery endpoints work from
    // the archive if the session has been evicted or the server restarted.
    const session = getSessionOrHydrate(sessionManager, id);

    if (!session) {
      return reply.status(404).send({ error: `Session not found: ${id}` });
    }
    // Audit fix H5: layered ownership check for billed mutations.
    if (!checkSessionOrHydrateOwnership(request, session)) {
      return reply.status(404).send({ error: `Session not found: ${id}` });
    }

    const body = validateBody<DerivativeBody>(DerivativeSchema, request, reply);
    if (!body) return;

    const derivativeType = DERIVATIVE_TYPES[body.type];
    if (!derivativeType) {
      return reply.status(400).send({
        error: `Unknown derivative type: ${body.type}`,
        availableTypes: DERIVATIVE_TYPE_LIST.map(t => t.id),
      });
    }

    // Check that session has a valid assembled deliverable to derive from.
    // v18: Never generate derivatives from finalOutput (process dump).
    const deliverableValidation = validateDeliverable(session.assembledDocument || '');
    if (!deliverableValidation.valid) {
      return reply.status(409).send({
        error: 'The primary work product is not ready yet. Wait for document assembly to complete, or retry later.',
        reason: deliverableValidation.reason,
      });
    }

    try {
      // Assemble context from session state. HydratedSession is structurally
      // compatible with the read-only fields buildContext uses (verified in
      // hydrate-from-archive.ts — see tests).
      const context = derivativeType.buildContext(session as SessionState);

      // Provider-aware single-turn call. Local mode uses Gemma; cloud uses Opus.
      const { text: generatedContent } = await crossProviderChat({
        system: derivativeType.systemPrompt,
        user: context,
        tier: 'opus',
        maxTokens: 8192,
        timeoutMs: 240_000, // longer for local
      });

      if (!generatedContent) {
        throw new Error('No content generated');
      }

      // v18: Reject if the model produced process-dump text instead of a document
      if (isProcessDump(generatedContent)) {
        logger.error('Derivative generation produced process dump', { type: body.type });
        return reply.status(503).send({
          error: 'Generation produced internal processing notes instead of a document. Please try again.',
        });
      }

      const format = body.format ?? 'md';
      const style = body.style as DocumentStyle | undefined;
      const derivBranding = extractSoulBranding(session.soul);

      // Convert to requested format
      if (format === 'docx') {
        const docxBuffer = await convertToDocx(generatedContent, derivativeType.title, style, derivBranding);
        const safeTitle = derivativeType.title.replace(/[^a-zA-Z0-9-_]/g, '-');
        reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        reply.header('Content-Disposition', `attachment; filename="${lavernFilename(id, `${safeTitle}.docx`)}"`);
        return reply.send(Buffer.from(docxBuffer));
      }

      if (format === 'html') {
        const html = convertToHtml(generatedContent, derivativeType.title, style, derivBranding);
        const safeTitle = derivativeType.title.replace(/[^a-zA-Z0-9-_]/g, '-');
        reply.header('Content-Type', 'text/html; charset=utf-8');
        reply.header('Content-Disposition', `attachment; filename="${lavernFilename(id, `${safeTitle}.html`)}"`);
        return reply.send(html);
      }

      // Default: return raw markdown as JSON
      return reply.send({
        content: generatedContent,
        title: derivativeType.title,
        type: body.type,
        sessionId: id,
      });
    } catch (err) {
      logger.error('Derivative generation failed', { type: body.type, error: err });
      // Audit follow-up: generic client message; full error to server logs only.
      return reply.status(500).send({ error: `Failed to generate ${derivativeType.title}.` });
    }
  });

  // ── GET /api/sessions/:id/derivative-types — List available types ──────

  fastify.get('/api/sessions/:id/derivative-types', async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = sessionManager.getSession(id);

    if (!session || !checkSessionOwnership(request, session)) {
      return reply.status(404).send({ error: `Session not found: ${id}` });
    }

    return reply.send({
      types: DERIVATIVE_TYPE_LIST,
      sessionHasOutput: !!session.assembledDocument,
    });
  });

  // ── POST /api/sessions/:id/conversation — Ask the team ──────────────

  fastify.post('/api/sessions/:id/conversation', async (request, reply) => {
    const { id } = request.params as { id: string };
    // Works from archive if evicted/restarted.
    const session = getSessionOrHydrate(sessionManager, id);

    if (!session) {
      return reply.status(404).send({ error: `Session not found: ${id}` });
    }
    // Audit fix H5: layered ownership check for billed mutations.
    if (!checkSessionOrHydrateOwnership(request, session)) {
      return reply.status(404).send({ error: `Session not found: ${id}` });
    }

    if (!session.assembledDocument) {
      return reply.status(409).send({
        error: 'Session has not produced a work product yet. Wait for the analysis to complete.',
      });
    }

    const body = request.body as {
      message?: string;
      history?: { role: 'user' | 'assistant'; content: string }[];
    } | undefined;

    if (!body?.message || typeof body.message !== 'string' || body.message.trim().length === 0) {
      return reply.status(400).send({ error: 'message is required.' });
    }

    // Validate input limits
    if (body.message.length > 10_000) {
      return reply.status(400).send({ error: 'message must be under 10,000 characters.' });
    }

    // Validate and sanitize conversation history — only allow user/assistant roles
    // to prevent prompt injection via 'system' or other role values.
    const rawHistory = Array.isArray(body.history) ? body.history.slice(-40) : []; // Cap at 40 turns
    const validRoles = new Set(['user', 'assistant']);
    const history = rawHistory.filter(
      (entry): entry is { role: 'user' | 'assistant'; content: string } =>
        entry != null &&
        typeof entry === 'object' &&
        typeof entry.role === 'string' &&
        validRoles.has(entry.role) &&
        typeof entry.content === 'string' &&
        entry.content.length <= 50_000
    );

    // Resolve orchestrator personality from workflow template
    const workflowId = session.workflowTemplateId ?? 'counsel';
    const orchestratorRole = getOrchestratorForWorkflow(workflowId);
    const profile = agentProfiles[orchestratorRole];

    const personaBlock = profile
      ? `You are ${profile.displayName} — ${profile.tagline}\n\n${profile.personality.workStyle}\n`
      : 'You are the senior partner who led this analysis.\n';

    // Build system prompt with full session context
    const systemPrompt = `${personaBlock}
You led the analysis team on this matter. Below is the complete session context — every finding, resolution, score, and the full work product your team produced.

Answer the user's questions thoroughly, referencing specific findings, resolutions, and scores from the analysis. You can:
- Explain any finding or resolution in detail
- Draft alternative contract clauses or language
- Suggest additional analyses or next steps
- Compare different approaches with pros and cons
- Provide risk assessments on specific questions
- Summarize sections of the work product

Be direct, specific, and cite evidence from the analysis. If the user asks about something not covered in the analysis, say so clearly.

${buildFullContext(session as SessionState)}`;

    // Build prompt from conversation history + new message
    const historyBlock = history
      .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n\n');

    const prompt = historyBlock
      ? `${historyBlock}\n\nUser: ${body.message.trim()}`
      : body.message.trim();

    try {
      // Provider-aware single-turn call (local Gemma or cloud Opus).
      const { text: answer } = await crossProviderChat({
        system: systemPrompt,
        user: prompt,
        tier: 'opus',
        maxTokens: 4096,
        timeoutMs: 240_000,
      });

      logger.info('Conversation answered', { sessionId: id, chars: answer.length });

      return reply.send({
        content: answer,
        stopReason: 'end_turn',
      });
    } catch (err) {
      logger.error('Conversation failed', { sessionId: id, error: err instanceof Error ? err.message : String(err) });
      // M17: generic client message; full error stays in server logs.
      return reply.status(500).send({ error: 'Conversation failed. Please try again.' });
    }
  });

  // ── GET /api/sessions/:id/revisions — list revision history ──────────
  // Returns v1..vN. v1 is always the original delivery; vN is the latest.
  fastify.get('/api/sessions/:id/revisions', async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = getSessionOrHydrate(sessionManager, id);
    if (!session) return reply.status(404).send({ error: `Session not found: ${id}` });
    // Audit fix H5: deliverable text is sensitive — owner-only.
    if (!checkSessionOrHydrateOwnership(request, session)) {
      return reply.status(404).send({ error: `Session not found: ${id}` });
    }

    // Ensure v1 is seeded from assembledDocument. Works for both live
    // sessions (mutation persists) and hydrated archive sessions (mutation
    // is ephemeral but the response still contains v1).
    const sessionRecord = session as SessionState;
    if (!sessionRecord.revisions) {
      // Hydrated archive sessions lack the field — initialize so we can seed v1.
      (sessionRecord as unknown as { revisions: SessionState['revisions'] }).revisions = [];
    }
    if (sessionRecord.revisions.length === 0 && sessionRecord.assembledDocument) {
      sessionRecord.revisions.push({
        version: 1,
        document: sessionRecord.assembledDocument,
        instructions: '',
        createdAt: new Date().toISOString(),
        costUsd: 0,
      });
    }

    const revisions = (sessionRecord.revisions ?? []).map(r => ({
      version: r.version,
      instructions: r.instructions,
      createdAt: r.createdAt,
      costUsd: r.costUsd,
      chars: r.document.length,
    }));
    return reply.send({ sessionId: id, revisions });
  });

  // ── POST /api/sessions/:id/revise — partner-style review loop ────────
  // The partner returns the work product with notes; the team produces v2.
  // Single Opus call (focused, fast, ~$0.50, 30-60s) — not a full re-run
  // of the multi-agent pipeline. Stack semantics: every revision is kept.
  //
  // Audit hardening (C2 + H5 + H6 + H8 + M11):
  //   C2 — reject hydrated archive sessions: the in-memory `revisions` push
  //        is request-scoped on hydrated objects and would silently lose
  //        the user's $0.50 work product on response. Until we add a real
  //        session_revisions persistence layer, fail fast with a clear 409.
  //   H5 — owner-only access (checked above on getSessionOrHydrate).
  //   H6 — per-session lock so two concurrent submits don't race on
  //        nextVersion, double-charge, or push duplicate version numbers.
  //   H8 — debit billable hours BEFORE the LLM call, with idempotency on
  //        `revision:<sessionId>:<version>`. No more free revisions.
  //   M11 — 90s timeout to give up before reverse proxies kill the request.
  //
  // Body: { instructions: string }
  // Returns: { version, document, costUsd, createdAt }
  fastify.post('/api/sessions/:id/revise', async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = getSessionOrHydrate(sessionManager, id);
    if (!session) return reply.status(404).send({ error: `Session not found: ${id}` });

    if (!checkSessionOrHydrateOwnership(request, session)) {
      return reply.status(404).send({ error: `Session not found: ${id}` });
    }

    // C2 — reject hydrated sessions: mutations are request-scoped (lost on
    // GC) and the cost would not be billed. Show the user a clear path.
    if (isHydratedFromArchive(session)) {
      return reply.status(409).send({
        error: 'This engagement has been archived. Download the current version, then start a new engagement to make changes.',
        code: 'SESSION_ARCHIVED',
      });
    }

    const sessionRecord = session as SessionState;
    if (!sessionRecord.assembledDocument) {
      return reply.status(409).send({
        error: 'No work product to revise. Wait for the analysis to complete first.',
      });
    }

    const body = request.body as { instructions?: string } | undefined;
    const instructions = (body?.instructions ?? '').trim();
    if (!instructions) {
      return reply.status(400).send({ error: 'instructions are required.' });
    }
    if (instructions.length > 8_000) {
      return reply.status(400).send({ error: 'instructions must be under 8,000 characters.' });
    }

    // H6 — per-session lock. acquireRevisionLock returns null if a revision
    // is already in flight for this session; the second caller is rejected.
    const release = acquireRevisionLock(id);
    if (!release) {
      return reply.status(409).send({
        error: 'Another revision is already in progress for this session. Wait for it to finish.',
        code: 'REVISION_IN_PROGRESS',
      });
    }

    try {
      // Seed v1 lazily from assembledDocument if this is the first revision.
      if (!sessionRecord.revisions) sessionRecord.revisions = [];
      if (sessionRecord.revisions.length === 0) {
        sessionRecord.revisions.push({
          version: 1,
          document: sessionRecord.assembledDocument,
          instructions: '',
          createdAt: new Date().toISOString(),
          costUsd: 0,
        });
      }

      const previous = sessionRecord.revisions[sessionRecord.revisions.length - 1];
      const nextVersion = previous.version + 1;

      // H8 — debit a per-revision estimate (~$0.50 worth of hours) BEFORE
      // the LLM call. Idempotent on `revision:<sessionId>:<version>`.
      // LOCAL MODE (the default in v0.15.0): userId is always 'local-user'
      // and there is no billing surface, so the debit would always 402 on
      // a fresh install. Skip it — matches the pattern at the session-list
      // route above and `billing: config.authEnabled` in capabilities.ts.
      const REVISION_ESTIMATE_USD = 0.50;
      const userId = sessionRecord.userId;
      if (userId && userId !== 'local-user') {
        const hoursToDebit = REVISION_ESTIMATE_USD / config.billableHours.rate;
        const referenceId = `revision:${id}:${nextVersion}`;
        const debited = debitBillableHours(userId, hoursToDebit, `Revision v${nextVersion} for session ${id}`, referenceId);
        if (!debited) {
          return reply.status(402).send({
            error: 'Insufficient billable hours for this revision. Top up to continue.',
            code: 'INSUFFICIENT_HOURS',
          });
        }
      }

      // Build the revision system prompt — partner-associate metaphor explicit,
      // tight constraints to PRESERVE everything not called out.
      const system = `You are a senior legal associate. Your partner has reviewed your draft work product and returned it with notes.

Your job: produce a revised version that addresses every note the partner raised. Strict rules:

1. PRESERVE everything the partner did NOT call out. If a section is not addressed by the notes, leave it word-for-word identical to v${previous.version}. Do not "improve" things you weren't asked to change.

2. Where the partner asks for a specific change, make ONLY that change. Don't rewrite adjacent material that is fine.

3. Maintain the same overall structure, headings, voice, citation style, and formatting unless the partner explicitly requests a structural change.

4. If a note is unclear, make your best interpretation, proceed, and continue. Do not ask for clarification — produce the revision.

5. If the partner's note is incompatible with the document (e.g. asks you to add a fall-back position on a question that doesn't exist), fold it in where it makes sense and add a brief italicised note like "*[partner: revisit if this isn't where you wanted it]*" — only as a last resort.

6. Output ONLY the revised work product as clean markdown. No preamble. No "Here is the revised version." No commentary. Start with the first heading or paragraph. End where the document ends.`;

      const user = `## Previous version (v${previous.version})

${previous.document}

## Partner's notes for this revision

${instructions}

## Now produce v${nextVersion}

Apply the partner's notes following the rules in your system prompt. Preserve everything else verbatim.`;

      const startedAt = Date.now();
      // Revisions are intrinsically slow: Opus has to reproduce most of the
      // document verbatim with targeted edits, so output length ≈ input
      // length. Local models are far slower per token. The previous 90s
      // ceiling cut almost every non-trivial revision short, and the default
      // retry policy then multiplied a single timeout into a 5–6 minute wait
      // before the user got a generic 500. Give the call real headroom and
      // disable retries — retrying a slow call doesn't make it faster.
      const isLocal = config.provider === 'local';
      const { text: revisedDoc, cost: costUsd } = await crossProviderChat({
        system,
        user,
        tier: 'opus',
        maxTokens: 16_000,
        timeoutMs: isLocal ? 600_000 : 300_000,
        maxRetries: 0,
      });

      if (!revisedDoc || revisedDoc.trim().length < 200) {
        throw new Error(`Revision produced only ${revisedDoc?.length ?? 0} chars — likely failed.`);
      }

      const revision = {
        version: nextVersion,
        document: revisedDoc.trim(),
        instructions,
        createdAt: new Date().toISOString(),
        costUsd,
      };
      sessionRecord.revisions.push(revision);

      // Note: we do NOT overwrite assembledDocument. v1 stays canonical;
      // the latest revision is fetched explicitly by the frontend.

      // Track session-level cost (separate from billable-hours debit above).
      if (costUsd > 0 && typeof sessionRecord.updateCost === 'function') {
        sessionRecord.updateCost(sessionRecord.accumulatedCost + costUsd);
      }

      logger.info('Revision produced', {
        sessionId: id,
        version: nextVersion,
        chars: revision.document.length,
        costUsd: costUsd.toFixed(4),
        durationMs: Date.now() - startedAt,
      });

      return reply.send(revision);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      logger.error('Revision failed', { sessionId: id, error: message, stack });

      // M17: keep stack traces server-side. But surface *timeout* failures
      // distinctly so the user knows the call ran out of time rather than
      // hitting some opaque server error — they can retry with a tighter
      // scope (smaller doc / fewer changes) instead of just hitting "Try
      // again" repeatedly with the same input.
      const isTimeout = /timeout|timed out|aborted/i.test(message);
      if (isTimeout) {
        return reply.status(504).send({
          error: 'Revision is taking longer than expected. Try sending fewer or smaller changes — long revisions sometimes exceed the model time budget.',
          code: 'REVISION_TIMEOUT',
        });
      }
      return reply.status(500).send({ error: 'Revision failed. Please try again.' });
    } finally {
      release();
    }
  });

  // ── GET /api/sessions/:id/revisions/:version — fetch one revision ────
  fastify.get('/api/sessions/:id/revisions/:version', async (request, reply) => {
    const { id, version } = request.params as { id: string; version: string };
    const session = getSessionOrHydrate(sessionManager, id);
    if (!session) return reply.status(404).send({ error: `Session not found: ${id}` });
    // Audit fix H5: deliverable text is sensitive — owner-only.
    if (!checkSessionOrHydrateOwnership(request, session)) {
      return reply.status(404).send({ error: `Session not found: ${id}` });
    }

    const sessionRecord = session as SessionState;
    if (!sessionRecord.revisions) {
      // Hydrated archive sessions lack the field — initialize so we can seed v1.
      (sessionRecord as unknown as { revisions: SessionState['revisions'] }).revisions = [];
    }
    if (sessionRecord.revisions.length === 0 && sessionRecord.assembledDocument) {
      sessionRecord.revisions.push({
        version: 1,
        document: sessionRecord.assembledDocument,
        instructions: '',
        createdAt: new Date().toISOString(),
        costUsd: 0,
      });
    }

    const v = parseInt(version, 10);
    const rev = (sessionRecord.revisions ?? []).find(r => r.version === v);
    if (!rev) return reply.status(404).send({ error: `Revision v${version} not found.` });
    return reply.send(rev);
  });

  // ── GET /api/sessions/:id/events — WebSocket event stream ──────────
  // SECURITY NOTE: WebSocket access is gated by session ID knowledge.
  // For anonymous/QuickStart sessions (no userId), knowing the session ID
  // is the auth token — this is by design since session IDs are unguessable
  // UUIDs. For authenticated sessions, checkSessionOwnership() enforces
  // that only the creating user can connect. This mirrors the REST API's
  // session-ID-as-capability-token model used for POST /api/sessions/*.

  fastify.get('/api/sessions/:id/events', { websocket: true }, (socket, request) => {
    const { id } = request.params as { id: string };
    const session = sessionManager.getSession(id);

    if (!session) {
      socket.send(JSON.stringify({ error: `Session not found: ${id}` }));
      socket.close(4004, 'Session not found');
      return;
    }

    // For the WebSocket event stream, session ID knowledge is the capability token.
    // Cookies are not reliably forwarded through WebSocket proxies (Vite dev, nginx, etc.)
    // so we skip the userId ownership check here. The session ID is a cryptographically
    // unguessable UUID — possessing it grants read access to the event stream.

    // Support ?from=N query parameter for replay from index
    const query = request.query as { from?: string };
    const parsed = query.from ? parseInt(query.from, 10) : 0;
    const fromIndex = Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;

    attachEventStream(socket, session, fromIndex);
  });

  // ── POST /api/sessions/:id/gate — Submit gate decision ─────────────

  fastify.post('/api/sessions/:id/gate', async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = sessionManager.getSession(id);

    if (!session || !checkSessionOwnership(request, session)) {
      return reply.status(404).send({ error: `Session not found: ${id}` });
    }

    const gateResolver = session.gateResolver;
    if (!(gateResolver instanceof AsyncGateResolver)) {
      return reply.status(400).send({
        error: 'Session is not in API mode (gate resolver is not async)',
      });
    }

    // Validate gate decision body (gateId is required: consent is per request)
    const body = validateBody<GateDecisionBody>(GateDecisionSchema, request, reply);
    if (!body) return; // 400 already sent

    const pendingGate = gateResolver.getPendingGate();

    // Gate type verification against the pending gate (prevents stale approvals)
    if (pendingGate && body.gateType && body.gateType !== pendingGate.gateType) {
      return reply.status(409).send({
        error: `Gate type mismatch: expected '${pendingGate.gateType}', got '${body.gateType}'`,
        currentGateId: pendingGate.gateId,
      });
    }

    const result = gateResolver.submitDecision({ decision: body.decision, notes: body.notes }, body.gateId);

    if (!result.ok) {
      if (result.reason === 'no_pending') {
        return reply.status(409).send({ error: 'No pending gate decision' });
      }
      return reply.status(409).send({
        error: result.reason === 'gate_superseded'
          ? `This gate was already resolved (${result.recordedDecision?.decision}); a different decision cannot be applied to it. Read the current gate and decide on it explicitly.`
          : 'Gate mismatch: this decision names a gate that is not pending. Read the current gate and decide on it explicitly.',
        currentGateId: result.currentGateId ?? null,
        gateType: pendingGate?.gateType ?? null,
      });
    }

    return reply.send({
      success: true,
      idempotent: result.idempotent === true,
      decision: result.decision.decision,
      gateId: result.gateId,
      gateType: pendingGate?.gateType ?? body.gateType ?? null,
      sessionId: id,
    });
  });

  // ── POST /api/sessions/:id/dissents/:index/ruling — Human ruling ─────
  //
  // The Precedent's gold-label path: a human decides an escalated hivemind
  // split. The ruling (1) marks the dissent, (2) becomes a human-ruled
  // precedent future panels cite before litigating, and (3) grades every
  // panelist against ground truth from OUTSIDE the panel — the only
  // non-circular signal the panel ledger gets. Works on live sessions and
  // archived ones (the split usually outlives the session that raised it).
  fastify.post('/api/sessions/:id/dissents/:index/ruling', async (request, reply) => {
    const { id, index } = request.params as { id: string; index: string };
    const idx = Number.parseInt(index, 10);
    if (!Number.isInteger(idx) || idx < 0) {
      return reply.status(400).send({ error: 'Invalid dissent index' });
    }
    const label = typeof (request.body as { label?: unknown } | undefined)?.label === 'string'
      ? ((request.body as { label: string }).label).trim()
      : '';
    if (!label || label.length > 200) {
      return reply.status(400).send({ error: 'Body must include a non-empty label (max 200 chars)' });
    }

    const applyRuling = (
      d: DissentResult,
      matterType: string,
      sessionId: string,
      scope: { userId?: string; provider?: string },
    ): { error?: string; code?: number } => {
      if (!d.dissent) return { error: 'This panel was unanimous — nothing to rule on', code: 400 };
      if (d.humanRuling) return { error: `Already ruled: "${d.humanRuling.label}"`, code: 409 };
      if (!d.options.includes(label)) {
        return { error: `Label must be one of the panel's options: ${d.options.join(' | ')}`, code: 400 };
      }
      d.humanRuling = { label, ruledAt: new Date().toISOString() };
      try {
        getPrecedents().record({
          question: d.question,
          options: d.options,
          // The dissent record carries no clause body; the panelists' verbatim
          // quotes are the clause text that mattered.
          clauseExcerpt: d.verdicts.map(v => v.quote).filter(Boolean).join(' … '),
          matterType,
          ruling: label,
          source: 'human-ruled',
          evidence: d.resolution?.evidence ?? [],
          panel: d.verdicts.map(v => v.member),
          sessionId,
          userId: scope.userId,
          provider: scope.provider,
          decidedAt: d.humanRuling.ruledAt,
        });
        // Gold label from outside the panel — grade every seat (minAnswered=1).
        recordPanelistOutcomes(getLedger(), matterType, d.verdicts, label, 1);
      } catch { /* ruling stands even if precedent/ledger write fails */ }
      return {};
    };

    // Patch the archived summary_json with the ruling (best-effort). This is
    // load-bearing for the LIVE path too: a completed session was archived at
    // session_end — BEFORE any ruling could exist — and is never re-archived
    // (eviction/destroy skip archived entries; archiveSession early-returns on
    // status 'completed'). Without this write the ruling would evaporate at
    // TTL eviction and the archive would happily accept a second,
    // contradictory ruling.
    const patchArchive = (d: DissentResult): void => {
      try {
        const row = getArchivedSessionById(id);
        if (!row) return;
        const summary = safeJsonParse<Record<string, unknown>>(row.summary_json, {});
        const archDissents = Array.isArray(summary.dissents) ? (summary.dissents as DissentResult[]) : [];
        if (archDissents[idx] && archDissents[idx].question === d.question) {
          archDissents[idx].humanRuling = d.humanRuling;
          updateArchivedSummary(id, { ...summary, dissents: archDissents });
        }
      } catch { /* memory + precedent + ledger already hold the ruling */ }
    };

    const live = sessionManager.getSession(id);
    if (live) {
      if (!checkSessionOwnership(request, live)) {
        return reply.status(404).send({ error: `Session not found: ${id}` });
      }
      const d = live.dissents[idx];
      if (!d) return reply.status(404).send({ error: `No dissent at index ${idx}` });
      const res = applyRuling(d, live.workflowTemplateId ?? 'general', id, {
        userId: live.userId,
        provider: live.provider ?? config.provider,
      });
      if (res.error) return reply.status(res.code ?? 400).send({ error: res.error });
      patchArchive(d);
      return reply.send({ success: true, humanRuling: d.humanRuling });
    }

    const archived = getArchivedSessionById(id);
    if (!archived || !checkSessionOwnership(request, { userId: archived.user_id })) {
      return reply.status(404).send({ error: `Session not found: ${id}` });
    }
    const summary = safeJsonParse<Record<string, unknown>>(archived.summary_json, {});
    const dissents = Array.isArray(summary.dissents) ? (summary.dissents as DissentResult[]) : [];
    const d = dissents[idx];
    if (!d) return reply.status(404).send({ error: `No dissent at index ${idx}` });
    const res = applyRuling(d, archived.workflow_id ?? 'general', id, {
      userId: archived.user_id || undefined,
      // Pre-provider archives yield undefined → the precedent is stored
      // unservable rather than guessed into the wrong residency.
      provider: typeof summary.provider === 'string' ? summary.provider : undefined,
    });
    if (res.error) return reply.status(res.code ?? 400).send({ error: res.error });
    updateArchivedSummary(id, { ...summary, dissents });
    return reply.send({ success: true, humanRuling: d.humanRuling });
  });

  // ── POST /api/sessions/:id/inject — Voice/user context injection ────
  fastify.post('/api/sessions/:id/inject', async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = sessionManager.getSession(id);

    if (!session || !checkSessionOwnership(request, session)) {
      return reply.status(404).send({ error: `Session not found: ${id}` });
    }

    const body = request.body as { message?: string } | undefined;
    const message = (body?.message ?? '').trim();
    if (!message) {
      return reply.status(400).send({ error: 'message is required' });
    }
    if (message.length > 1000) {
      return reply.status(400).send({ error: 'message too long (max 1000 characters)' });
    }

    // Emit as a tool_used event so it surfaces in the activity feed
    session.events.emitEvent({
      type: 'tool_used',
      tool: `\u{1F4AC} You: ${message}`,
      agent: 'user',
      timestamp: new Date().toISOString(),
    });

    return reply.send({ success: true, sessionId: id });
  });

  // ── POST /api/sessions/:id/pause — Circuit breaker pause ────────────
  fastify.post('/api/sessions/:id/pause', async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = sessionManager.getSession(id);
    if (!session || !checkSessionOwnership(request, session)) {
      return reply.status(404).send({ error: `Session not found: ${id}` });
    }
    if (session.isHalted()) {
      return reply.status(409).send({ error: 'Session is already halted and cannot be paused' });
    }
    const body = request.body as { reason?: string } | undefined;
    session.pause(body?.reason ?? 'Paused by user');
    return reply.send({ success: true, sessionId: id, paused: true });
  });

  // ── POST /api/sessions/:id/resume — Circuit breaker resume ─────────
  fastify.post('/api/sessions/:id/resume', async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = sessionManager.getSession(id);
    if (!session || !checkSessionOwnership(request, session)) {
      return reply.status(404).send({ error: `Session not found: ${id}` });
    }
    if (!session.isPaused()) {
      return reply.status(409).send({ error: 'Session is not paused' });
    }
    session.resume();
    return reply.send({ success: true, sessionId: id, paused: false });
  });

  // ── DELETE /api/sessions/:id — Cancel session ──────────────────────

  fastify.delete('/api/sessions/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = sessionManager.getSession(id);

    if (!session || !checkSessionOwnership(request, session)) {
      return reply.status(404).send({ error: `Session not found: ${id}` });
    }

    // Accept optional reason from request body
    const body = request.body as { reason?: string } | undefined;
    const reason = body?.reason ?? 'Cancelled by user';

    // destroySession handles archival + halt + cleanup
    // (no need to manually emit session_end — destroySession archives explicitly)
    sessionManager.destroySession(id, reason);

    // Audit: session cancellation
    const reqUserId = (request as unknown as { userId?: string }).userId;
    logAuditEvent({ userId: reqUserId || undefined, action: 'session_cancel', resource: `session:${id}`, ip: request.ip, userAgent: request.headers['user-agent'], detail: { reason } });

    return reply.send({
      success: true,
      sessionId: id,
      message: `Session halted: ${reason}`,
      halted: true,
    });
  });
}
