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
import { config } from '../config.js';
import { createLogger } from '../utils/logger.js';
import { isUrlSafe } from '../utils/url-safety.js';

const logger = createLogger('GATE');

// ── Types ────────────────────────────────────────────────────────────────

export interface GateRequest {
  gateType: 'ethics_critical' | 'meaning_critical' | 'final_delivery';
  summary: string;
  details: string;
  proposedAction: string;
}

export interface GateDecision {
  decision: 'approve' | 'reject' | 'modify';
  notes?: string;
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
    request: GateRequest;
    resolve: (decision: GateDecision) => void;
    createdAt: number;
    timer: ReturnType<typeof setTimeout> | null;
  } | null = null;

  /** Gate timeout in ms. Default 5 minutes. Set to 0 to disable. */
  private timeoutMs: number;

  constructor(timeoutMs = 5 * 60 * 1000) {
    this.timeoutMs = timeoutMs;
  }

  async resolve(request: GateRequest): Promise<GateDecision> {
    // Clear any stale pending gate (safety net) — reject, don't approve
    if (this.pendingGate) {
      if (this.pendingGate.timer) clearTimeout(this.pendingGate.timer);
      this.pendingGate.resolve({ decision: 'reject', notes: 'Superseded by new gate request — rejected for safety' });
      this.pendingGate = null;
    }

    return new Promise<GateDecision>((resolvePromise) => {
      const timer = this.timeoutMs > 0
        ? setTimeout(() => {
            logger.warn('Gate timeout — rejecting for safety', { timeoutSec: this.timeoutMs / 1000, gateType: request.gateType });
            if (this.pendingGate) {
              this.pendingGate = null;
              resolvePromise({
                decision: 'reject',
                notes: `Gate timed out — rejected for safety. No human response within ${Math.round(this.timeoutMs / 60000)} minutes.`,
              });
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
   * Submit a decision for the pending gate (called by API route).
   */
  submitDecision(decision: GateDecision): boolean {
    if (!this.pendingGate) return false;
    if (this.pendingGate.timer) clearTimeout(this.pendingGate.timer);
    this.pendingGate.resolve(decision);
    this.pendingGate = null;
    return true;
  }

  /**
   * Cancel any pending gate and clean up timers.
   */
  cancel(): void {
    if (this.pendingGate) {
      if (this.pendingGate.timer) clearTimeout(this.pendingGate.timer);
      this.pendingGate.resolve({ decision: 'reject', notes: 'Session cancelled' });
      this.pendingGate = null;
    }
  }
}

// ── Auto-Approve Resolver (Testing) ──────────────────────────────────────

export class AutoApproveGateResolver implements GateResolver {
  public decisions: Array<{ request: GateRequest; decision: GateDecision }> = [];

  async resolve(request: GateRequest): Promise<GateDecision> {
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

  async resolve(request: GateRequest): Promise<GateDecision> {
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

      const response = await fetch(this.callbackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'gate_request',
          gateType: request.gateType,
          summary: request.summary,
          details: request.details,
          proposedAction: request.proposedAction,
          timestamp: new Date().toISOString(),
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        logger.error('Webhook gate callback failed', { status: response.status, statusText: response.statusText });
        return this.fallbackResolve(request);
      }

      const body = await response.json() as {
        decision?: 'approve' | 'reject' | 'modify';
        notes?: string;
      };

      if (!body.decision || !['approve', 'reject', 'modify'].includes(body.decision)) {
        logger.error('Invalid decision in webhook callback response', { body });
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
