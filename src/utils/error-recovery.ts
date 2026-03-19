/**
 * Error Recovery — Structured error handling for The Shem sessions.
 *
 * When a session encounters an error mid-workflow:
 * 1. Emits a `session_error` event (so WebSocket clients know)
 * 2. Saves partial session state to the audit directory
 * 3. Returns a structured error object for API responses
 *
 * Partial results from failed sessions are still valuable —
 * analysis findings, debate records, and verification results
 * are preserved even when the workflow doesn't complete.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { eventTimestamp } from '../events/event-bus.js';
import { ensureDir, writeJsonFileAtomic } from './fs-helpers.js';
import type { SessionState } from '../session/session-state.js';
import { createLogger } from './logger.js';

const logger = createLogger('ERROR-RECOVERY');

// ── Structured Error ──────────────────────────────────────────────────────

export interface SessionError {
  sessionId: string;
  step: string;
  cause: string;
  stack?: string;
  timestamp: string;
  partialResults: {
    findingsCount: number;
    challengesCount: number;
    resolutionsCount: number;
    verificationCount: number;
    completedSteps: string[];
    accumulatedCost: number;
  };
}

// ── Error Handler ─────────────────────────────────────────────────────────

/**
 * Handle a session error:
 * - Emit session_error event
 * - Save partial state to audit dir
 * - Return structured error
 */
export function handleSessionError(
  session: SessionState,
  error: unknown,
): SessionError {
  const cause = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  const currentStep = session.genericWorkflow
    ? session.genericWorkflow.currentStep
    : session.workflow.currentStep;

  const completedSteps = session.genericWorkflow
    ? session.genericWorkflow.completedSteps
    : session.workflow.completedSteps;

  const sessionError: SessionError = {
    sessionId: session.id,
    step: currentStep,
    cause,
    stack,
    timestamp: eventTimestamp(),
    partialResults: {
      findingsCount: session.debate.findings.length,
      challengesCount: session.debate.challenges.length,
      resolutionsCount: session.debate.resolutions.length,
      verificationCount: session.verificationResults.length,
      completedSteps: [...completedSteps],
      accumulatedCost: session.accumulatedCost,
    },
  };

  // Emit event for WebSocket clients
  session.events.emitEvent({
    type: 'session_error',
    sessionId: session.id,
    step: currentStep,
    message: cause,
    recoverable: false,
    timestamp: sessionError.timestamp,
  });

  // Save partial state to audit directory
  saveErrorState(session, sessionError);

  return sessionError;
}

/**
 * Save session state on error for post-mortem analysis.
 * Written to: {auditDir}/{sessionId}.error.json
 */
function saveErrorState(session: SessionState, error: SessionError): void {
  try {
    const auditDir = session.auditDir;
    ensureDir(auditDir);

    const errorFile = path.join(auditDir, `${session.id}.error.json`);
    const state = {
      error,
      session: {
        id: session.id,
        workflowTemplateId: session.workflowTemplateId,
        workflow: session.workflow,
        genericWorkflow: session.genericWorkflow,
        debate: {
          findingsCount: session.debate.findings.length,
          challengesCount: session.debate.challenges.length,
          responsesCount: session.debate.responses.length,
          resolutionsCount: session.debate.resolutions.length,
        },
        verificationResults: session.verificationResults.length,
        gateDecisions: session.gateDecisions,
        cost: {
          accumulated: session.accumulatedCost,
          budget: session.budgetUsd,
        },
        riskAssessments: session.riskAssessments.length,
      },
      eventCount: session.events.getEventCount(),
      savedAt: eventTimestamp(),
    };

    writeJsonFileAtomic(errorFile, state);
  } catch {
    // Best-effort — don't let error saving fail the error handling
    logger.error('Failed to save error state', { sessionId: session.id });
  }
}
