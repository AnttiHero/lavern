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

/**
 * Validate that a URL is safe to fetch (SSRF prevention).
 * Blocks:
 *  - Non-HTTPS schemes (except http://localhost in dev)
 *  - Private/reserved IP ranges (10.x, 172.16-31.x, 192.168.x, 169.254.x, 127.x)
 *  - Localhost and loopback addresses
 *  - IPv6 loopback (::1) and link-local (fe80::)
 */
function isUrlSafe(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  // Only allow HTTPS (and HTTP localhost in dev mode)
  const isDev = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
  if (parsed.protocol === 'http:') {
    if (!isDev || !isLocalhostHostname(parsed.hostname)) {
      return false;
    }
    // In dev, allow http://localhost but still block private IPs
    return true;
  }
  if (parsed.protocol !== 'https:') {
    return false;
  }

  // Block localhost / loopback
  if (isLocalhostHostname(parsed.hostname)) {
    return false;
  }

  // Block private/reserved IP ranges
  if (isPrivateIp(parsed.hostname)) {
    return false;
  }

  return true;
}

function isLocalhostHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return lower === 'localhost' || lower === '127.0.0.1' || lower === '::1'
    || lower === '[::1]' || lower === '0.0.0.0';
}

function isPrivateIp(hostname: string): boolean {
  // Strip IPv6 brackets if present
  const clean = hostname.replace(/^\[|\]$/g, '');

  // IPv6 loopback and link-local
  if (clean === '::1' || clean.startsWith('fe80:') || clean.startsWith('fc00:') || clean.startsWith('fd00:')) {
    return true;
  }

  // IPv4 checks
  const ipv4Match = clean.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [, a, b] = ipv4Match.map(Number);
    // 10.0.0.0/8
    if (a === 10) return true;
    // 172.16.0.0/12
    if (a === 172 && b >= 16 && b <= 31) return true;
    // 192.168.0.0/16
    if (a === 192 && b === 168) return true;
    // 127.0.0.0/8 (loopback)
    if (a === 127) return true;
    // 169.254.0.0/16 (link-local)
    if (a === 169 && b === 254) return true;
    // 0.0.0.0
    if (a === 0 && b === 0) return true;
  }

  return false;
}

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
  console.error(`[ENGAGE] Webhook POST to ${url} failed after ${maxRetries + 1} attempts`);
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
        provider: body.constraints?.provider,
      }).then(async () => {
        // Session completed — POST results to callback (with retry)
        const response = buildEngageResponse(session, 'completed', startTime);
        await postWebhookWithRetry(callbackUrl, response);
      }).catch(async (err) => {
        console.error(`[ENGAGE] Session ${session.id} failed:`, err);
        // Attempt to notify the callback of failure (with retry)
        const errorResponse = buildEngageResponse(session, 'failed', startTime);
        await postWebhookWithRetry(callbackUrl, errorResponse).catch(() => {
          console.error(`[ENGAGE] Could not deliver failure notification for ${session.id}`);
        });
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

      // Include the error in the response
      const formatted = applyFormat(response, body.format) as Record<string, unknown>;
      return reply.status(500).send({
        ...formatted,
        error: message,
      });
    }
  });
}
