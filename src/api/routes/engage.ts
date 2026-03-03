/**
 * Engage Routes — Agent-native API for structured legal engagements.
 *
 * POST /api/engage — Single endpoint that wraps the entire engagement
 * lifecycle into one request-response. Agents send structured JSON,
 * receive structured results. Same orchestration engine as the human
 * flow, two interfaces.
 *
 * Two modes:
 *   sync:    Blocks until session completes, returns full deliverables.
 *   webhook: Returns immediately, POSTs results to callbackUrl on completion.
 *
 * v10: Act 2 of the Legal Singularity — AI agents as consumers.
 * v16: Enhanced agent fast-path — format param, base64/URL document input.
 */

import { z } from 'zod';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { SessionManager } from '../../session/session-manager.js';
import type { SessionState } from '../../session/session-state.js';
import { dispatch } from '../../dispatch.js';
import { waitForSessionCompletion } from '../../session/session-waiter.js';
import {
  AutoApproveGateResolver,
  WebhookGateResolver,
} from '../../gates/gate-resolver.js';
import type { LegalRequest } from '../../types/index.js';
import type { IntensityLevel } from '../../types/engagement.js';
import { defaultBudgetForIntensity } from '../../types/engagement.js';
import type { ClientIdentity } from '../../types/client.js';
import { validateBody } from '../middleware/validation.js';
import { config } from '../../config.js';

// ── Request Schema ──────────────────────────────────────────────────────

const EngageDocumentSchema = z.object({
  name: z.string().min(1).max(500),
  content: z.string().min(1).max(100_000).optional(),
  contentBase64: z.string().max(200_000).optional(),
  contentUrl: z.string().url().max(2000).optional(),
}).refine(
  (doc) => doc.content || doc.contentBase64 || doc.contentUrl,
  { message: 'At least one of content, contentBase64, or contentUrl is required.' },
);

const EngageContextSchema = z.object({
  jurisdiction: z.enum(['US', 'EU', 'UK', 'CA', 'AU']).optional(),
  audience: z.enum(['consumer', 'smb', 'enterprise', 'employee']).optional(),
  documentType: z.string().max(200).optional(),
  focus: z.string().max(1000).optional(),
}).strict().optional();

const EngageConstraintsSchema = z.object({
  maxBudgetUsd: z.number().min(0.01).max(100).optional(),
  intensity: z.enum(['quick', 'standard', 'thorough', 'maximal']).optional(),
  workflow: z.string().min(1).max(100).optional(),
}).strict().optional();

export const EngageRequestSchema = z.object({
  task: z.string().min(1).max(50_000),
  type: z.enum([
    'document_redesign', 'contract_review', 'legal_question',
    'legal_research', 'risk_assessment', 'general',
  ]).optional(),
  documents: z.array(EngageDocumentSchema).max(20).optional(),
  context: EngageContextSchema,
  constraints: EngageConstraintsSchema,
  format: z.enum(['full', 'summary', 'citations-only']).optional().default('full'),
  mode: z.enum(['sync', 'webhook']).optional().default('sync'),
  callbackUrl: z.string().url().max(2000).optional(),
}).strict().refine(
  (data) => data.mode !== 'webhook' || data.callbackUrl,
  { message: 'callbackUrl is required when mode is "webhook"' },
);

export type EngageRequestBody = z.infer<typeof EngageRequestSchema>;

// ── Response Types ──────────────────────────────────────────────────────

interface EngageDeliverables {
  output: string;
  findings: Array<{
    agent: string;
    text: string;
    category: string;
  }>;
  resolutions: Array<{
    finding: string;
    resolution: string;
    decidedBy: string;
  }>;
}

interface EngageQuality {
  evaluatorScore: number | null;
  verificationPassRate: number;
  confidence: number;
}

interface EngageCost {
  totalUsd: number;
  budgetUsd: number;
}

interface EngageMetadata {
  workflowUsed: string;
  teamRoles: string[];
  durationMs: number;
  eventCount: number;
}

export interface EngageResponse {
  engagementId: string;
  status: 'completed' | 'failed' | 'halted';
  deliverables: EngageDeliverables;
  quality: EngageQuality;
  cost: EngageCost;
  metadata: EngageMetadata;
}

