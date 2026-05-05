/**
 * Verify Routes — Standalone document verification endpoint.
 *
 * POST /api/verify — Upload any legal document, get a 10-pass Verification Report.
 * Forces the 'verification' workflow. Returns sessionId immediately (async)
 * or blocks until the verification report is compiled (sync).
 *
 * v16: The Shem's standalone verification product.
 */

import { z } from 'zod';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { SessionManager } from '../../session/session-manager.js';
import { dispatch } from '../../dispatch.js';
import { waitForSessionCompletion } from '../../session/session-waiter.js';
import { AutoApproveGateResolver } from '../../gates/gate-resolver.js';
import type { LegalRequest } from '../../types/index.js';
import type { ClientIdentity } from '../../types/client.js';
import { validateBody } from '../middleware/validation.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('VERIFY');

// ── Request Schema ──────────────────────────────────────────────────────

const VerifyDocumentSchema = z.object({
  name: z.string().min(1).max(500),
  content: z.string().min(1).max(100_000),
});

const VerifyContextSchema = z.object({
  jurisdiction: z.enum(['US', 'EU', 'UK', 'CA', 'AU']).optional(),
  audience: z.enum(['consumer', 'smb', 'enterprise', 'employee']).optional(),
  documentType: z.string().max(200).optional(),
}).strict().optional();

export const VerifyRequestSchema = z.object({
  document: VerifyDocumentSchema,
  context: VerifyContextSchema,
  mode: z.enum(['sync', 'async']).optional().default('async'),
}).strict();

export type VerifyRequestBody = z.infer<typeof VerifyRequestSchema>;

// ── Route Registration ──────────────────────────────────────────────────

export function registerVerifyRoutes(
  fastify: FastifyInstance,
  sessionManager: SessionManager,
): void {

  fastify.post('/api/verify', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = validateBody<VerifyRequestBody>(VerifyRequestSchema, request, reply);
    if (!body) return;

    const client = (request as FastifyRequest & { client?: ClientIdentity }).client;

    const gateResolver = new AutoApproveGateResolver();

    const session = sessionManager.createSession({
      gateResolver,
      budgetUsd: 3.0,
    });

    if (client) {
      session.clientIdentity = client;
    }

    const legalRequest: LegalRequest = {
      type: 'general',
      requestText: `Verify the following document:\n\n### ${body.document.name}\n${body.document.content}`,
      context: body.context ? {
        jurisdiction: body.context.jurisdiction,
        audience: body.context.audience,
        documentType: body.context.documentType,
      } : undefined,
    };

    if (body.mode === 'async') {
      // Fire-and-forget: return session ID immediately
      // yoloMode: verification is a fully automated pipeline — no human
      // review gates. The verification workflow validates document integrity,
      // not legal substance, so gate approval adds no value here.
      dispatch(legalRequest, {
        session,
        gateResolver,
        forceWorkflow: 'verification',
        intensity: 'standard',
        maxBudgetUsd: 3.0,
        yoloMode: true,
      }).catch((err) => {
        logger.error('Session failed', { sessionId: session.id, error: err });
      });

      return reply.status(202).send({
        sessionId: session.id,
        status: 'running',
        statusUrl: `/api/sessions/${session.id}`,
        eventsUrl: `/api/sessions/${session.id}/events`,
      });
    }

    // Sync mode: wait for completion
    // yoloMode: same as async — verification is automated. See comment above.
    try {
      const dispatchPromise = dispatch(legalRequest, {
        session,
        gateResolver,
        forceWorkflow: 'verification',
        intensity: 'standard',
        maxBudgetUsd: 3.0,
        yoloMode: true,
      });

      const timeoutMs = 5 * 60 * 1000;
      await Promise.race([
        waitForSessionCompletion(session, timeoutMs),
        dispatchPromise,
      ]);

      const report = session.verificationPipeline?.report;

      return reply.send({
        sessionId: session.id,
        status: session.isHalted() ? 'halted' : 'completed',
        report: report ?? null,
        cost: {
          totalUsd: Math.round(session.accumulatedCost * 10000) / 10000,
          budgetUsd: session.budgetUsd,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      // Halt session to stop agents and prevent further API costs
      if (!session.isHalted()) {
        session.halt(`Verify failed: ${message}`);
      }

      // Audit follow-up: generic client message; full `message` captured
      // in halt() above and surfaced in subsequent session-state reads.
      return reply.status(500).send({
        sessionId: session.id,
        status: 'failed',
        error: 'Verification failed. Please try again.',
        report: session.verificationPipeline?.report ?? null,
      });
    }
  });
}
