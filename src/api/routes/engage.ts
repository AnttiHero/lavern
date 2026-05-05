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
import { checkX402Payment } from '../middleware/payment.js';
import { config } from '../../config.js';
import { canStartSession } from './billing.js';
import { holdBillableHours } from '../../db/database.js';
import { createLogger } from '../../utils/logger.js';
import { captureError } from '../../utils/sentry.js';
import { createMassActionGuard } from '../middleware/mass-action-guard.js';

const logger = createLogger('ENGAGE');
const massActionGuard = createMassActionGuard();
setInterval(() => massActionGuard.cleanup(), 10 * 60_000);

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
  /** v18: LLM provider — per-engagement override. */
  provider: z.enum(['anthropic', 'mistral']).optional(),
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
// (URL safety helpers moved to src/utils/url-safety.ts so they can be
//  shared across all SSRF-sensitive routes — engage.ts, auth.ts /api/clients
//  registration, gate-resolver.ts webhook fetch.)
import { isUrlSafe } from '../../utils/url-safety.js';

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
    // SSRF prevention — validate URL before fetching
    if (!isUrlSafe(doc.contentUrl)) {
      throw new Error(`Unsafe URL for document "${doc.name}": only HTTPS URLs pointing to public hosts are allowed.`);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000); // 10s timeout
    try {
      const res = await fetch(doc.contentUrl, {
        signal: controller.signal,
        headers: { 'Accept': 'text/plain, text/html, application/json, */*' },
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      // Check Content-Length header first to avoid loading huge responses into memory
      const contentLength = res.headers.get('content-length');
      if (contentLength && parseInt(contentLength, 10) > 200_000) {
        throw new Error(`Content-Length ${contentLength} exceeds limit. Max 100KB.`);
      }

      // Enforce 100KB size limit on actual content
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
 * v18: NEVER serve finalOutput — it contains orchestrator process dumps.
 */
function extractDeliverables(session: SessionState): EngageDeliverables {
  return {
    output: session.assembledDocument || '(No output captured)',
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

// ── Webhook retry helper ────────────────────────────────────────────────

/**
 * POST to a webhook URL with exponential backoff retry.
 * Retries up to `maxRetries` times (default 3) on failure.
 * Delays: 1s, 2s, 4s (doubles each retry).
 */
async function postWebhookWithRetry(
  url: string,
  payload: unknown,
  { maxRetries = 3, baseDelayMs = 1000, timeoutMs = 30_000 } = {},
): Promise<void> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.ok || res.status < 500) return; // 2xx–4xx: don't retry client errors
      // 5xx: fall through to retry
    } catch {
      clearTimeout(timeout);
      // Network error or timeout: fall through to retry
    }
    if (attempt < maxRetries) {
      const delay = baseDelayMs * Math.pow(2, attempt);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  logger.error('Webhook POST failed after retries', { url, attempts: maxRetries + 1 });
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
    const isAuthenticated = !!client || !!(request as FastifyRequest & { userId?: string }).userId;

    // x402 payment check — alternative auth for unauthenticated callers.
    // When x402 is enabled and no Bearer/cookie auth is present, returns
    // 402 Payment Required with USDC payment instructions. When x402 is
    // disabled (default) or the caller is already authenticated, this is a no-op.
    if (!checkX402Payment(request, reply, isAuthenticated)) return;

    // Resolve intensity + budget
    const intensity: IntensityLevel = body.constraints?.intensity ?? 'standard';
    let budgetUsd = body.constraints?.maxBudgetUsd ?? defaultBudgetForIntensity(intensity);

    // v23: Budget enforcement — same check as sessions.ts POST /api/sessions
    const userId = (request as FastifyRequest & { userId?: string }).userId;
    if (userId) {
      const budgetCheck = canStartSession(userId);
      if (!budgetCheck.allowed) {
        return reply.status(402).send({
          error: 'No billable hours remaining',
          detail: budgetCheck.reason,
          remainingHours: 0,
        });
      }
      budgetUsd = Math.min(budgetUsd, budgetCheck.remainingBudget);
    }

    // Select gate resolver based on mode and client config
    const gateResolver = body.mode === 'webhook' && body.callbackUrl
      ? new WebhookGateResolver(body.callbackUrl)
      : new AutoApproveGateResolver();

    // Create session
    const session = sessionManager.createSession({
      gateResolver,
      budgetUsd,
    });

    // v25: Place hold on billable hours to prevent TOCTOU race
    if (userId) {
      const holdHours = budgetUsd / config.billableHours.rate;
      if (!holdBillableHours(userId, holdHours, session.id)) {
        sessionManager.destroySession(session.id, 'Insufficient billable hours');
        return reply.status(402).send({ error: 'Insufficient billable hours', remainingHours: 0 });
      }
      session.userId = userId;
    }

    // Attach client identity if present
    if (client) {
      session.clientIdentity = client;
    }

    // Mass-action detection (same guard as /api/sessions)
    if (userId) {
      const workflowId = body.constraints?.workflow ?? 'default';
      const requestText = body.task ?? '';
      const massCheck = massActionGuard.check(userId, workflowId, requestText);
      if (massCheck.flagged && !massCheck.allowed) {
        sessionManager.destroySession(session.id, 'Mass-action blocked');
        return reply.status(429).send({
          error: 'Mass-action pattern detected',
          detail: massCheck.reason,
        });
      }
    }

    // Build legal request from engage body (async — resolves base64/URL docs)
    let legalRequest: LegalRequest;
    try {
      legalRequest = await buildLegalRequest(body);
    } catch (err) {
      // Fix: release billing hold + destroy session on document fetch failure
      sessionManager.destroySession(session.id, 'Document fetch failed');
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(422).send({ error: message });
    }

    // ── Webhook mode: fire-and-forget, return immediately ──────────
    if (body.mode === 'webhook' && body.callbackUrl) {
      // SSRF prevention: validate callback URL the same way we validate document URLs
      if (!isUrlSafe(body.callbackUrl)) {
        return reply.status(422).send({ error: 'callbackUrl must be a public HTTPS URL (private/internal addresses are not allowed).' });
      }
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
        provider: body.constraints?.provider,
      }).then(async () => {
        // Session completed — POST results to callback (with retry)
        const response = buildEngageResponse(session, 'completed', startTime);
        await postWebhookWithRetry(callbackUrl, response);
      }).catch(async (err) => {
        logger.error('Session failed', { sessionId: session.id, error: err });
        // A dispatch failure is already user-visible (the engagement won't
        // deliver) but the CAUSE is only in our logs. Page Sentry so a
        // regression in the orchestrator doesn't silently degrade every
        // agent-mode client at once.
        captureError(err, { sessionId: session.id, phase: 'engage_dispatch' });
        // Attempt to notify the callback of failure (with retry)
        const errorResponse = buildEngageResponse(session, 'failed', startTime);
        await postWebhookWithRetry(callbackUrl, errorResponse).catch((deliveryErr) => {
          logger.error('Could not deliver failure notification', { sessionId: session.id });
          captureError(deliveryErr, { sessionId: session.id, phase: 'engage_failure_callback', callbackUrl });
        });
      }).catch((err) => {
        // Safety net: prevent unhandled rejection if the error handler itself throws
        logger.error('Unhandled error in webhook dispatch chain', { sessionId: session.id, error: err });
        captureError(err, { sessionId: session.id, phase: 'engage_chain_safety_net' });
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
        provider: body.constraints?.provider,
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

      // Halt the session to stop agents and prevent further API costs
      if (!session.isHalted()) {
        session.halt(`Sync engage failed: ${message}`);
      }

      // If the session timed out or failed, still return what we have
      const status = 'failed';
      const response = buildEngageResponse(session, status, startTime);

      // Audit follow-up: generic client error; full `message` is already
      // captured in `session.halt(...)` above and the upstream logger call.
      const formatted = applyFormat(response, body.format) as Record<string, unknown>;
      return reply.status(500).send({
        ...formatted,
        error: 'Engagement failed. Please try again.',
      });
    }
  });
}