interface EngageAcceptedResponse {
  engagementId: string;
  status: 'accepted';
  statusUrl: string;
  eventsUrl: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * Resolve a document's content from content, contentBase64, or contentUrl.
 * Priority: content > contentBase64 > contentUrl.
 */
async function resolveDocumentContent(doc: { name: string; content?: string; contentBase64?: string; contentUrl?: string }): Promise<string> {
  if (doc.content) return doc.content;

  if (doc.contentBase64) {
    try {
      return Buffer.from(doc.contentBase64, 'base64').toString('utf-8');
    } catch {
      throw new Error(`Failed to decode base64 content for document "${doc.name}".`);
    }
  }

  if (doc.contentUrl) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000); // 10s timeout
    try {
      const res = await fetch(doc.contentUrl, {
        signal: controller.signal,
        headers: { 'Accept': 'text/plain, text/html, application/json, */*' },
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      // Enforce 100KB size limit
      const text = await res.text();
      if (text.length > 100_000) {
        throw new Error(`Content exceeds 100KB limit (got ${Math.round(text.length / 1000)}KB).`);
      }
      return text;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to fetch content from URL for document "${doc.name}": ${msg}`);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(`No content source for document "${doc.name}".`);
}

/**
 * Build a LegalRequest from the engage body.
 * Embeds document content directly in the requestText.
 * Now async to support URL fetching.
 */
async function buildLegalRequest(body: EngageRequestBody): Promise<LegalRequest> {
  const parts: string[] = [body.task];

  // Embed document content inline
  if (body.documents && body.documents.length > 0) {
    parts.push('\n\n--- DOCUMENTS ---');
    for (const doc of body.documents) {
      const content = await resolveDocumentContent(doc);
      parts.push(`\n### ${doc.name}\n${content}`);
    }
  }

  return {
    type: body.type ?? 'general',
    requestText: parts.join('\n'),
    context: body.context ? {
      jurisdiction: body.context.jurisdiction,
      audience: body.context.audience,
      documentType: body.context.documentType,
      focus: body.context.focus,
    } : undefined,
  };
}

/**
 * Extract structured deliverables from a completed session.
 */
function extractDeliverables(session: SessionState): EngageDeliverables {
  return {
    output: session.finalOutput || '(No output captured)',
    findings: session.debate.findings.map(f => ({
      agent: f.agentRole,
      text: f.content,
      category: f.findingType,
    })),
    resolutions: session.debate.resolutions.map(r => ({
      finding: r.findingIds.join(', '),
      resolution: r.resolution,
      decidedBy: r.resolvedBy,
    })),
  };
}

/**
 * Extract quality signals from a completed session.
 */
function extractQuality(session: SessionState): EngageQuality {
  const evaluatorResults = session.genericWorkflow?.evaluatorResults ?? [];
  const bestScore = evaluatorResults.length > 0
    ? Math.max(...evaluatorResults.map(r => r.score))
    : null;

  const totalVerifications = session.verificationResults.length;
  const passedVerifications = session.verificationResults.filter(v => v.passed).length;
  const passRate = totalVerifications > 0
    ? passedVerifications / totalVerifications
    : 0;

  // Compute a simple confidence metric from available signals
  const signals: number[] = [];
  if (bestScore !== null) signals.push(bestScore / 100);
  if (totalVerifications > 0) signals.push(passRate);
  const confidence = signals.length > 0
    ? signals.reduce((a, b) => a + b, 0) / signals.length
    : 0.5; // Default moderate confidence if no signals

  return {
    evaluatorScore: bestScore,
    verificationPassRate: Math.round(passRate * 100) / 100,
    confidence: Math.round(confidence * 100) / 100,
  };
}

/**
 * Build the full EngageResponse from a completed session.
 */
function buildEngageResponse(
  session: SessionState,
  status: 'completed' | 'failed' | 'halted',
  startTime: number,
): EngageResponse {
  return {
    engagementId: session.id,
    status,
    deliverables: extractDeliverables(session),
    quality: extractQuality(session),
    cost: {
      totalUsd: Math.round(session.accumulatedCost * 10000) / 10000,
      budgetUsd: session.budgetUsd,
    },
    metadata: {
      workflowUsed: session.workflowTemplateId ?? 'unknown',
      teamRoles: session.selectedTeam.length > 0
        ? session.selectedTeam
        : session.subagentActivities.map(a => a.agentRole),
      durationMs: Date.now() - startTime,
      eventCount: session.events.getEventCount(),
    },
  };
}

/**
 * Apply format filter to an EngageResponse.
 *
 * - 'full': return everything (default)
 * - 'summary': engagementId + status + truncated output + findings count + confidence + cost
 * - 'citations-only': engagementId + status + citations array + confidence
 */
function applyFormat(response: EngageResponse, format: string): unknown {
  if (format === 'summary') {
    return {
      engagementId: response.engagementId,
      status: response.status,
      output: response.deliverables.output.slice(0, 500) + (response.deliverables.output.length > 500 ? '...' : ''),
      findingsCount: response.deliverables.findings.length,
      resolutionsCount: response.deliverables.resolutions.length,
      confidence: response.quality.confidence,
      cost: response.cost,
      metadata: response.metadata,
    };
  }

  if (format === 'citations-only') {
    // Extract citation-like content from findings
    const citations = response.deliverables.findings.map(f => ({
      agent: f.agent,
      text: f.text,
      category: f.category,
    }));
    return {
      engagementId: response.engagementId,
      status: response.status,
      citations,
      confidence: response.quality.confidence,
    };
  }

  // 'full' — return as-is
  return response;
}

// ── Route Registration ──────────────────────────────────────────────────

export function registerEngageRoutes(
  fastify: FastifyInstance,
  sessionManager: SessionManager,
): void {

  // ── POST /api/engage — Agent-native engagement endpoint ───────────
  fastify.post('/api/engage', {
    config: {
      rateLimit: {
        max: config.rateLimitSessionMax,
        timeWindow: config.rateLimitWindowMs,
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = Date.now();

    // Validate request body
    const body = validateBody<EngageRequestBody>(EngageRequestSchema, request, reply);
    if (!body) return;

    // Extract client identity (attached by auth middleware)
    const client = (request as FastifyRequest & { client?: ClientIdentity }).client;

    // Resolve intensity + budget
    const intensity: IntensityLevel = body.constraints?.intensity ?? 'standard';
    const budgetUsd = body.constraints?.maxBudgetUsd ?? defaultBudgetForIntensity(intensity);

    // Select gate resolver based on mode and client config
    const gateResolver = body.mode === 'webhook' && body.callbackUrl
      ? new WebhookGateResolver(body.callbackUrl)
      : new AutoApproveGateResolver();

    // Create session
    const session = sessionManager.createSession({
      gateResolver,
      budgetUsd,
    });

    // Attach client identity if present
    if (client) {
      session.clientIdentity = client;
    }

    // Build legal request from engage body (async — resolves base64/URL docs)
    let legalRequest: LegalRequest;
    try {
      legalRequest = await buildLegalRequest(body);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(422).send({ error: message });
    }

    // ── Webhook mode: fire-and-forget, return immediately ──────────
    if (body.mode === 'webhook' && body.callbackUrl) {
      const callbackUrl = body.callbackUrl;

      // Launch dispatch in background
      // yoloMode: engage endpoint is a programmatic API — no human is present
      // to approve gates. The gate resolver (webhook or auto-approve) handles
      // decisions independently. See gateResolver selection above (line 349).
      dispatch(legalRequest, {
        session,
        gateResolver,
        forceWorkflow: body.constraints?.workflow,
        intensity,
        maxBudgetUsd: budgetUsd,
        yoloMode: true,
      }).then(() => {
        // Session completed — POST results to callback
        const response = buildEngageResponse(session, 'completed', startTime);
        return fetch(callbackUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(response),
        });
      }).catch((err) => {
        console.error(`[ENGAGE] Session ${session.id} failed:`, err);
        // Attempt to notify the callback of failure
        const errorResponse = buildEngageResponse(session, 'failed', startTime);
        fetch(callbackUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(errorResponse),
        }).catch(() => { /* Best effort */ });
      });

      const accepted: EngageAcceptedResponse = {
        engagementId: session.id,
        status: 'accepted',
        statusUrl: `/api/sessions/${session.id}`,
        eventsUrl: `/api/sessions/${session.id}/events`,
      };

      return reply.status(202).send(accepted);
    }

    // ── Sync mode: wait for completion, return results ──────────────
    try {
      // Launch dispatch (returns the session, but we wait separately)
      // yoloMode: sync engage is also programmatic — caller blocks on HTTP,
      // not on an interactive gate prompt. Same reasoning as webhook mode.
      const dispatchPromise = dispatch(legalRequest, {
        session,
        gateResolver,
        forceWorkflow: body.constraints?.workflow,
        intensity,
        maxBudgetUsd: budgetUsd,
        yoloMode: true,
      });

      // Wait for the session to emit session_end or fail
      // Use a generous timeout: 5 minutes default
      const timeoutMs = 5 * 60 * 1000;

      await Promise.race([
        waitForSessionCompletion(session, timeoutMs),
        dispatchPromise,
      ]);

      // Determine status
      const status = session.isHalted() ? 'halted' : 'completed';
      const response = buildEngageResponse(session, status, startTime);

      return reply.send(applyFormat(response, body.format));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      // If the session timed out or failed, still return what we have
      const status = session.isHalted() ? 'halted' : 'failed';
      const response = buildEngageResponse(session, status, startTime);

      // Include the error in the response
      const formatted = applyFormat(response, body.format) as Record<string, unknown>;
      return reply.status(status === 'halted' ? 200 : 500).send({
        ...formatted,
        error: message,
      });
    }
  });
}
