/**
 * Gate Resolver — Abstraction for human-in-the-loop decision points.
 *
 * Four implementations:
 * 1. ReadlineGateResolver — CLI mode (blocks on stdin, existing behavior)
 * 2. AsyncGateResolver — API mode (returns a Promise, resolved by POST /gate/:id)
 * 3. AutoApproveGateResolver — Testing mode (auto-approves everything)
 * 4. WebhookGateResolver — Agent mode (POSTs to callback URL, waits for response)
 *
 * The approval-gate MCP tool calls `session.gateResolver.resolve()`
 * instead of directly using readline. This enables both human and
 * agentic clients.
 */

import * as readline from 'node:readline';
import { createHash, randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { createLogger } from '../utils/logger.js';
import { isUrlSafe } from '../utils/url-safety.js';

const logger = createLogger('GATE');

// ── Types ────────────────────────────────────────────────────────────────

export interface GateRequest {
  gateType: 'ethics_critical' | 'meaning_critical' | 'final_delivery' | 'engagement_acceptance' | 'team_selection' | 'quality_escalation';
  summary: string;
  details: string;
  proposedAction: string;
  /**
   * Unpredictable identity of THIS request. A decision must name it: consent
   * given for one artifact must never resolve a replacement request of the
   * same type (delayed response, double-click, second tab, retry).
   */
  gateId?: string;
  /** Digest of what the human is deciding on (summary + details + action). */
  artifactDigest?: string;
  requestedAt?: string;
}

export interface GateDecision {
  decision: 'approve' | 'reject' | 'modify';
  notes?: string;
}

/** Outcome of submitting a decision against the pending gate. */
export type SubmitResult =
  | { ok: true; idempotent?: boolean; decision: GateDecision; gateId: string }
  | { ok: false; reason: 'no_pending' | 'gate_mismatch' | 'gate_superseded'; currentGateId?: string; recordedDecision?: GateDecision };

/** Stable identity for a gate request; fills gateId/digest/requestedAt if absent. */
export function identifyGateRequest(request: GateRequest): Required<Pick<GateRequest, 'gateId' | 'artifactDigest' | 'requestedAt'>> & GateRequest {
  const gateId = request.gateId ?? randomUUID();
  const artifactDigest = request.artifactDigest
    ?? createHash('sha256').update(`${request.gateType}\n${request.summary}\n${request.details}\n${request.proposedAction}`).digest('hex').slice(0, 24);
  return { ...request, gateId, artifactDigest, requestedAt: request.requestedAt ?? new Date().toISOString() };
}

export interface GateResolver {
  resolve(request: GateRequest): Promise<GateDecision>;
}

// ── Readline Resolver (CLI) ──────────────────────────────────────────────

export class ReadlineGateResolver implements GateResolver {
  async resolve(request: GateRequest): Promise<GateDecision> {
    const gateLabels: Record<string, string> = {
      ethics_critical: 'ETHICS CRITICAL',
      meaning_critical: 'MEANING CRITICAL',
      final_delivery: 'FINAL DELIVERY',
    };

    const separator = '\u2550'.repeat(60);
    const display = `
${separator}
  HUMAN GATE: ${gateLabels[request.gateType] || request.gateType}
${separator}

${request.summary}

DETAILS:
${request.details}

PROPOSED ACTION:
${request.proposedAction}

${separator}
Options: [a]pprove  [r]eject  [m]odify
${separator}
`;

    console.log(display);

    const response = await this.promptUser('Your decision (a/r/m): ');
    const decision: GateDecision['decision'] =
      response.toLowerCase().startsWith('a') ? 'approve' :
      response.toLowerCase().startsWith('r') ? 'reject' : 'modify';

    let notes: string | undefined;
    if (decision === 'modify' || decision === 'reject') {
      notes = await this.promptUser('Notes (what should change?): ');
    }

    return { decision, notes };
  }

  private async promptUser(question: string): Promise<string> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise((resolve) => {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    });
  }
}

// ── Async Resolver (API mode) ────────────────────────────────────────────

/**
 * Async gate resolver for API mode. When a gate is requested,
 * it stores a pending Promise that can be resolved by calling
 * `submitDecision()` (triggered by POST /sessions/:id/gate).
 */
