/**
 * useDemoSimulator — Generates fake ShemEvents on a timer for demo mode.
 *
 * When the session ID starts with "demo-session-", this hook fires
 * a scripted sequence of events so the thinking stream is populated
 * without a live backend.
 */

import { useEffect, useRef } from 'react';
import type { ShemEvent, WorkflowStep, Severity } from '../../types/events.js';
import { WORKFLOW_STEPS } from '../../types/events.js';

interface DemoSimulatorOptions {
  sessionId: string | undefined;
  teamRoles: string[];
  onEvent: (event: ShemEvent) => void;
}

function ts(offsetMs = 0): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

function buildDemoScript(teamRoles: string[]): Array<{ delayMs: number; event: ShemEvent }> {
  let findingCounter = 0;
  let challengeCounter = 0;
  let responseCounter = 0;
  let resolutionCounter = 0;
  let verificationCounter = 0;

  const agents = teamRoles.length > 0 ? teamRoles : [
    'design-reviewer', 'ethics-auditor', 'plain-language-specialist',
    'transformation-specialist', 'meaning-guardian', 'synthesis-editor',
  ];

  const script: Array<{ delayMs: number; event: ShemEvent }> = [];
  let delay = 300;

  function add(ms: number, event: ShemEvent) {
    delay += ms;
    script.push({ delayMs: delay, event });
  }

  function fid() { return `finding-${++findingCounter}`; }
  function cid() { return `challenge-${++challengeCounter}`; }
  function rid() { return `response-${++responseCounter}`; }
  function resid() { return `resolution-${++resolutionCounter}`; }
  function vid() { return `verification-${++verificationCounter}`; }

  // Pick agents by index (wrap around if team is small)
  const a = (i: number) => agents[i % agents.length];

  // ── Session start ──
  add(0, { type: 'session_start', sessionId: 'demo', document: 'Demo document', timestamp: ts() });
  add(100, { type: 'cost_update', totalUsd: 0.00, budgetUsd: 10.00, timestamp: ts() });

  // ── Phase: Analysis ──
  add(500, { type: 'workflow_step', step: 'parallel_analysis', previousStep: 'intake', timestamp: ts() });

  add(400, { type: 'agent_start', agentId: `${a(0)}-1`, role: a(0), task: 'Analyzing document structure and visual hierarchy', timestamp: ts() });
  add(600, { type: 'agent_start', agentId: `${a(1)}-1`, role: a(1), task: 'Reviewing ethical compliance and accessibility standards', timestamp: ts() });
  add(300, { type: 'agent_start', agentId: `${a(2)}-1`, role: a(2), task: 'Evaluating readability and plain language compliance', timestamp: ts() });

  add(800, { type: 'cost_update', totalUsd: 0.42, budgetUsd: 10.00, timestamp: ts() });

  const f1 = fid();
  add(1200, { type: 'finding_posted', findingId: f1, agent: a(0), category: 'Visual hierarchy needs restructuring — headings inconsistent', severity: 'YELLOW' as Severity, confidence: 0.87, timestamp: ts() });

  const f2 = fid();
  add(800, { type: 'finding_posted', findingId: f2, agent: a(2), category: 'Flesch-Kincaid grade level 14.2 — exceeds target of 8', severity: 'RED' as Severity, confidence: 0.93, timestamp: ts() });

  add(600, { type: 'agent_stop', agentId: `${a(2)}-1`, role: a(2), durationMs: 3400, timestamp: ts() });

  const f3 = fid();
  add(500, { type: 'finding_posted', findingId: f3, agent: a(1), category: 'WCAG 2.1 AA compliance gap in color contrast ratios', severity: 'RED' as Severity, confidence: 0.91, timestamp: ts() });

  add(400, { type: 'agent_stop', agentId: `${a(0)}-1`, role: a(0), durationMs: 4200, timestamp: ts() });
  add(300, { type: 'agent_stop', agentId: `${a(1)}-1`, role: a(1), durationMs: 4800, timestamp: ts() });

  add(200, { type: 'cost_update', totalUsd: 1.28, budgetUsd: 10.00, timestamp: ts() });

  // ── Phase: First Review (Debate) ──
  add(600, { type: 'workflow_step', step: 'debate_1', previousStep: 'parallel_analysis', timestamp: ts() });

  // Challenge on f1
  const c1 = cid();
  add(800, { type: 'challenge_posted', challengeId: c1, challenger: a(1), targetFindingId: f1, timestamp: ts() });

  const r1 = rid();
  add(1000, { type: 'response_posted', responseId: r1, responder: a(0), challengeId: c1, accepted: true, timestamp: ts() });

  add(600, { type: 'debate_resolved', resolutionId: resid(), topic: 'Visual hierarchy severity', resolution: 'Upgraded to RED — structural issue affects comprehension', confidence: 0.89, timestamp: ts() });

  add(400, { type: 'cost_update', totalUsd: 1.85, budgetUsd: 10.00, timestamp: ts() });

  // ── Phase: Ethics Check ──
  add(500, { type: 'workflow_step', step: 'ethics_gate', previousStep: 'debate_1', timestamp: ts() });

  add(800, { type: 'gate_requested', gateType: 'ethics_critical', summary: 'Accessibility violations require human review', details: 'Two RED findings related to WCAG 2.1 AA compliance and readability levels above target grade. These affect document accessibility for users with disabilities and low literacy.', timestamp: ts() });

  // Auto-decide gate after a pause
  add(2500, { type: 'gate_decided', gateType: 'ethics_critical', decision: 'approve', notes: 'Proceed with remediation', timestamp: ts() });

  // ── Phase: Transformation ──
  add(400, { type: 'workflow_step', step: 'transformation', previousStep: 'ethics_gate', timestamp: ts() });

  add(300, { type: 'agent_start', agentId: `${a(3 % agents.length)}-1`, role: a(3 % agents.length), task: 'Restructuring document with improved visual hierarchy', timestamp: ts() });
  add(400, { type: 'agent_start', agentId: `${a(2)}-2`, role: a(2), task: 'Rewriting content to Grade 8 reading level', timestamp: ts() });

  add(1500, { type: 'cost_update', totalUsd: 2.94, budgetUsd: 10.00, timestamp: ts() });

  const f4 = fid();
  add(1200, { type: 'finding_posted', findingId: f4, agent: a(3 % agents.length), category: 'New heading structure applied — 3 levels, consistent styling', severity: 'GREEN' as Severity, confidence: 0.95, timestamp: ts() });

  add(800, { type: 'agent_stop', agentId: `${a(3 % agents.length)}-1`, role: a(3 % agents.length), durationMs: 3800, timestamp: ts() });
  add(600, { type: 'agent_stop', agentId: `${a(2)}-2`, role: a(2), durationMs: 4200, timestamp: ts() });

  // ── Phase: Verification ──
  add(400, { type: 'workflow_step', step: 'parallel_verification', previousStep: 'transformation', timestamp: ts() });

  add(500, { type: 'verification_run', verificationId: vid(), verificationType: 'readability', passed: true, confidence: 0.92, timestamp: ts() });
  add(400, { type: 'verification_run', verificationId: vid(), verificationType: 'accessibility', passed: true, confidence: 0.88, timestamp: ts() });
  add(300, { type: 'verification_run', verificationId: vid(), verificationType: 'legal-accuracy', passed: true, confidence: 0.94, timestamp: ts() });

  add(200, { type: 'cost_update', totalUsd: 3.67, budgetUsd: 10.00, timestamp: ts() });

  // ── Phase: Second Review ──
  add(400, { type: 'workflow_step', step: 'debate_2', previousStep: 'parallel_verification', timestamp: ts() });

  add(800, { type: 'debate_resolved', resolutionId: resid(), topic: 'Transformation quality', resolution: 'All verification checks passed. Document meets targets.', confidence: 0.93, timestamp: ts() });

  // ── Phase: Meaning Check ──
  add(400, { type: 'workflow_step', step: 'meaning_gate', previousStep: 'debate_2', timestamp: ts() });

  add(300, { type: 'agent_start', agentId: `${a(4 % agents.length)}-1`, role: a(4 % agents.length), task: 'Verifying legal meaning preserved after transformation', timestamp: ts() });

  const f5 = fid();
  add(1200, { type: 'finding_posted', findingId: f5, agent: a(4 % agents.length), category: 'Legal meaning fully preserved — no semantic drift detected', severity: 'GREEN' as Severity, confidence: 0.96, timestamp: ts() });

  add(600, { type: 'agent_stop', agentId: `${a(4 % agents.length)}-1`, role: a(4 % agents.length), durationMs: 2100, timestamp: ts() });

  add(200, { type: 'cost_update', totalUsd: 4.12, budgetUsd: 10.00, timestamp: ts() });

  // ── Phase: Synthesis ──
  add(400, { type: 'workflow_step', step: 'synthesis', previousStep: 'meaning_gate', timestamp: ts() });

  add(300, { type: 'agent_start', agentId: `${a(5 % agents.length)}-1`, role: a(5 % agents.length), task: 'Compiling final document with all revisions', timestamp: ts() });
  add(1500, { type: 'agent_stop', agentId: `${a(5 % agents.length)}-1`, role: a(5 % agents.length), durationMs: 1800, timestamp: ts() });

  add(200, { type: 'cost_update', totalUsd: 4.58, budgetUsd: 10.00, timestamp: ts() });

  // ── Phase: Final Approval ──
  add(400, { type: 'workflow_step', step: 'final_gate', previousStep: 'synthesis', timestamp: ts() });

  add(600, { type: 'gate_requested', gateType: 'final_delivery', summary: 'Final document ready for delivery', details: 'All checks passed. Readability improved from Grade 14.2 to Grade 7.8. WCAG AA compliance achieved. Legal meaning verified.', timestamp: ts() });

  add(3000, { type: 'gate_decided', gateType: 'final_delivery', decision: 'approve', timestamp: ts() });

  // ── Delivered ──
  add(400, { type: 'workflow_step', step: 'delivered', previousStep: 'final_gate', timestamp: ts() });
  add(200, { type: 'cost_update', totalUsd: 4.58, budgetUsd: 10.00, timestamp: ts() });
  add(500, { type: 'session_end', sessionId: 'demo', totalCost: 4.58, duration: delay, timestamp: ts() });

  return script;
}

export function useDemoSimulator({ sessionId, teamRoles, onEvent }: DemoSimulatorOptions) {
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    // Clean up previous timers
    for (const t of timersRef.current) clearTimeout(t);
    timersRef.current = [];

    if (!sessionId?.startsWith('demo-session-')) return;

    const script = buildDemoScript(teamRoles);

    for (const { delayMs, event } of script) {
      const timer = setTimeout(() => {
        onEvent(event);
      }, delayMs);
      timersRef.current.push(timer);
    }

    return () => {
      for (const t of timersRef.current) clearTimeout(t);
      timersRef.current = [];
    };
  }, [sessionId, teamRoles, onEvent]);
}
