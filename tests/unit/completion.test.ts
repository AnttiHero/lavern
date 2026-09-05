import { describe, it, expect } from 'vitest';
import { assessCompletion } from '../../src/workflows/completion.js';
import { SessionState } from '../../src/session/session-state.js';
import { reviewTemplate } from '../../src/workflows/templates/review.js';

function session(step: string, completed: string[], extra: Record<string, unknown> = {}): SessionState {
  const s = new SessionState('c');
  const now = new Date().toISOString();
  s.genericWorkflow = { templateId: 'review', currentStep: step, completedSteps: completed, gateDecisions: {}, evaluatorResults: [], revisionCount: 0, qualityChecks: [], stepIterationCounts: {}, handoffs: [], startedAt: now, lastTransitionAt: now, ...extra } as never;
  return s;
}
const finalStep = reviewTemplate.steps[reviewTemplate.steps.length - 1];
const allButLast = reviewTemplate.steps.slice(0, -1);

describe('assessCompletion', () => {
  it('halted -> interrupted', () => {
    const s = session('intake', []); s.halt('Cancelled by user');
    expect(assessCompletion(s, reviewTemplate).outcome).toBe('interrupted');
  });
  it('stream failed -> failed', () => {
    expect(assessCompletion(session('intake', []), reviewTemplate, { outcome: 'failed', subtype: 'error_during_execution' }).outcome).toBe('failed');
  });
  it('budget exhausted before the end -> budget_exhausted', () => {
    const s = session('specialist_analysis', ['intake']); (s as unknown as { budgetUsd: number }).budgetUsd = 1; s.updateCost(1.2);
    expect(assessCompletion(s, reviewTemplate).outcome).toBe('budget_exhausted');
  });
  it('stream interrupted -> interrupted with the step named', () => {
    const a = assessCompletion(session('intake', []), reviewTemplate, { outcome: 'interrupted', subtype: 'error_max_turns' });
    expect(a.outcome).toBe('interrupted'); expect(a.reasons[0]).toContain('intake');
  });
  it('unresolved quality escalation -> awaiting_approval', () => {
    const s = session('evaluator_gate', ['intake', 'specialist_analysis'], { qualityEscalation: { step: 'evaluator_gate', score: 0.5, revisions: 2, maxRevisions: 2, failureReasons: [], raisedAt: new Date().toISOString() } });
    expect(assessCompletion(s, reviewTemplate, { outcome: 'completed' }).outcome).toBe('awaiting_approval');
  });
  it('success text without finishing the state machine -> interrupted, with the missing gate named', () => {
    const a = assessCompletion(session('specialist_analysis', ['intake']), reviewTemplate, { outcome: 'completed' });
    expect(a.outcome).toBe('interrupted');
    expect(a.reasons.join(' ')).toMatch(/gate|never completed|ended at step/);
  });
  it('every step completed through the engine -> completed', () => {
    const s = session(finalStep, allButLast);
    expect(assessCompletion(s, reviewTemplate, { outcome: 'completed' })).toEqual({ outcome: 'completed', reasons: [] });
  });
});