export class AsyncGateResolver implements GateResolver {
  private pendingGate: {
    request: ReturnType<typeof identifyGateRequest>;
    resolve: (decision: GateDecision) => void;
    createdAt: number;
    timer: ReturnType<typeof setTimeout> | null;
  } | null = null;
  /** Decided gates, so an exact duplicate submission is idempotent (bounded). */
  private decided = new Map<string, GateDecision>();
  private static readonly DECIDED_CAP = 50;

  private remember(gateId: string, decision: GateDecision): void {
    this.decided.set(gateId, decision);
    if (this.decided.size > AsyncGateResolver.DECIDED_CAP) {
      const oldest = this.decided.keys().next().value;
      if (oldest !== undefined) this.decided.delete(oldest);
    }
  }

  /** Gate timeout in ms. Default 5 minutes. Set to 0 to disable. */
  private timeoutMs: number;

  constructor(timeoutMs = 5 * 60 * 1000) {
    this.timeoutMs = timeoutMs;
  }

  async resolve(rawRequest: GateRequest): Promise<GateDecision> {
    const request = identifyGateRequest(rawRequest);
    // Clear any stale pending gate (safety net) — reject, don't approve
    if (this.pendingGate) {
      if (this.pendingGate.timer) clearTimeout(this.pendingGate.timer);
      const superseded: GateDecision = { decision: 'reject', notes: 'Superseded by new gate request — rejected for safety' };
      this.remember(this.pendingGate.request.gateId, superseded);
      this.pendingGate.resolve(superseded);
      this.pendingGate = null;
    }

    return new Promise<GateDecision>((resolvePromise) => {
      const timer = this.timeoutMs > 0
        ? setTimeout(() => {
            logger.warn('Gate timeout — rejecting for safety', { timeoutSec: this.timeoutMs / 1000, gateType: request.gateType });
            if (this.pendingGate) {
              const timedOut: GateDecision = {
                decision: 'reject',
                notes: `Gate timed out — rejected for safety. No human response within ${Math.round(this.timeoutMs / 60000)} minutes.`,
              };
              this.remember(this.pendingGate.request.gateId, timedOut);
              this.pendingGate = null;
              resolvePromise(timedOut);
            }
          }, this.timeoutMs)
        : null; // no timer when timeout disabled

      this.pendingGate = {
        request,
        resolve: resolvePromise,
        createdAt: Date.now(),
        timer,
      };
    });
  }

  /**
   * Check if there is a pending gate waiting for a decision.
   */
  hasPendingGate(): boolean {
    return this.pendingGate !== null;
  }

  /**
   * Get the pending gate request (for API response).
   */
  getPendingGate(): GateRequest | null {
    return this.pendingGate?.request ?? null;
  }

  /**
   * How long the current gate has been pending, in ms. Returns 0 if no gate.
   */
  getPendingAge(): number {
    return this.pendingGate ? Date.now() - this.pendingGate.createdAt : 0;
  }

  /**
   * Submit a decision for the pending gate (called by API route). The
   * decision must name the gate it answers; a mismatch is refused so a
   * delayed answer can never approve a superseding request. Re-submitting
   * the decision for an already-decided gate is idempotent.
   */
  submitDecision(decision: GateDecision, gateId: string): SubmitResult {
    const currentGateId = this.pendingGate?.request.gateId;
    if (!this.pendingGate || currentGateId !== gateId) {
      const prior = this.decided.get(gateId);
      // Exact repeat of a decision already recorded for that gate (retry,
      // double-click): idempotent. A DIFFERENT decision for a gate that was
      // superseded, timed out or cancelled is refused — the recorded outcome
      // stands and the caller is told which gate is actually open.
      if (prior && prior.decision === decision.decision) return { ok: true, idempotent: true, decision: prior, gateId };
      if (prior) return { ok: false, reason: 'gate_superseded', currentGateId, recordedDecision: prior };
      return this.pendingGate ? { ok: false, reason: 'gate_mismatch', currentGateId } : { ok: false, reason: 'no_pending' };
    }
    if (this.pendingGate.timer) clearTimeout(this.pendingGate.timer);
    this.remember(gateId, decision);
    this.pendingGate.resolve(decision);
    this.pendingGate = null;
    return { ok: true, decision, gateId };
  }

  /**
   * Cancel any pending gate and clean up timers.
   */
  cancel(): void {
    if (this.pendingGate) {
      if (this.pendingGate.timer) clearTimeout(this.pendingGate.timer);
      const cancelled: GateDecision = { decision: 'reject', notes: 'Session cancelled' };
      this.remember(this.pendingGate.request.gateId, cancelled);
      this.pendingGate.resolve(cancelled);
      this.pendingGate = null;
    }
  }
}

