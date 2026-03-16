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
import { query as sdkQuery } from '@anthropic-ai/claude-agent-sdk';
import { DERIVATIVE_TYPES, DERIVATIVE_TYPE_LIST, buildFullContext } from '../derivatives/derivative-types.js';
import { agentProfiles } from '../../agents/profiles.js';
import { getOrchestratorForWorkflow } from '../../workflows/orchestrator-mapping.js';
import { getSessionArchive, getAllSessionArchive, getArchivedSession, getArchivedSessionById, getRecentArchivedSessions, getUserById, logAuditEvent } from '../../db/database.js';
import type { Moment, Audience, Jurisdiction } from '../../types/index.js';
import type { ClientIdentity } from '../../types/client.js';
import { config } from '../../config.js';
import { canStartSession, getPlanLimits } from './billing.js';
import type { ParsedDocument } from '../../documents/types.js';
import { getMatter } from './matters.js';
import { convertToDocx, convertToHtml, convertToPdf, extractSoulBranding, type DocumentStyle } from '../../assembly/format-converter.js';
import { validateDeliverable, isProcessDump } from '../../assembly/validate-deliverable.js';
import { assembleDocument } from '../../assembly/document-assembler.js';

/** Safely parse JSON, returning fallback on failure. */
function safeJsonParse<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try { return JSON.parse(json) as T; } catch { return fallback; }
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

    // v21: Per-user monthly budget cap enforcement
    const userId = (request as typeof request & { userId?: string }).userId;
    let sessionBudget = body.options?.budget ?? config.defaultBudgetUsd;

    if (userId) {
      const budgetCheck = canStartSession(userId);
      if (!budgetCheck.allowed) {
        return reply.status(402).send({
          error: 'No billable hours remaining',
          detail: budgetCheck.reason,
          remainingHours: 0,
        });
      }
      // Cap session budget to remaining monthly budget and plan limit
      const planLimits = getPlanLimits((await import('../../db/database.js')).getUserPlan(userId)?.plan ?? 'free');
      sessionBudget = Math.min(sessionBudget, budgetCheck.remainingBudget, planLimits.maxSessionBudget);
    }

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
        console.warn(`[SESSION] Failed to parse soul from user profile ${userId}:`, err);
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
    }

    // v13: Accept team roles from frontend staffing
    if (body.team && Array.isArray(body.team) && body.team.length > 0) {
      session.selectedTeam = body.team as string[];
    }

    // v18: Per-session provider selection
    if (body.options?.provider) {
      session.provider = body.options.provider;
    }

    if (body.request) {
      // v5 dispatch mode
      const legalRequest = body.request;

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
        verification: body.options?.verification,
        provider: body.options?.provider,
      }).catch((err) => {
        try {
          console.error(`[API] Session ${session.id} failed:`, err);
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
          console.error(`[API] Session ${session.id} — error handler failed:`, innerErr);
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
        console.error(`[API] Session ${session.id} failed:`, err);
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
    // Filter to only this user's sessions (or show all if no auth — backward compat for CLI)
    const activeSessions = userId ? allSessions.filter(s => s.userId === userId) : allSessions;
    const active = activeSessions.map((s) => ({
      id: s.id,
      currentStep: s.genericWorkflow?.currentStep ?? s.workflow.currentStep,
      completedSteps: (s.genericWorkflow?.completedSteps ?? s.workflow.completedSteps).length,
      eventCount: s.events.getEventCount(),
      cost: s.accumulatedCost,
      budget: s.budgetUsd,
    }));

    // Include recent archived sessions so work survives server restarts
    const archived = getRecentArchivedSessions(5);
    const activeIds = new Set(active.map(s => s.id));
    const archivedEntries = archived
      .filter(a => !activeIds.has(a.id))
      .map(a => ({
        id: a.id,
        currentStep: 'delivered' as const,
        completedSteps: 0,
        eventCount: 0,
        cost: a.cost_usd,
        budget: a.budget_usd,
        _restored: true,
      }));

    return reply.send({
      sessions: [...active, ...archivedEntries],
      total: active.length + archivedEntries.length,
    });
  });

  // ── GET /api/sessions/archive — List archived sessions for user ─────
  // IMPORTANT: Registered BEFORE /api/sessions/:id to prevent route shadowing.
  // Fastify's parametric `:id` would catch "archive" as the id value otherwise.

  fastify.get('/api/sessions/archive', async (request, reply) => {
    const userId = (request as typeof request & { userId?: string }).userId;

    // If logged in, show user's sessions. Otherwise show all (for demo/no-auth mode).
    const archived = userId ? getSessionArchive(userId) : getAllSessionArchive();
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

    // If logged in, scope to user. Otherwise allow any (for demo/no-auth mode).
    const session = userId ? getArchivedSession(id, userId) : getArchivedSessionById(id);

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
          workflow: { currentStep: 'delivered', completedSteps: [], gateDecisions: [] },
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

    if (!checkSessionOwnership(request, session)) {
      return reply.status(404).send({ error: `Session not found: ${id}` });
    }

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
      },
      eventCount: session.events.getEventCount(),
      pendingGate: pendingGate ? {
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
      })),

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
      matterTitle: session.matterRecord?.title ?? null,
      workflowTemplateId: session.workflowTemplateId ?? null,
      provider: session.provider ?? config.provider,
      selectedTeam: session.selectedTeam,
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
    const session = sessionManager.getSession(id);

    if (!session || !checkSessionOwnership(request, session)) {
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

    // For document formats (md, docx, pdf), validate before serving
    if (format === 'md' || format === 'docx' || format === 'pdf') {
      const validation = validateDeliverable(deliverable);
      if (!validation.valid) {
        console.error(`[DOWNLOAD] Blocked invalid deliverable for session ${id}: ${validation.reason}`);
        return reply.status(503).send({
          error: 'The document is not ready. Assembly may still be in progress or failed. Try downloading structured data (JSON) instead, or retry later.',
          reason: validation.reason,
          hasFindings: session.debate.findings.length > 0,
        });
      }
    }

    if (format === 'md') {
      const filename = `${id}-workproduct.md`;
      return reply
        .header('Content-Type', 'text/markdown; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .send(deliverable);
    }

    if (format === 'docx') {
      try {
        const docxBuffer = await convertToDocx(deliverable, title, style, soulBranding);
        const filename = `${id}-workproduct.docx`;
        return reply
          .header('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
          .header('Content-Disposition', `attachment; filename="${filename}"`)
          .send(docxBuffer);
      } catch (err) {
        console.error('DOCX conversion error:', err);
        return reply.status(500).send({ error: 'Failed to generate DOCX. Try downloading as Markdown instead.' });
      }
    }

    if (format === 'pdf') {
      try {
        const { buffer, isRealPdf } = await convertToPdf(deliverable, title, style, soulBranding);
        if (isRealPdf) {
          const filename = `${id}-workproduct.pdf`;
          return reply
            .header('Content-Type', 'application/pdf')
            .header('Content-Disposition', `attachment; filename="${filename}"`)
            .send(buffer);
        } else {
          // Puppeteer unavailable — serve styled HTML as fallback
          const filename = `${id}-workproduct.html`;
          return reply
            .header('Content-Type', 'text/html; charset=utf-8')
            .header('Content-Disposition', `attachment; filename="${filename}"`)
            .send(buffer);
        }
      } catch (err) {
        console.error('PDF conversion error:', err);
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
      const filename = `${id}-data.json`;
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
        console.error(`[DOWNLOAD] Blocked empty summary for session ${id}: no document, no findings, no resolutions`);
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
        console.error(`[DOWNLOAD] Blocked thin summary for session ${id}: only ${summaryContent.length} chars`);
        return reply.status(503).send({
          error: 'Summary content is insufficient. The analysis may not have produced enough findings. Try downloading structured data (JSON) instead.',
          reason: 'thin_summary',
        });
      }

      lines.push('---', '', '*This summary was generated from AI-assisted analysis. For matters involving regulatory filings, litigation, or binding contractual obligations, independent counsel verification is recommended.*', '');

      const filename = `${id}-summary.md`;
      return reply
        .header('Content-Type', 'text/markdown; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .send(lines.join('\n'));
    }

    // v15: Raw format — the original process log (for debugging/audit)
    if (format === 'raw') {
      const content = session.finalOutput || '# No process output\n\nNo orchestrator output was captured.';
      const filename = `${id}-processlog.md`;
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
    const session = sessionManager.getSession(id);

    if (!session || !checkSessionOwnership(request, session)) {
      return reply.status(404).send({ error: `Session not found: ${id}` });
    }

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
      console.error(`[API] Reassembly failed for session ${id}:`, err);
      return reply.status(500).send({
        error: 'Assembly failed',
        details: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // ── POST /api/sessions/:id/derivatives — Generate derivative document ──

  fastify.post('/api/sessions/:id/derivatives', async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = sessionManager.getSession(id);

    if (!session || !checkSessionOwnership(request, session)) {
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
      // Assemble context from session state
      const context = derivativeType.buildContext(session);

      // Call Claude API via Agent SDK (single-turn, no tools)
      const result = sdkQuery({
        prompt: context,
        options: {
          systemPrompt: derivativeType.systemPrompt,
          model: 'claude-sonnet-4-5-20250929',
          maxTurns: 1,
        },
      });

      // Consume the async generator to collect generated text
      let generatedContent = '';

      for await (const message of result) {
        if (!('type' in message)) continue;

        if (message.type === 'assistant' && message.message?.content) {
          for (const block of message.message.content) {
            if ('text' in block) {
              generatedContent += block.text;
            }
          }
        }

        if (message.type === 'result') {
          if ('subtype' in message && message.subtype !== 'success') {
            const errors = (message as Record<string, unknown>).errors;
            throw new Error(`Generation failed (${message.subtype}): ${JSON.stringify(errors)}`);
          }
        }
      }

      if (!generatedContent) {
        throw new Error('No content generated');
      }

      // v18: Reject if the model produced process-dump text instead of a document
      if (isProcessDump(generatedContent)) {
        console.error(`[API] Derivative generation produced process dump (${body.type})`);
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
        reply.header('Content-Disposition', `attachment; filename="${id}-${safeTitle}.docx"`);
        return reply.send(Buffer.from(docxBuffer));
      }

      if (format === 'html') {
        const html = convertToHtml(generatedContent, derivativeType.title, style, derivBranding);
        const safeTitle = derivativeType.title.replace(/[^a-zA-Z0-9-_]/g, '-');
        reply.header('Content-Type', 'text/html; charset=utf-8');
        reply.header('Content-Disposition', `attachment; filename="${id}-${safeTitle}.html"`);
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
      console.error(`[API] Derivative generation failed (${body.type}):`, err);
      return reply.status(500).send({
        error: `Failed to generate ${derivativeType.title}`,
        details: err instanceof Error ? err.message : String(err),
      });
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
    const session = sessionManager.getSession(id);

    if (!session || !checkSessionOwnership(request, session)) {
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

${buildFullContext(session)}`;

    // Build prompt from conversation history + new message
    const historyBlock = history
      .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n\n');

    const prompt = historyBlock
      ? `${historyBlock}\n\nUser: ${body.message.trim()}`
      : body.message.trim();

    // Track client disconnect to stop streaming
    let clientDisconnected = false;
    request.raw.on('close', () => { clientDisconnected = true; });

    try {
      // Hijack the reply so Fastify doesn't try to send its own response
      reply.hijack();
      // Set up SSE response
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });

      const result = sdkQuery({
        prompt,
        options: {
          systemPrompt,
          model: 'claude-sonnet-4-5-20250929',
          maxTurns: 1,
        },
      });

      for await (const message of result) {
        if (clientDisconnected) break;
        if (!('type' in message)) continue;

        if (message.type === 'assistant' && message.message?.content) {
          for (const block of message.message.content) {
            if ('text' in block) {
              reply.raw.write(`data: ${JSON.stringify({ type: 'text', content: block.text })}\n\n`);
            }
          }
        }

        if (message.type === 'result') {
          if ('subtype' in message && message.subtype !== 'success') {
            const errors = (message as Record<string, unknown>).errors;
            reply.raw.write(`data: ${JSON.stringify({ type: 'error', content: `Generation failed (${message.subtype}): ${JSON.stringify(errors)}` })}\n\n`);
          }
        }
      }

      if (!clientDisconnected) {
        reply.raw.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      }
      reply.raw.end();
    } catch (err) {
      console.error(`[API] Conversation failed for session ${id}:`, err);
      // If headers haven't been sent yet, send a normal error
      if (!reply.raw.headersSent) {
        return reply.status(500).send({
          error: 'Conversation failed',
          details: err instanceof Error ? err.message : String(err),
        });
      }
      // If streaming already started, send error as SSE
      reply.raw.write(`data: ${JSON.stringify({ type: 'error', content: err instanceof Error ? err.message : String(err) })}\n\n`);
      reply.raw.end();
    }
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

    // Verify the requesting user owns this session (for authenticated sessions).
    // For anonymous sessions (no userId on session), access is granted to anyone
    // who knows the session ID — the ID itself serves as a capability token.
    if (!checkSessionOwnership(request, session)) {
      socket.send(JSON.stringify({ error: `Session not found: ${id}` }));
      socket.close(4003, 'Forbidden');
      return;
    }

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

    const pendingGate = gateResolver.getPendingGate();
    if (!pendingGate) {
      return reply.status(409).send({
        error: 'No pending gate decision',
      });
    }

    // Validate gate decision body
    const body = validateBody<GateDecisionBody>(GateDecisionSchema, request, reply);
    if (!body) return; // 400 already sent

    // Optional gate type verification — if the client specifies which gate they're
    // deciding, ensure it matches the pending gate (prevents stale approvals)
    if (body.gateType && body.gateType !== pendingGate.gateType) {
      return reply.status(409).send({
        error: `Gate type mismatch: expected '${pendingGate.gateType}', got '${body.gateType}'`,
      });
    }

    const submitted = gateResolver.submitDecision({
      decision: body.decision,
      notes: body.notes,
    });

    if (!submitted) {
      return reply.status(409).send({ error: 'Gate decision could not be submitted (gate may have timed out)' });
    }

    return reply.send({
      success: true,
      decision: body.decision,
      gateType: pendingGate.gateType,
      sessionId: id,
    });
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
