/**
 * useDemoSimulator — Generates fake ShemEvents on a timer for demo mode.
 *
 * v13: "The Counsel Room" — richer thinking sequences with more tool_used
 *      events and slower pacing so users can watch thinking bubbles fill.
 *
 * Pattern for each agent:
 *   1. agent_start (agent begins — thinking bubble appears)
 *   2. 2-4 tool_used events (spaced 600-900ms apart) — bubble shows activity
 *   3. finding_posted (conclusion — bubble fades, finding card appears)
 *   4. agent_stop (or continue to next finding)
 *
 * When the session ID starts with "demo-session-", this hook fires
 * a scripted sequence of events so the feed is populated
 * without a live backend.
 */

import { useEffect, useRef } from 'react';
import type { ShemEvent, Severity } from '../../types/events.js';

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

  // Agent 0: Design Reviewer — thinking sequence
  add(400, { type: 'agent_start', agentId: `${a(0)}-1`, role: a(0), task: 'Analyzing document structure and visual hierarchy', timestamp: ts() });
  add(600, { type: 'tool_used', tool: 'read_document', agent: a(0), timestamp: ts() });
  add(700, { type: 'tool_used', tool: 'analyze_heading_structure', agent: a(0), timestamp: ts() });
  add(800, { type: 'tool_used', tool: 'measure_visual_hierarchy', agent: a(0), timestamp: ts() });

  // Agent 1: Ethics Auditor — thinking sequence
  add(400, { type: 'agent_start', agentId: `${a(1)}-1`, role: a(1), task: 'Reviewing ethical compliance and accessibility standards', timestamp: ts() });
  add(600, { type: 'tool_used', tool: 'read_document', agent: a(1), timestamp: ts() });
  add(700, { type: 'tool_used', tool: 'check_wcag_compliance', agent: a(1), timestamp: ts() });
  add(800, { type: 'tool_used', tool: 'run_contrast_check', agent: a(1), timestamp: ts() });

  // Agent 2: Plain Language Specialist — thinking sequence
  add(400, { type: 'agent_start', agentId: `${a(2)}-1`, role: a(2), task: 'Evaluating readability and plain language compliance', timestamp: ts() });
  add(600, { type: 'tool_used', tool: 'read_document', agent: a(2), timestamp: ts() });
  add(700, { type: 'tool_used', tool: 'calculate_readability_score', agent: a(2), timestamp: ts() });
  add(800, { type: 'tool_used', tool: 'measure_sentence_length', agent: a(2), timestamp: ts() });
  add(700, { type: 'tool_used', tool: 'count_passive_voice', agent: a(2), timestamp: ts() });

  add(300, { type: 'cost_update', totalUsd: 0.42, budgetUsd: 10.00, timestamp: ts() });

  // Finding from Agent 0 (thinking bubble fades → finding card appears)
  const f1 = fid();
  add(800, {
    type: 'finding_posted', findingId: f1, agent: a(0),
    category: 'Visual Hierarchy',
    severity: 'YELLOW' as Severity, confidence: 0.87,
    content: 'Heading structure is inconsistent — H2 and H3 levels are swapped in sections 3 and 5, breaking the document outline. Navigation aids (TOC, bookmarks) will misrepresent the document structure.',
    evidence: [
      'Section 3.1 uses H3 "Limitation of Liability" but Section 4.1 uses H2 for equivalent-level "Indemnification"',
      'PDF bookmarks show flat structure — 12 entries at same level instead of nested hierarchy',
    ],
    timestamp: ts(),
  });

  // Finding from Agent 2
  const f2 = fid();
  add(1200, {
    type: 'finding_posted', findingId: f2, agent: a(2),
    category: 'Readability',
    severity: 'RED' as Severity, confidence: 0.93,
    content: 'Flesch-Kincaid grade level 14.2 — exceeds target of Grade 8. Passive voice in 47% of sentences. Average sentence length 34 words (target: 20). The definitions section alone contains three sentences over 80 words.',
    evidence: [
      '"The Provider shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including without limitation, loss of profits, data, use, goodwill, or other intangible losses, resulting from the access to or use of or inability to access or use the Services."',
    ],
    timestamp: ts(),
  });

  add(600, { type: 'agent_stop', agentId: `${a(2)}-1`, role: a(2), durationMs: 3400, timestamp: ts() });

  // Finding from Agent 1
  const f3 = fid();
  add(900, {
    type: 'finding_posted', findingId: f3, agent: a(1),
    category: 'Accessibility',
    severity: 'RED' as Severity, confidence: 0.91,
    content: 'WCAG 2.1 AA compliance gap — body text color contrast ratio is 3.8:1 against the background (minimum required: 4.5:1). Three call-to-action elements fail the 3:1 minimum for large text.',
    evidence: [
      'Body text #767676 on #FFFFFF background — contrast ratio 4.48:1 fails AA for normal text',
      'CTA button #B8860B on #FAF9F6 — contrast ratio 3.2:1 fails AA for text under 18pt',
    ],
    timestamp: ts(),
  });

  add(500, { type: 'agent_stop', agentId: `${a(0)}-1`, role: a(0), durationMs: 4200, timestamp: ts() });
  add(400, { type: 'agent_stop', agentId: `${a(1)}-1`, role: a(1), durationMs: 4800, timestamp: ts() });

  add(200, { type: 'cost_update', totalUsd: 1.28, budgetUsd: 10.00, timestamp: ts() });

  // ── Phase: First Review (Debate) ──
  add(600, { type: 'workflow_step', step: 'debate_1', previousStep: 'parallel_analysis', timestamp: ts() });

  // Challenge on f1
  const c1 = cid();
  add(1000, {
    type: 'challenge_posted', challengeId: c1, challenger: a(1), targetFindingId: f1,
    challengeText: 'The heading inconsistency finding understates the severity. In accessibility testing, broken heading hierarchy is a WCAG 2.1 Level A failure (SC 1.3.1 Info and Relationships), not merely a visual issue. Screen reader users cannot navigate the document at all.',
    evidence: [
      'WCAG 2.1 SC 1.3.1 requires heading levels to convey document structure programmatically',
    ],
    timestamp: ts(),
  });

  const r1 = rid();
  add(1200, {
    type: 'response_posted', responseId: r1, responder: a(0), challengeId: c1, accepted: true,
    responseText: 'Accepted — the accessibility impact was underweighted. Revising severity from YELLOW to RED. The heading structure issue is both a visual design problem and a programmatic accessibility failure.',
    revisedPosition: 'Upgrade to RED severity. Heading restructuring must be completed before any other transformations to establish correct document outline for screen readers.',
    timestamp: ts(),
  });

  add(800, {
    type: 'debate_resolved', resolutionId: resid(), topic: 'Visual hierarchy severity',
    resolution: 'Upgraded to RED — structural issue affects both comprehension and programmatic accessibility.',
    confidence: 0.89,
    winningPosition: 'Ethics auditor\'s accessibility argument prevailed — heading hierarchy is a Level A WCAG failure, not merely cosmetic.',
    evidenceWeight: 'WCAG 2.1 SC 1.3.1 requirement is dispositive. Screen reader navigation testing confirmed complete failure.',
    escalationNeeded: false,
    timestamp: ts(),
  });

  add(400, { type: 'cost_update', totalUsd: 1.85, budgetUsd: 10.00, timestamp: ts() });

  // ── Phase: Ethics Check ──
  add(500, { type: 'workflow_step', step: 'ethics_gate', previousStep: 'debate_1', timestamp: ts() });

  add(800, { type: 'gate_requested', gateType: 'ethics_critical', summary: 'Accessibility violations require human review', details: 'Three RED findings related to WCAG 2.1 AA compliance, readability levels above target grade, and heading structure. These affect document accessibility for users with disabilities and low literacy.', timestamp: ts() });

  // Auto-decide gate after a pause
  add(2500, { type: 'gate_decided', gateType: 'ethics_critical', decision: 'approve', notes: 'Proceed with remediation', timestamp: ts() });

  // ── Phase: Transformation ──
  add(400, { type: 'workflow_step', step: 'transformation', previousStep: 'ethics_gate', timestamp: ts() });

  // Agent 3: Transformation Specialist — thinking sequence
  add(400, { type: 'agent_start', agentId: `${a(3 % agents.length)}-1`, role: a(3 % agents.length), task: 'Restructuring document with improved visual hierarchy', timestamp: ts() });
  add(700, { type: 'tool_used', tool: 'read_document', agent: a(3 % agents.length), timestamp: ts() });
  add(800, { type: 'tool_used', tool: 'restructure_heading_tree', agent: a(3 % agents.length), timestamp: ts() });
  add(700, { type: 'tool_used', tool: 'rebuild_pdf_bookmarks', agent: a(3 % agents.length), timestamp: ts() });

  // Agent 2 (again): Rewriting — thinking sequence
  add(300, { type: 'agent_start', agentId: `${a(2)}-2`, role: a(2), task: 'Rewriting content to Grade 8 reading level', timestamp: ts() });
  add(700, { type: 'tool_used', tool: 'simplify_sentence_structure', agent: a(2), timestamp: ts() });
  add(800, { type: 'tool_used', tool: 'convert_passive_to_active', agent: a(2), timestamp: ts() });
  add(700, { type: 'tool_used', tool: 'split_compound_sentences', agent: a(2), timestamp: ts() });

  add(400, { type: 'cost_update', totalUsd: 2.94, budgetUsd: 10.00, timestamp: ts() });

  // Quality check — fail first attempt
  add(1000, {
    type: 'quality_check_result',
    step: 'transformation',
    passed: false,
    score: 0.62,
    iteration: 1,
    failureReasons: [
      'Three passive voice constructions remain in the indemnification clause',
      'Section 5.2 sentence length averages 28 words — still above 20-word target',
    ],
    revisionGuidance: [
      'Convert "shall be indemnified by" to active voice: "Provider shall indemnify"',
      'Split compound sentences in Section 5.2 at conjunction points',
    ],
    timestamp: ts(),
  });

  // Tools for revision
  add(700, { type: 'tool_used', tool: 'apply_revision_guidance', agent: a(2), timestamp: ts() });
  add(800, { type: 'tool_used', tool: 'recalculate_readability', agent: a(2), timestamp: ts() });

  // Quality check — pass second attempt
  add(700, {
    type: 'quality_check_result',
    step: 'transformation',
    passed: true,
    score: 0.91,
    iteration: 2,
    failureReasons: [],
    revisionGuidance: [],
    timestamp: ts(),
  });

  const f4 = fid();
  add(1000, {
    type: 'finding_posted', findingId: f4, agent: a(3 % agents.length),
    category: 'Structure',
    severity: 'GREEN' as Severity, confidence: 0.95,
    content: 'New heading structure applied — 3 levels, consistent H1/H2/H3 nesting throughout. PDF bookmarks now show correct nested hierarchy. Flesch-Kincaid reduced to Grade 7.8.',
    evidence: [
      'Automated outline check: 0 violations (was: 7)',
      'Readability score improved from 14.2 to 7.8 — below Grade 8 target',
    ],
    timestamp: ts(),
  });

  add(800, { type: 'agent_stop', agentId: `${a(3 % agents.length)}-1`, role: a(3 % agents.length), durationMs: 5800, timestamp: ts() });
  add(600, { type: 'agent_stop', agentId: `${a(2)}-2`, role: a(2), durationMs: 6200, timestamp: ts() });

  // ── Phase: Verification ──
  add(400, { type: 'workflow_step', step: 'parallel_verification', previousStep: 'transformation', timestamp: ts() });

  add(600, { type: 'verification_run', verificationId: vid(), verificationType: 'readability', passed: true, confidence: 0.92, timestamp: ts() });
  add(500, { type: 'verification_run', verificationId: vid(), verificationType: 'accessibility', passed: true, confidence: 0.88, timestamp: ts() });
  add(400, { type: 'verification_run', verificationId: vid(), verificationType: 'legal-accuracy', passed: true, confidence: 0.94, timestamp: ts() });

  add(200, { type: 'cost_update', totalUsd: 3.67, budgetUsd: 10.00, timestamp: ts() });

  // ── Phase: Second Review ──
  add(400, { type: 'workflow_step', step: 'debate_2', previousStep: 'parallel_verification', timestamp: ts() });

  add(1000, {
    type: 'debate_resolved', resolutionId: resid(), topic: 'Transformation quality',
    resolution: 'All verification checks passed. Document meets readability, accessibility, and accuracy targets.',
    confidence: 0.93,
    winningPosition: 'Transformation specialist\'s restructuring and plain language rewrite both validated by cross-verification.',
    evidenceWeight: 'Three independent verification checks (readability, accessibility, legal-accuracy) all passed with >88% confidence.',
    escalationNeeded: false,
    timestamp: ts(),
  });

  // ── Phase: Meaning Check ──
  add(400, { type: 'workflow_step', step: 'meaning_gate', previousStep: 'debate_2', timestamp: ts() });

  // Agent 4: Meaning Guardian — thinking sequence
  add(400, { type: 'agent_start', agentId: `${a(4 % agents.length)}-1`, role: a(4 % agents.length), task: 'Verifying legal meaning preserved after transformation', timestamp: ts() });
  add(700, { type: 'tool_used', tool: 'read_document', agent: a(4 % agents.length), timestamp: ts() });
  add(800, { type: 'tool_used', tool: 'semantic_diff', agent: a(4 % agents.length), timestamp: ts() });
  add(700, { type: 'tool_used', tool: 'clause_comparison', agent: a(4 % agents.length), timestamp: ts() });
  add(800, { type: 'tool_used', tool: 'defined_term_consistency_check', agent: a(4 % agents.length), timestamp: ts() });

  const f5 = fid();
  add(800, {
    type: 'finding_posted', findingId: f5, agent: a(4 % agents.length),
    category: 'Meaning Preservation',
    severity: 'GREEN' as Severity, confidence: 0.96,
    content: 'Legal meaning fully preserved — no semantic drift detected. All obligations, rights, conditions, and definitions map 1:1 between source and transformed document. Defined terms used consistently.',
    evidence: [
      'Clause-by-clause comparison: 47/47 clauses semantically equivalent',
      'Defined terms: 23/23 consistent usage, no orphaned or conflicting definitions',
    ],
    timestamp: ts(),
  });

  add(600, { type: 'agent_stop', agentId: `${a(4 % agents.length)}-1`, role: a(4 % agents.length), durationMs: 2100, timestamp: ts() });

  add(200, { type: 'cost_update', totalUsd: 4.12, budgetUsd: 10.00, timestamp: ts() });

  // ── Phase: Synthesis ──
  add(400, { type: 'workflow_step', step: 'synthesis', previousStep: 'meaning_gate', timestamp: ts() });

  // Agent 5: Synthesis Editor — thinking sequence
  add(400, { type: 'agent_start', agentId: `${a(5 % agents.length)}-1`, role: a(5 % agents.length), task: 'Compiling final document with all revisions', timestamp: ts() });
  add(700, { type: 'tool_used', tool: 'read_document', agent: a(5 % agents.length), timestamp: ts() });
  add(800, { type: 'tool_used', tool: 'merge_revision_layers', agent: a(5 % agents.length), timestamp: ts() });
  add(700, { type: 'tool_used', tool: 'generate_change_log', agent: a(5 % agents.length), timestamp: ts() });
  add(600, { type: 'agent_stop', agentId: `${a(5 % agents.length)}-1`, role: a(5 % agents.length), durationMs: 1800, timestamp: ts() });

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
  }, [sessionId, teamRoles.join(','), onEvent]); // eslint-disable-line react-hooks/exhaustive-deps
}