// ── Auto-Approve Resolver (Testing) ──────────────────────────────────────

export class AutoApproveGateResolver implements GateResolver {
  public decisions: Array<{ request: GateRequest; decision: GateDecision }> = [];

  async resolve(rawRequest: GateRequest): Promise<GateDecision> {
    const request = identifyGateRequest(rawRequest);
    const decision: GateDecision = { decision: 'approve', notes: 'Auto-approved (test mode)' };
    this.decisions.push({ request, decision });
    return decision;
  }
}

// ── Webhook Resolver (Agent clients) ─────────────────────────────────

/**
 * Webhook gate resolver for AI agent clients.
 * POSTs the gate request to the client's callback URL and
 * waits for a structured response.
 *
 * Used when ClientIdentity.type === 'agent' and callbackUrl is set.
 * Falls back to AsyncGateResolver behavior if the webhook fails.
 */
export class WebhookGateResolver implements GateResolver {
  private callbackUrl: string;
  private timeoutMs: number;
  private fallback: AsyncGateResolver;

  constructor(callbackUrl: string, timeoutMs = config.gateWebhookTimeoutMs) {
    this.callbackUrl = callbackUrl;
    this.timeoutMs = timeoutMs;
    this.fallback = new AsyncGateResolver();
  }

  async resolve(rawRequest: GateRequest): Promise<GateDecision> {
    const request = identifyGateRequest(rawRequest);
    try {
      // SSRF defence-in-depth: refuse to fetch a URL that points at a
      // private/loopback/link-local target, even if upstream validation
      // missed it. The /api/clients route validates at write-time, but
      // older clients in storage and any future write paths are also
      // covered here.
      if (!isUrlSafe(this.callbackUrl)) {
        logger.error('Webhook callback rejected by SSRF guard', { hostnameRedacted: true });
        return this.fallbackResolve(request);
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

      // A public callback URL must not be able to redirect the gate payload to
      // a blocked destination: refuse redirects outright (as the engage
      // content-fetch path does) instead of fetch's default 'follow'.
      const response = await fetch(this.callbackUrl, {
        method: 'POST',
        redirect: 'error',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'gate_request',
          gateId: request.gateId,
          artifactDigest: request.artifactDigest,
          gateType: request.gateType,
          summary: request.summary,
          details: request.details,
          proposedAction: request.proposedAction,
          timestamp: new Date().toISOString(),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        clearTimeout(timeout);
        logger.error('Webhook gate callback failed', { status: response.status, statusText: response.statusText });
        return this.fallbackResolve(request);
      }

      // Keep the abort timer armed through the body read. Clearing it right
      // after headers arrived meant a server that sent headers then stalled
      // the body would hang the gate indefinitely.
      const body = await response.json() as {
        decision?: 'approve' | 'reject' | 'modify';
        notes?: string;
        gateId?: string;
      };
      clearTimeout(timeout);

      if (!body.decision || !['approve', 'reject', 'modify'].includes(body.decision)) {
        logger.error('Invalid decision in webhook callback response', { body });
        return this.fallbackResolve(request);
      }
      // A response that names a different gate is a stale answer, not consent.
      if (body.gateId !== undefined && body.gateId !== request.gateId) {
        logger.error('Webhook decision names a different gate — rejected', { expected: request.gateId, got: body.gateId });
        return this.fallbackResolve(request);
      }

      return {
        decision: body.decision,
        notes: body.notes,
      };
    } catch (error) {
      logger.error('Webhook gate callback error', { error });
      return this.fallbackResolve(request);
    }
  }

  /**
   * Fall back to rejecting the gate if webhook fails.
   * An async fallback would hang indefinitely since no external client
   * knows about the internal AsyncGateResolver instance.
   */
  private async fallbackResolve(_request: GateRequest): Promise<GateDecision> {
    logger.error('Webhook gate failed — rejecting for safety. Agent client should retry or use /gate endpoint.');
    return {
      decision: 'reject',
      notes: 'Webhook callback failed — gate rejected for safety. Please retry or submit via POST /gate endpoint.',
    };
  }

  /**
   * Get the fallback resolver for manual submission.
   */
  getFallback(): AsyncGateResolver {
    return this.fallback;
  }
}
