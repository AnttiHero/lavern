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
import { DERIVATIVE_TYPES, DERIVATIVE_TYPE_LIST } from '../derivatives/derivative-types.js';
import type { Moment, Audience, Jurisdiction } from '../../types/index.js';
import type { ClientIdentity } from '../../types/client.js';
import type { ParsedDocument } from '../../documents/types.js';
import { getMatter } from './matters.js';

export function registerSessionRoutes(
  fastify: FastifyInstance,
  sessionManager: SessionManager
): void {

  // ── POST /api/sessions — Create a new analysis session ──────────────
  //
  // Accepts two body formats:
  //   Legacy: { documentPath, context, options }
  //   v5:     { request: LegalRequest, workflow?: string, options }

  fastify.post('/api/sessions', async (request, reply) => {
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

    const gateResolver = yoloMode
      ? new AutoApproveGateResolver()
      : isAgent && client?.callbackUrl
        ? new WebhookGateResolver(client.callbackUrl)
        : isAgent
          ? new AutoApproveGateResolver()
          : new AsyncGateResolver();
    const session = sessionManager.createSession({
      gateResolver,
      budgetUsd: body.options?.budget ?? 5.0,
    });

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

    if (body.request) {
      // v5 dispatch mode
      const legalRequest = body.request;

      dispatch(legalRequest, {
        session,
        gateResolver,
        forceWorkflow: body.workflow,
        matterId,
        maxBudgetUsd: body.options?.budget ?? 5.0,
        model: body.options?.model,
        maxTurns: body.options?.maxTurns,
        intensity: body.options?.intensity,
        effort: body.options?.effort,
        yoloMode: body.options?.yoloMode,
      }).catch((err) => {
        console.error(`[API] Session ${session.id} failed:`, err);
        session.events.emitEvent({
          type: 'error',
          message: `Session failed: ${err instanceof Error ? err.message : String(err)}`,
          source: 'orchestrator',
          timestamp: new Date().toISOString(),
        });
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
        maxBudgetUsd: body.options?.budget ?? 5.0,
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

  fastify.get('/api/sessions', async (_request, reply) => {
    const sessions = sessionManager.getAllSessions();
    return reply.send({
      sessions: sessions.map((s) => ({
        id: s.id,
        currentStep: s.genericWorkflow?.currentStep ?? s.workflow.currentStep,
        completedSteps: (s.genericWorkflow?.completedSteps ?? s.workflow.completedSteps).length,
        eventCount: s.events.getEventCount(),
        cost: s.accumulatedCost,
        budget: s.budgetUsd,
      })),
      total: sessions.length,
    });
  });

  // ── GET /api/sessions/:id — Get session status ─────────────────────

  fastify.get('/api/sessions/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = sessionManager.getSession(id);

    if (!session) {
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

  fastify.get('/api/sessions/:id/download', async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = sessionManager.getSession(id);

    if (!session) {
      return reply.status(404).send({ error: `Session not found: ${id}` });
    }

    const query = request.query as { format?: string };
    const format = query.format ?? 'md';

    if (format === 'md') {
      const content = session.finalOutput || '# No output yet\n\nThe session has not produced a deliverable yet.';
      const filename = `${id}-workproduct.md`;
      return reply
        .header('Content-Type', 'text/markdown; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .send(content);
    }

    if (format === 'json') {
      const data = {
        sessionId: session.id,
        exportedAt: new Date().toISOString(),
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
      const lines: string[] = [];
      const title = session.matterRecord?.title ?? 'Analysis Summary';
      lines.push(`# ${title}`, '');
      lines.push(`**Date:** ${new Date().toLocaleDateString()}`, '');

      // Executive summary from first paragraph of finalOutput
      if (session.finalOutput) {
        const firstParagraph = session.finalOutput.split('\n\n').find(p => p.trim() && !p.startsWith('#'));
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

      lines.push('---', '', '*This summary was generated from AI-assisted analysis. For matters involving regulatory filings, litigation, or binding contractual obligations, independent counsel verification is recommended.*', '');

      const filename = `${id}-summary.md`;
      return reply
        .header('Content-Type', 'text/markdown; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .send(lines.join('\n'));
    }

    return reply.status(400).send({ error: `Unknown format: ${format}. Use md, json, or summary.` });
  });

  // ── POST /api/sessions/:id/derivatives — Generate derivative document ──

  fastify.post('/api/sessions/:id/derivatives', async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = sessionManager.getSession(id);

    if (!session) {
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

    // Check that session has a work product to derive from
    if (!session.finalOutput) {
      return reply.status(409).send({
        error: 'Session has not produced a work product yet. Wait for the analysis to complete.',
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
            throw new Error(`Generation failed: ${JSON.stringify(errors)}`);
          }
        }
      }

      if (!generatedContent) {
        throw new Error('No content generated');
      }

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

    if (!session) {
      return reply.status(404).send({ error: `Session not found: ${id}` });
    }

    return reply.send({
      types: DERIVATIVE_TYPE_LIST,
      sessionHasOutput: !!session.finalOutput,
    });
  });

  // ── GET /api/sessions/:id/events — WebSocket event stream ──────────

  fastify.get('/api/sessions/:id/events', { websocket: true }, (socket, request) => {
    const { id } = request.params as { id: string };
    const session = sessionManager.getSession(id);

    if (!session) {
      socket.send(JSON.stringify({ error: `Session not found: ${id}` }));
      socket.close(4004, 'Session not found');
      return;
    }

    // Support ?from=N query parameter for replay from index
    const query = request.query as { from?: string };
    const fromIndex = query.from ? parseInt(query.from, 10) : 0;

    attachEventStream(socket, session, fromIndex);
  });

  // ── POST /api/sessions/:id/gate — Submit gate decision ─────────────

  fastify.post('/api/sessions/:id/gate', async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = sessionManager.getSession(id);

    if (!session) {
      return reply.status(404).send({ error: `Session not found: ${id}` });
    }

    const gateResolver = session.gateResolver;
    if (!(gateResolver instanceof AsyncGateResolver)) {
      return reply.status(400).send({
        error: 'Session is not in API mode (gate resolver is not async)',
      });
    }

    if (!gateResolver.hasPendingGate()) {
      return reply.status(409).send({
        error: 'No pending gate decision',
      });
    }

    // Validate gate decision body
    const body = validateBody<GateDecisionBody>(GateDecisionSchema, request, reply);
    if (!body) return; // 400 already sent

    const submitted = gateResolver.submitDecision({
      decision: body.decision,
      notes: body.notes,
    });

    if (!submitted) {
      return reply.status(409).send({ error: 'Gate decision could not be submitted' });
    }

    return reply.send({
      success: true,
      decision: body.decision,
      sessionId: id,
    });
  });

  // ── DELETE /api/sessions/:id — Cancel session ──────────────────────

  fastify.delete('/api/sessions/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = sessionManager.getSession(id);

    if (!session) {
      return reply.status(404).send({ error: `Session not found: ${id}` });
    }

    // Accept optional reason from request body
    const body = request.body as { reason?: string } | undefined;
    const reason = body?.reason ?? 'Cancelled by user';

    // Halt running agents FIRST — the haltCheckHook will return
    // { continue: false } on the next tool call, stopping the SDK query.
    session.halt(reason);

    session.events.emitEvent({
      type: 'session_end',
      sessionId: session.id,
      totalCost: session.accumulatedCost,
      duration: 0,
      timestamp: new Date().toISOString(),
    });

    sessionManager.destroySession(id, reason);

    return reply.send({
      success: true,
      sessionId: id,
      message: `Session halted: ${reason}`,
      halted: true,
    });
  });
}
