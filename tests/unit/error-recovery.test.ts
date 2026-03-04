/**
 * Unit Tests — Error Recovery (src/utils/error-recovery.ts)
 *
 * Tests that:
 * - handleSessionError emits session_error event
 * - handleSessionError saves error state to audit dir
 * - Structured error contains correct session info
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SessionState } from '../../src/session/session-state.js';
import { handleSessionError } from '../../src/utils/error-recovery.js';

describe('Error Recovery', () => {
  let session: SessionState;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shem-error-test-'));
    session = new SessionState('test-error-recovery', {
      auditDir: tmpDir,
    });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should emit session_error event', () => {
    const events: unknown[] = [];
    session.events.on('session_error', (e: unknown) => events.push(e));

    handleSessionError(session, new Error('Test failure'));

    expect(events).toHaveLength(1);
    const event = events[0] as Record<string, unknown>;
    expect(event.type).toBe('session_error');
    expect(event.sessionId).toBe('test-error-recovery');
    expect(event.message).toBe('Test failure');
    expect(event.recoverable).toBe(false);
  });

  it('should return structured error with session info', () => {
    const result = handleSessionError(session, new Error('Something broke'));

    expect(result.sessionId).toBe('test-error-recovery');
    expect(result.cause).toBe('Something broke');
    expect(result.step).toBe('intake'); // default initial step
    expect(result.timestamp).toBeDefined();
    expect(result.partialResults).toBeDefined();
    expect(result.partialResults.findingsCount).toBe(0);
    expect(result.partialResults.completedSteps).toEqual([]);
    expect(result.partialResults.accumulatedCost).toBe(0);
  });

  it('should include stack trace for Error objects', () => {
    const result = handleSessionError(session, new Error('Stack test'));
    expect(result.stack).toBeDefined();
    expect(result.stack).toContain('Stack test');
  });

  it('should handle non-Error values', () => {
    const result = handleSessionError(session, 'string error');
    expect(result.cause).toBe('string error');
    expect(result.stack).toBeUndefined();
  });

  it('should save error state to audit directory', () => {
    handleSessionError(session, new Error('Save test'));

    const errorFile = path.join(tmpDir, 'test-error-recovery.error.json');
    expect(fs.existsSync(errorFile)).toBe(true);

    const saved = JSON.parse(fs.readFileSync(errorFile, 'utf-8'));
    expect(saved.error.sessionId).toBe('test-error-recovery');
    expect(saved.error.cause).toBe('Save test');
    expect(saved.session.id).toBe('test-error-recovery');
  });

  it('should capture partial results from a session in progress', () => {
    // Simulate some work being done
    session.debate.findings.push({
      id: 'F-001',
      agentRole: 'ethics-auditor',
      category: 'Fairness',
      severity: 'RED',
      confidence: 0.9,
      text: 'Unfair cancellation clause',
      affectedSection: 'Section 5',
      timestamp: new Date().toISOString(),
    });
    session.debate.challenges.push({
      id: 'C-001',
      challengerRole: 'client-proxy',
      targetFindingId: 'F-001',
      reason: 'This is standard in the industry',
      timestamp: new Date().toISOString(),
    });
    session.accumulatedCost = 1.25;

    const result = handleSessionError(session, new Error('Mid-session failure'));

    expect(result.partialResults.findingsCount).toBe(1);
    expect(result.partialResults.challengesCount).toBe(1);
    expect(result.partialResults.accumulatedCost).toBe(1.25);
  });

  it('should capture generic workflow step if active', () => {
    session.genericWorkflow = {
      templateId: 'review',
      currentStep: 'analysis',
      completedSteps: ['intake'],
      gateDecisions: {},
      evaluatorResults: [],
      revisionCount: 0,
      startedAt: new Date().toISOString(),
      lastTransitionAt: new Date().toISOString(),
    };

    const result = handleSessionError(session, new Error('Generic workflow error'));

    expect(result.step).toBe('analysis');
    expect(result.partialResults.completedSteps).toEqual(['intake']);
  });
});
