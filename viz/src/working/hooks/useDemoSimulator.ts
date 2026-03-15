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

import { useEffect, useRef, useCallback } from 'react';
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

// ── HeartConnect ToS Demo ─────────────────────────────────────────────
// A VC-demo-ready scripted scenario: drafting Terms of Service for
// HeartConnect, an online dating platform.

function buildHeartConnectDemoScript(): Array<{ delayMs: number; event: ShemEvent }> {
  let findingCounter = 0;
  let challengeCounter = 0;
  let responseCounter = 0;
  let resolutionCounter = 0;
  let verificationCounter = 0;

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

  // ── Session start ──
  add(0, { type: 'session_start', sessionId: 'demo-heartconnect', document: 'HeartConnect — Terms of Service (Draft)', timestamp: ts() });
  add(100, { type: 'cost_update', totalUsd: 0.00, budgetUsd: 12.00, timestamp: ts() });

  // ── Phase: Analysis ──
  add(500, { type: 'workflow_step', step: 'parallel_analysis', previousStep: 'intake', timestamp: ts() });

  // Privacy Counsel — analyzing data collection practices
  add(400, { type: 'agent_start', agentId: 'privacy-counsel-1', role: 'privacy-counsel', task: 'Analyzing data collection, processing, and cross-border transfer provisions for dating platform', timestamp: ts() });
  add(600, { type: 'tool_used', tool: 'read_document', agent: 'privacy-counsel', timestamp: ts() });
  add(700, { type: 'tool_used', tool: 'search_knowledge_base', agent: 'privacy-counsel', timestamp: ts() });
  add(800, { type: 'tool_used', tool: 'map_data_processing_activities', agent: 'privacy-counsel', timestamp: ts() });
  add(700, { type: 'tool_used', tool: 'check_gdpr_lawful_basis', agent: 'privacy-counsel', timestamp: ts() });

  // Regulatory Counsel — platform compliance
  add(300, { type: 'agent_start', agentId: 'regulatory-counsel-1', role: 'regulatory-counsel', task: 'Reviewing age verification, content moderation, and platform liability requirements', timestamp: ts() });
  add(600, { type: 'tool_used', tool: 'read_document', agent: 'regulatory-counsel', timestamp: ts() });
  add(700, { type: 'tool_used', tool: 'search_knowledge_base', agent: 'regulatory-counsel', timestamp: ts() });
  add(800, { type: 'tool_used', tool: 'check_regulatory_requirements', agent: 'regulatory-counsel', timestamp: ts() });

  // Plain Language Specialist — readability for consumer audience
  add(200, { type: 'agent_start', agentId: 'plain-language-specialist-1', role: 'plain-language-specialist', task: 'Evaluating ToS readability for consumer dating platform audience', timestamp: ts() });
  add(600, { type: 'tool_used', tool: 'read_document', agent: 'plain-language-specialist', timestamp: ts() });
  add(800, { type: 'tool_used', tool: 'calculate_readability_score', agent: 'plain-language-specialist', timestamp: ts() });
  add(700, { type: 'tool_used', tool: 'measure_sentence_length', agent: 'plain-language-specialist', timestamp: ts() });

  // Ethics Auditor — safety and fairness
  add(200, { type: 'agent_start', agentId: 'ethics-auditor-1', role: 'ethics-auditor', task: 'Reviewing user safety provisions, algorithmic transparency, and anti-discrimination protections', timestamp: ts() });
  add(600, { type: 'tool_used', tool: 'read_document', agent: 'ethics-auditor', timestamp: ts() });
  add(700, { type: 'tool_used', tool: 'check_algorithmic_fairness', agent: 'ethics-auditor', timestamp: ts() });
  add(800, { type: 'tool_used', tool: 'review_safety_mechanisms', agent: 'ethics-auditor', timestamp: ts() });

  add(300, { type: 'cost_update', totalUsd: 0.68, budgetUsd: 12.00, timestamp: ts() });

  // ── Findings from analysis ──

  const f1 = fid();
  add(800, {
    type: 'finding_posted', findingId: f1, agent: 'privacy-counsel',
    category: 'Data Protection',
    severity: 'RED' as Severity, confidence: 0.95,
    content: 'Critical gap: ToS draft lacks lawful basis specification for location data processing. Dating apps collect precise geolocation for proximity matching — this requires explicit consent under GDPR Art. 6(1)(a) and must be separated from general ToS acceptance. Current draft bundles all consent into a single acceptance checkbox.',
    evidence: [
      'Section 4.1 states "by using the Service you consent to our data practices" — invalid bundled consent under GDPR',
      'No separate consent mechanism for location data, biometric data (photo verification), or behavioral profiling',
    ],
    timestamp: ts(),
  });

  const f2 = fid();
  add(1000, {
    type: 'finding_posted', findingId: f2, agent: 'regulatory-counsel',
    category: 'Age Verification',
    severity: 'RED' as Severity, confidence: 0.92,
    content: 'Age verification provision is legally insufficient. Current draft relies on self-declaration ("I confirm I am 18+") which fails to meet the UK Online Safety Act 2023 and EU Digital Services Act requirements for services likely to be accessed by minors. Dating platforms require robust age assurance measures.',
    evidence: [
      'Section 2.3 "Eligibility" relies solely on user self-declaration of age',
      'No reference to age estimation technology, ID verification, or third-party age assurance providers',
    ],
    timestamp: ts(),
  });

  add(600, { type: 'agent_stop', agentId: 'privacy-counsel-1', role: 'privacy-counsel', durationMs: 5200, timestamp: ts() });

  const f3 = fid();
  add(900, {
    type: 'finding_posted', findingId: f3, agent: 'ethics-auditor',
    category: 'Algorithmic Transparency',
    severity: 'YELLOW' as Severity, confidence: 0.88,
    content: 'The matching algorithm section lacks transparency required by the EU AI Act for AI systems affecting personal relationships. Users are not informed about what factors influence their match recommendations, whether protected characteristics are used, or how to contest algorithmic decisions.',
    evidence: [
      'Section 7 "Our Matching Technology" provides no explanation of ranking factors or recommendation logic',
      'No opt-out mechanism for algorithmic profiling as required by GDPR Art. 22',
    ],
    timestamp: ts(),
  });

  const f4 = fid();
  add(800, {
    type: 'finding_posted', findingId: f4, agent: 'plain-language-specialist',
    category: 'Readability',
    severity: 'YELLOW' as Severity, confidence: 0.91,
    content: 'Flesch-Kincaid grade level 16.8 — far above recommended Grade 8 for consumer-facing ToS. The average HeartConnect user will not understand their rights. Safety-critical sections (reporting abuse, blocking users, emergency contacts) are buried in dense legalese.',
    evidence: [
      'Section 9 "Safety" averages 42 words per sentence with 3+ subordinate clauses',
      'The "How to Report" instructions are embedded mid-paragraph in the liability section',
    ],
    timestamp: ts(),
  });

  add(400, { type: 'agent_stop', agentId: 'regulatory-counsel-1', role: 'regulatory-counsel', durationMs: 6100, timestamp: ts() });
  add(300, { type: 'agent_stop', agentId: 'plain-language-specialist-1', role: 'plain-language-specialist', durationMs: 5800, timestamp: ts() });

  const f5 = fid();
  add(700, {
    type: 'finding_posted', findingId: f5, agent: 'ethics-auditor',
    category: 'User Safety',
    severity: 'RED' as Severity, confidence: 0.94,
    content: 'User safety provisions are critically inadequate for a dating platform. No mention of: in-app emergency reporting, photo verification to prevent catfishing, block/unmatch functionality, or cooperation with law enforcement for harassment cases. The limitation of liability clause attempts to disclaim responsibility for user-to-user interactions entirely.',
    evidence: [
      'Section 11.2 "HeartConnect is not responsible for the conduct of any user on or off the Service"',
      'No safety features described anywhere in the draft — no block, report, or emergency contact provisions',
    ],
    timestamp: ts(),
  });

  add(400, { type: 'agent_stop', agentId: 'ethics-auditor-1', role: 'ethics-auditor', durationMs: 7200, timestamp: ts() });

  add(200, { type: 'cost_update', totalUsd: 1.94, budgetUsd: 12.00, timestamp: ts() });

  // ── Phase: Debate ──
  add(600, { type: 'workflow_step', step: 'debate_1', previousStep: 'parallel_analysis', timestamp: ts() });

  // Challenge: Privacy vs Regulatory on age verification
  const c1 = cid();
  add(1000, {
    type: 'challenge_posted', challengeId: c1, challenger: 'privacy-counsel', targetFindingId: f2,
    challengeText: 'The age verification finding should also address the privacy paradox: robust age verification (ID scanning, biometrics) creates significant data protection risks. We need to recommend privacy-preserving age assurance methods — not just "verify harder." Zero-knowledge proof systems or age estimation without data retention should be specified.',
    evidence: [
      'ICO Age Assurance Guidance (2023) recommends privacy-preserving methods over document scanning',
      'GDPR data minimisation principle (Art. 5(1)(c)) requires the least intrusive age check that achieves the purpose',
    ],
    timestamp: ts(),
  });

  const r1 = rid();
  add(1200, {
    type: 'response_posted', responseId: r1, responder: 'regulatory-counsel', challengeId: c1, accepted: true,
    responseText: 'Excellent point. Revised recommendation: specify tiered age assurance in the ToS. First layer: AI-based age estimation (no data retained). Second layer: third-party age verification service (data minimised). Explicit prohibition on storing ID documents beyond verification completion.',
    revisedPosition: 'ToS must specify privacy-preserving age assurance with tiered approach. Add dedicated "Age Verification & Your Privacy" section with clear data retention limits.',
    timestamp: ts(),
  });

  add(800, {
    type: 'debate_resolved', resolutionId: resid(), topic: 'Age verification vs privacy balance',
    resolution: 'Adopted tiered age assurance approach. ToS will specify privacy-preserving methods first, with escalation to ID verification only when necessary. All verification data deleted within 24 hours of completion.',
    confidence: 0.93,
    winningPosition: 'Privacy counsel\'s challenge refined the regulatory approach — both compliance and data protection are served by tiered assurance.',
    evidenceWeight: 'ICO guidance and GDPR data minimisation principle both support privacy-preserving age assurance over blanket ID collection.',
    escalationNeeded: false,
    timestamp: ts(),
  });

  // Challenge: Ethics vs Plain Language on safety section
  const c2 = cid();
  add(900, {
    type: 'challenge_posted', challengeId: c2, challenger: 'ethics-auditor', targetFindingId: f4,
    challengeText: 'Readability is not just a usability issue here — it is a safety issue. If users cannot quickly find how to report harassment or block a threatening user, the ToS design directly endangers them. The safety reporting instructions must be the most accessible part of the entire document, not just "improved readability."',
    evidence: [
      'UK Domestic Abuse Act 2021 imposes duty on platforms to provide accessible safety mechanisms',
      'Match Group (Tinder parent) places safety instructions in a dedicated section with visual callouts — industry best practice',
    ],
    timestamp: ts(),
  });

  const r2 = rid();
  add(1100, {
    type: 'response_posted', responseId: r2, responder: 'plain-language-specialist', challengeId: c2, accepted: true,
    responseText: 'Agreed — safety sections should be redesigned as a standalone "Your Safety" quick-reference card at the top of the ToS, with icons, short sentences, and direct action links. Maximum Grade 5 reading level for safety content specifically.',
    revisedPosition: 'Create a dedicated "Your Safety" section with visual callouts, icons, and maximum Grade 5 reading level. Place it before all legal provisions. Include direct links to report, block, and emergency contact features.',
    timestamp: ts(),
  });

  add(700, {
    type: 'debate_resolved', resolutionId: resid(), topic: 'Safety section accessibility',
    resolution: 'Safety instructions elevated to standalone quick-reference section at the top of the ToS. Grade 5 reading level with visual callouts. Direct action links for report, block, and emergency contacts.',
    confidence: 0.96,
    winningPosition: 'Ethics auditor\'s framing that readability = safety in dating context was decisive. Plain language specialist refined the implementation approach.',
    evidenceWeight: 'Industry practice (Match Group), UK Domestic Abuse Act duty, and user safety principles all support a dedicated, highly accessible safety section.',
    escalationNeeded: false,
    timestamp: ts(),
  });

  add(400, { type: 'cost_update', totalUsd: 3.12, budgetUsd: 12.00, timestamp: ts() });

  // ── Phase: Ethics Gate ──
  add(500, { type: 'workflow_step', step: 'ethics_gate', previousStep: 'debate_1', timestamp: ts() });

  add(800, { type: 'gate_requested', gateType: 'ethics_critical', summary: 'Critical user safety and privacy findings require human review', details: 'Three RED findings: (1) bundled consent violates GDPR for location/biometric data, (2) age verification legally insufficient under UK OSA and EU DSA, (3) no user safety mechanisms described. Proceeding to draft transformations that address all findings.', timestamp: ts() });

  add(3000, { type: 'gate_decided', gateType: 'ethics_critical', decision: 'approve', notes: 'Approved — proceed with all recommended safety and privacy improvements', timestamp: ts() });

  // ── Phase: Transformation ──
  add(400, { type: 'workflow_step', step: 'transformation', previousStep: 'ethics_gate', timestamp: ts() });

  // Design Reviewer — restructuring the ToS
  add(400, { type: 'agent_start', agentId: 'design-reviewer-1', role: 'design-reviewer', task: 'Restructuring ToS with safety-first architecture and layered consent design', timestamp: ts() });
  add(700, { type: 'tool_used', tool: 'read_document', agent: 'design-reviewer', timestamp: ts() });
  add(800, { type: 'tool_used', tool: 'create_document_architecture', agent: 'design-reviewer', timestamp: ts() });
  add(700, { type: 'tool_used', tool: 'design_consent_layers', agent: 'design-reviewer', timestamp: ts() });
  add(800, { type: 'tool_used', tool: 'build_safety_quick_reference', agent: 'design-reviewer', timestamp: ts() });

  // Privacy Counsel — rewriting data sections
  add(300, { type: 'agent_start', agentId: 'privacy-counsel-2', role: 'privacy-counsel', task: 'Drafting granular consent mechanisms and data processing disclosures', timestamp: ts() });
  add(700, { type: 'tool_used', tool: 'draft_consent_matrix', agent: 'privacy-counsel', timestamp: ts() });
  add(800, { type: 'tool_used', tool: 'write_data_retention_schedule', agent: 'privacy-counsel', timestamp: ts() });
  add(700, { type: 'tool_used', tool: 'draft_dsar_procedure', agent: 'privacy-counsel', timestamp: ts() });

  // Plain Language Specialist — rewriting for accessibility
  add(200, { type: 'agent_start', agentId: 'plain-language-specialist-2', role: 'plain-language-specialist', task: 'Rewriting all sections to Grade 8 target, safety sections to Grade 5', timestamp: ts() });
  add(700, { type: 'tool_used', tool: 'simplify_sentence_structure', agent: 'plain-language-specialist', timestamp: ts() });
  add(800, { type: 'tool_used', tool: 'convert_passive_to_active', agent: 'plain-language-specialist', timestamp: ts() });
  add(700, { type: 'tool_used', tool: 'create_plain_language_summary', agent: 'plain-language-specialist', timestamp: ts() });

  add(400, { type: 'cost_update', totalUsd: 4.85, budgetUsd: 12.00, timestamp: ts() });

  // Quality check — first attempt
  add(1000, {
    type: 'quality_check_result',
    step: 'transformation',
    passed: false,
    score: 0.71,
    iteration: 1,
    failureReasons: [
      'Consent flow for location data still references "legitimate interest" — must be explicit consent for dating app geolocation',
      'Safety quick-reference card reads at Grade 7 — target is Grade 5',
      'Age verification section lacks specific mention of data deletion timeline',
    ],
    revisionGuidance: [
      'Replace all location data lawful basis references with explicit consent (Art. 6(1)(a))',
      'Simplify safety card: maximum 15 words per sentence, active voice only',
      'Add "Your verification data is deleted within 24 hours" to age assurance section',
    ],
    timestamp: ts(),
  });

  add(700, { type: 'tool_used', tool: 'apply_revision_guidance', agent: 'privacy-counsel', timestamp: ts() });
  add(800, { type: 'tool_used', tool: 'recalculate_readability', agent: 'plain-language-specialist', timestamp: ts() });
  add(600, { type: 'tool_used', tool: 'verify_consent_mechanisms', agent: 'privacy-counsel', timestamp: ts() });

  // Quality check — pass
  add(700, {
    type: 'quality_check_result',
    step: 'transformation',
    passed: true,
    score: 0.94,
    iteration: 2,
    failureReasons: [],
    revisionGuidance: [],
    timestamp: ts(),
  });

  const f6 = fid();
  add(1000, {
    type: 'finding_posted', findingId: f6, agent: 'design-reviewer',
    category: 'Document Architecture',
    severity: 'GREEN' as Severity, confidence: 0.96,
    content: 'ToS restructured with safety-first architecture: (1) Your Safety quick-reference card, (2) Plain-language summary, (3) Consent dashboard with granular toggles, (4) Full legal terms. Each section independently navigable. Safety card reads at Grade 4.8. Overall document Grade 7.6.',
    evidence: [
      'Safety card: 6 sections, average 12 words per sentence, all active voice',
      'Consent dashboard: 5 separate consent categories (location, photos, matching, notifications, analytics) each with toggle + explanation',
    ],
    timestamp: ts(),
  });

  add(800, { type: 'agent_stop', agentId: 'design-reviewer-1', role: 'design-reviewer', durationMs: 7200, timestamp: ts() });
  add(400, { type: 'agent_stop', agentId: 'privacy-counsel-2', role: 'privacy-counsel', durationMs: 6800, timestamp: ts() });
  add(300, { type: 'agent_stop', agentId: 'plain-language-specialist-2', role: 'plain-language-specialist', durationMs: 6400, timestamp: ts() });

  // ── Phase: Verification ──
  add(400, { type: 'workflow_step', step: 'parallel_verification', previousStep: 'transformation', timestamp: ts() });

  add(600, { type: 'verification_run', verificationId: vid(), verificationType: 'readability', passed: true, confidence: 0.94, timestamp: ts() });
  add(500, { type: 'verification_run', verificationId: vid(), verificationType: 'gdpr-compliance', passed: true, confidence: 0.91, timestamp: ts() });
  add(400, { type: 'verification_run', verificationId: vid(), verificationType: 'dsa-compliance', passed: true, confidence: 0.89, timestamp: ts() });
  add(500, { type: 'verification_run', verificationId: vid(), verificationType: 'legal-accuracy', passed: true, confidence: 0.93, timestamp: ts() });
  add(400, { type: 'verification_run', verificationId: vid(), verificationType: 'safety-mechanisms', passed: true, confidence: 0.96, timestamp: ts() });

  add(200, { type: 'cost_update', totalUsd: 6.23, budgetUsd: 12.00, timestamp: ts() });

  // ── Phase: Second Review ──
  add(400, { type: 'workflow_step', step: 'debate_2', previousStep: 'parallel_verification', timestamp: ts() });

  add(1000, {
    type: 'debate_resolved', resolutionId: resid(), topic: 'Transformation quality and compliance',
    resolution: 'All five verification checks passed. GDPR consent mechanisms validated, DSA compliance confirmed, safety provisions meet industry standards. Document readability dramatically improved.',
    confidence: 0.94,
    winningPosition: 'Cross-functional team approach validated — privacy, regulatory, safety, and readability concerns all addressed in integrated design.',
    evidenceWeight: 'Five independent verification passes (readability, GDPR, DSA, legal accuracy, safety) all passed with >89% confidence.',
    escalationNeeded: false,
    timestamp: ts(),
  });

  // ── Phase: Meaning Check ──
  add(400, { type: 'workflow_step', step: 'meaning_gate', previousStep: 'debate_2', timestamp: ts() });

  add(400, { type: 'agent_start', agentId: 'contract-reviewer-1', role: 'contract-reviewer', task: 'Verifying all legal obligations preserved in simplified ToS', timestamp: ts() });
  add(700, { type: 'tool_used', tool: 'read_document', agent: 'contract-reviewer', timestamp: ts() });
  add(800, { type: 'tool_used', tool: 'semantic_diff', agent: 'contract-reviewer', timestamp: ts() });
  add(700, { type: 'tool_used', tool: 'clause_comparison', agent: 'contract-reviewer', timestamp: ts() });
  add(800, { type: 'tool_used', tool: 'verify_defined_terms', agent: 'contract-reviewer', timestamp: ts() });

  const f7 = fid();
  add(800, {
    type: 'finding_posted', findingId: f7, agent: 'contract-reviewer',
    category: 'Meaning Preservation',
    severity: 'GREEN' as Severity, confidence: 0.97,
    content: 'Legal meaning fully preserved across all 34 clauses. Simplified language introduces no ambiguity. New provisions (safety mechanisms, granular consent, age assurance) are legally sound additions that strengthen HeartConnect\'s position. Defined terms consistent throughout.',
    evidence: [
      'Clause-by-clause comparison: 34/34 original obligations preserved',
      '12 new provisions added (safety, consent, age assurance) — all legally valid and properly cross-referenced',
    ],
    timestamp: ts(),
  });

  add(600, { type: 'agent_stop', agentId: 'contract-reviewer-1', role: 'contract-reviewer', durationMs: 3200, timestamp: ts() });
  add(200, { type: 'cost_update', totalUsd: 7.14, budgetUsd: 12.00, timestamp: ts() });

  // ── Phase: Synthesis ──
  add(400, { type: 'workflow_step', step: 'synthesis', previousStep: 'meaning_gate', timestamp: ts() });

  add(400, { type: 'agent_start', agentId: 'synthesis-editor-1', role: 'synthesis-editor', task: 'Compiling final HeartConnect ToS with all revisions and design improvements', timestamp: ts() });
  add(700, { type: 'tool_used', tool: 'merge_revision_layers', agent: 'synthesis-editor', timestamp: ts() });
  add(800, { type: 'tool_used', tool: 'generate_change_log', agent: 'synthesis-editor', timestamp: ts() });
  add(700, { type: 'tool_used', tool: 'compile_legal_review_package', agent: 'synthesis-editor', timestamp: ts() });
  add(600, { type: 'agent_stop', agentId: 'synthesis-editor-1', role: 'synthesis-editor', durationMs: 2400, timestamp: ts() });

  add(200, { type: 'cost_update', totalUsd: 7.82, budgetUsd: 12.00, timestamp: ts() });

  // ── Phase: Final Approval ──
  add(400, { type: 'workflow_step', step: 'final_gate', previousStep: 'synthesis', timestamp: ts() });

  add(600, { type: 'gate_requested', gateType: 'final_delivery', summary: 'HeartConnect ToS ready for delivery', details: 'Complete Terms of Service for HeartConnect dating platform. Includes: safety-first architecture, granular GDPR consent dashboard, privacy-preserving age assurance, algorithmic transparency section, Grade 7.6 readability (Grade 4.8 for safety content). All 5 verification checks passed. Legal meaning preserved across 34 original clauses + 12 new provisions.', timestamp: ts() });

  add(3000, { type: 'gate_decided', gateType: 'final_delivery', decision: 'approve', timestamp: ts() });

  // ── Delivered ──
  add(400, { type: 'workflow_step', step: 'delivered', previousStep: 'final_gate', timestamp: ts() });
  add(200, { type: 'cost_update', totalUsd: 7.82, budgetUsd: 12.00, timestamp: ts() });
  add(500, { type: 'session_end', sessionId: 'demo-heartconnect', totalCost: 7.82, duration: delay, timestamp: ts() });

  return script;
}

export function useDemoSimulator({ sessionId, teamRoles, onEvent }: DemoSimulatorOptions) {
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  // Stable ref for onEvent to avoid restarting demo when callback identity changes
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    // Clean up previous timers
    for (const t of timersRef.current) clearTimeout(t);
    timersRef.current = [];

    if (!sessionId?.startsWith('demo-session-')) return;

    const script = sessionId.includes('heartconnect')
      ? buildHeartConnectDemoScript()
      : buildDemoScript(teamRoles);

    for (const { delayMs, event } of script) {
      const timer = setTimeout(() => {
        onEventRef.current(event);
      }, delayMs);
      timersRef.current.push(timer);
    }

    return () => {
      for (const t of timersRef.current) clearTimeout(t);
      timersRef.current = [];
    };
  }, [sessionId, JSON.stringify(teamRoles)]); // eslint-disable-line react-hooks/exhaustive-deps
}
