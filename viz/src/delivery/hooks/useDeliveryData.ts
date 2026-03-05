/**
 * useDeliveryData — Fetches session results for the delivery screen.
 *
 * v12: Added finalOutput, debateResolutions, gateDecisions, verificationChecks.
 *      Removed confidence percentages from verification — legal work isn't scored 0-100.
 * v13: Added polling (3s) until session completes. Mapped real dimensions, keyChanges,
 *      and narrative from backend data instead of hardcoded empty arrays.
 *
 * Real mode:  GET /api/sessions/:id with polling until complete
 * Demo mode:  Returns rich static data when sessionId starts with "demo-session-"
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { validateDeliverable } from '../utils/validateDeliverable.js';

// ── Public types ─────────────────────────────────────────────────────────

export interface DimensionScore {
  dimension: string;
  before: number;
  after: number;
  delta: number;
}

export interface KeyChange {
  title: string;
  before: string;
  after: string;
}

export interface NarrativeSection {
  phase: string;
  heading: string;
  body: string;
  agents: string[];
  highlight?: string;
}

export interface AgentPerf {
  name: string;
  role: string;
  findingsPosted: number;
  challengesSurvived: number;
  avgConfidence: number;
}

export interface NextStepItem {
  label: string;
  description: string;
  kind: 'action' | 'watchout' | 'schedule';
}

export interface DebateResolutionRecord {
  topic: string;
  resolution: string;
  winningPosition: string;
  evidenceWeight: string;
  escalationNeeded: boolean;
}

export interface GateDecisionRecord {
  gateType: string;
  decision: string;
  summary?: string;
}

export interface VerificationCheck {
  type: string;
  passed: boolean;
  label: string;
}

export interface DeliveryData {
  sessionId: string;
  status: string;

  // Tab 1: The Work
  documentTitle: string;
  executiveSummary: string;
  keyChanges: KeyChange[];
  dimensions: DimensionScore[];
  finalOutput: string;

  // Tab 2: The Review
  debateResolutions: DebateResolutionRecord[];
  gateDecisions: GateDecisionRecord[];
  verificationChecks: VerificationCheck[];

  // Tab 3: The Story
  narrative: NarrativeSection[];

  // Tab 4: The Scorecard
  debate: { findingsCount: number; challengesCount: number; resolutionsCount: number; unresolvedCount: number };
  verification: {
    resultsCount: number;
    passed: number;
    failed: number;
    confidence: number;
    breakdown?: Array<{ type: 'self' | 'cross' | 'score'; passed: boolean; confidence: number; label: string }>;
  };
  cost: { accumulated: number; budget: number; remaining: number };
  agentPerformance: AgentPerf[];
  eventCount: number;

  // Limitations & transparency
  limitations?: {
    flaggedForHumanReview: string[];
    confidenceIntervals: string;
    disclaimer: string;
  };

  // Tab 5: Next Steps
  nextSteps: NextStepItem[];
}

// ── Hook ──────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 3_000;
const MAX_POLL_DURATION_MS = 5 * 60 * 1_000;

export type AssemblyStatus = 'polling' | 'ready' | 'timeout' | 'error';

export function useDeliveryData(): {
  data: DeliveryData | null;
  loading: boolean;
  error: string | null;
  assemblyStatus: AssemblyStatus;
  retryAssembly: () => Promise<void>;
} {
  const [data, setData] = useState<DeliveryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assemblyStatus, setAssemblyStatus] = useState<AssemblyStatus>('polling');
  const cancelledRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const startTimeRef = useRef(Date.now());

  const fetchSession = useCallback(async (sessionId: string, startTime: number) => {
    if (cancelledRef.current) return;

    try {
      const res = await fetch(`/api/sessions/${sessionId}`, { credentials: 'include' });

      // Active session not found — try archive
      if (res.status === 404) {
        const archiveRes = await fetch(`/api/sessions/archive/${sessionId}`, { credentials: 'include' });
        if (archiveRes.ok) {
          const raw = await archiveRes.json();
          if (cancelledRef.current) return;
          setData(mapArchiveResponse(sessionId, raw));
          setLoading(false);
          setAssemblyStatus('ready');
          return; // No polling for archived sessions
        }
        throw new Error('Session not found');
      }

      if (!res.ok) throw new Error('Failed to fetch session');
      const raw = await res.json();
      if (cancelledRef.current) return;

      const mapped = mapApiResponse(sessionId, raw);
      setData(mapped);
      setLoading(false);

      // Keep polling if not complete OR if complete but document assembly hasn't
      // finished yet. Assembly runs AFTER the workflow reaches 'delivered' and takes
      // ~30 seconds — without this check the frontend stops polling before
      // assembledDocument is available, showing the "assembly not completed" warning.
      const deliverableValid = validateDeliverable(mapped.finalOutput).valid;
      const assemblyPending = mapped.status === 'Complete' && !deliverableValid;
      const elapsed = Date.now() - startTime;

      if (deliverableValid) {
        setAssemblyStatus('ready');
      } else if (mapped.status === 'Complete' && elapsed >= MAX_POLL_DURATION_MS) {
        setAssemblyStatus('timeout');
      } else if (mapped.status === 'Complete') {
        setAssemblyStatus('polling');
      }

      if ((mapped.status !== 'Complete' || assemblyPending) && elapsed < MAX_POLL_DURATION_MS) {
        timerRef.current = setTimeout(() => fetchSession(sessionId, startTime), POLL_INTERVAL_MS);
      }
    } catch (err) {
      if (cancelledRef.current) return;
      setError(err instanceof Error ? err.message : 'Unknown error');
      setLoading(false);
    }
  }, []);

  const retryAssembly = useCallback(async () => {
    const sessionId = sessionStorage.getItem('shem-session-id');
    if (!sessionId) return;

    setAssemblyStatus('polling');

    try {
      const res = await fetch(`/api/sessions/${sessionId}/reassemble`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Unknown error' }));
        console.error('[Retry] Reassembly failed:', body);
        setAssemblyStatus('error');
        return;
      }

      // Reset polling — give it another 5 minutes to pick up the new assembly
      startTimeRef.current = Date.now();
      fetchSession(sessionId, startTimeRef.current);
    } catch {
      console.error('[Retry] Could not reach server');
      setAssemblyStatus('error');
    }
  }, [fetchSession]);

  useEffect(() => {
    cancelledRef.current = false;
    const sessionId = sessionStorage.getItem('shem-session-id');

    if (!sessionId) {
      setData(buildDemoData('demo-session-preview'));
      setLoading(false);
      setAssemblyStatus('ready');
      return;
    }

    if (sessionId.startsWith('demo-session-')) {
      setData(buildDemoData(sessionId));
      setLoading(false);
      setAssemblyStatus('ready');
      return;
    }

    startTimeRef.current = Date.now();
    fetchSession(sessionId, startTimeRef.current);

    return () => {
      cancelledRef.current = true;
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = undefined; }
    };
  }, [fetchSession]);

  return { data, loading, error, assemblyStatus, retryAssembly };
}

// ── API response mapping ──────────────────────────────────────────────────

function formatRole(role: string): string {
  return role.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function mapApiResponse(sessionId: string, raw: Record<string, unknown>): DeliveryData {
  const workflow = raw.workflow as { currentStep?: string; completedSteps?: string[] } | undefined;
  const debate = raw.debate as { findingsCount?: number; challengesCount?: number; resolutionsCount?: number; unresolvedCount?: number } | undefined;
  const verification = raw.verification as { resultsCount?: number; passed?: number; failed?: number } | undefined;
  const cost = raw.cost as { accumulated?: number; budget?: number; remaining?: number } | undefined;
  const evaluator = raw.evaluator as { results?: Array<{ step: string; passed: boolean; score: number; failureReasons?: string[]; revisionNumber?: number; timestamp?: string }>; bestScore?: number } | undefined;
  const agentPerf = raw.agentPerformance as Array<{ role: string; durationMs?: number; findingsPosted?: number; challengesIssued?: number }> | undefined;
  const matterTitle = raw.matterTitle as string | null;
  const durationMs = raw.durationMs as number | undefined;
  // v19: Use assembledDocument ONLY. NEVER fall back to finalOutput (process log).
  // finalOutput contains orchestrator thinking/coordination — serving it as a
  // deliverable is catastrophic. If assembledDocument is null, the deliverable is empty.
  const rawAssembledDocument = raw.assembledDocument as string | null;
  const rawFinalOutput = rawAssembledDocument || null;
  const rawDebateResolutions = raw.debateResolutions as Array<{ topic: string; resolution: string; winningPosition: string; evidenceWeight: string; escalationNeeded: boolean; confidence: number }> | undefined;
  const rawGateDecisions = raw.gateDecisionRecords as Array<{ gateType: string; decision: string; notes?: string }> | undefined;
  const rawFindings = raw.findings as Array<{ id: string; agent: string; category: string; severity: string; content: string; evidence: string[]; confidence: number }> | undefined;
  const rawBeforeScores = raw.beforeScores as Array<{ dimension: string; score: number; classification?: string }> | undefined;
  const rawAfterScores = raw.afterScores as Array<{ dimension: string; score: number; classification?: string }> | undefined;
  const rawReportCard = raw.reportCard as { scores?: { deltas?: Array<{ dimension: string; before: number; after: number; delta: number }> } } | null;

  const bestScore = evaluator?.bestScore ?? 0;
  const evalResults = evaluator?.results ?? [];
  const evalPassed = evalResults.filter(r => r.passed).length;
  const evalFailed = evalResults.filter(r => !r.passed).length;

  const isComplete = workflow?.currentStep === 'delivered';
  const stepLabel = (workflow?.currentStep ?? 'unknown').replace(/_/g, ' ');
  const docTitle = matterTitle ?? 'Session Results';

  // Executive summary
  const summaryParts: string[] = [];
  if (isComplete) {
    summaryParts.push('Analysis complete.');
  } else {
    summaryParts.push(`Session in progress \u2014 currently at: ${stepLabel}.`);
  }
  if (evalPassed > 0) {
    summaryParts.push(`${evalPassed} quality gate${evalPassed > 1 ? 's' : ''} passed.`);
  }
  if ((debate?.findingsCount ?? 0) > 0) {
    summaryParts.push(`${debate?.findingsCount} findings, ${debate?.challengesCount ?? 0} challenges.`);
  }
  if ((cost?.accumulated ?? 0) > 0) {
    summaryParts.push(`Cost: $${cost!.accumulated!.toFixed(2)} of $${cost!.budget!.toFixed(2)} budget.`);
  }
  if (durationMs && durationMs > 0) {
    const mins = Math.round(durationMs / 60000);
    summaryParts.push(`Duration: ${mins > 0 ? `${mins} min` : '<1 min'}.`);
  }

  // ── Dimensions from before/after scores ─────────────────────────────
  const dimensions: DimensionScore[] = [];
  if (rawReportCard?.scores?.deltas?.length) {
    for (const d of rawReportCard.scores.deltas) {
      dimensions.push({ dimension: d.dimension, before: d.before, after: d.after, delta: d.delta });
    }
  } else if (rawBeforeScores?.length && rawAfterScores?.length) {
    for (const before of rawBeforeScores) {
      const after = rawAfterScores.find(a => a.dimension === before.dimension);
      dimensions.push({
        dimension: before.dimension,
        before: before.score,
        after: after?.score ?? before.score,
        delta: (after?.score ?? before.score) - before.score,
      });
    }
  }

  // ── Key changes from RED/YELLOW findings ─────────────────────────────
  // For review workflows, findings are risks — not before/after transformations.
  // Present them as "Issue → Recommendation" instead of "Before → After".
  const keyChanges: KeyChange[] = (rawFindings ?? [])
    .filter(f => f.severity === 'RED' || f.severity === 'YELLOW')
    .slice(0, 8)
    .map(f => {
      const evidence = (f.evidence ?? []).join('; ');
      const hasEvidence = evidence.length > 0;
      return {
        title: `${f.severity === 'RED' ? '\u26D4' : '\u26A0\uFE0F'} ${f.category.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}`,
        before: hasEvidence ? evidence : f.content,
        after: hasEvidence ? f.content : `Flagged by ${formatRole(f.agent)}`,
      };
    });

  // ── Narrative from real session data ──────────────────────────────────
  const narrative: NarrativeSection[] = [];

  // Analysis phase — findings summary
  const findings = rawFindings ?? [];
  if (findings.length > 0) {
    const agentNames = [...new Set(findings.map(f => f.agent))];
    const redCount = findings.filter(f => f.severity === 'RED').length;
    const yellowCount = findings.filter(f => f.severity === 'YELLOW').length;
    let body = `The analysis phase produced ${findings.length} finding${findings.length > 1 ? 's' : ''} across ${agentNames.length} specialist${agentNames.length > 1 ? 's' : ''}.`;
    if (redCount > 0) body += ` ${redCount} critical (RED) finding${redCount > 1 ? 's were' : ' was'} flagged for immediate attention.`;
    if (yellowCount > 0) body += ` ${yellowCount} important (YELLOW) finding${yellowCount > 1 ? 's were' : ' was'} identified.`;
    narrative.push({
      phase: 'Analysis',
      heading: `${findings.length} findings from ${agentNames.length} specialist${agentNames.length > 1 ? 's' : ''}`,
      body,
      agents: agentNames.map(formatRole),
    });
  }

  // Debate phase — resolutions
  for (const r of (rawDebateResolutions ?? [])) {
    narrative.push({
      phase: 'Debate',
      heading: r.topic,
      body: r.resolution,
      agents: [],
      highlight: r.escalationNeeded ? 'This resolution was flagged for escalation.' : undefined,
    });
  }

  // Gate decisions
  for (const g of (rawGateDecisions ?? [])) {
    narrative.push({
      phase: 'Review Gate',
      heading: `${g.gateType.replace(/_/g, ' ')} gate: ${g.decision}`,
      body: g.notes ?? `The ${g.gateType.replace(/_/g, ' ')} gate was ${g.decision}.`,
      agents: [],
    });
  }

  // Evaluator results
  for (const r of evalResults) {
    narrative.push({
      phase: r.step.replace(/_/g, ' '),
      heading: r.passed ? 'Quality gate passed' : 'Quality gate failed',
      body: r.passed
        ? `The evaluator approved the ${r.step.replace(/_/g, ' ')} step output.`
        : `Issues found: ${(r.failureReasons ?? []).join('; ') || 'unspecified'}.`,
      agents: [],
    });
  }

  // Completion
  if (isComplete) {
    narrative.push({
      phase: 'Delivery',
      heading: 'Work product delivered',
      body: 'All workflow steps completed. The deliverable has been assembled and is ready for review.',
      agents: [],
    });
  }

  // ── Agent performance ─────────────────────────────────────────────────
  const agentPerfList: AgentPerf[] = (agentPerf ?? []).map(a => ({
    name: formatRole(a.role),
    role: a.role,
    findingsPosted: a.findingsPosted ?? 0,
    challengesSurvived: 0,
    avgConfidence: bestScore,
  }));

  const debateResolutions: DebateResolutionRecord[] = (rawDebateResolutions ?? []).map(r => ({
    topic: r.topic,
    resolution: r.resolution,
    winningPosition: r.winningPosition,
    evidenceWeight: r.evidenceWeight,
    escalationNeeded: r.escalationNeeded,
  }));

  const gateDecisions: GateDecisionRecord[] = (rawGateDecisions ?? []).map(g => ({
    gateType: g.gateType.replace(/_/g, ' '),
    decision: g.decision,
    summary: g.notes,
  }));

  const verificationChecks: VerificationCheck[] = [];
  if ((verification?.resultsCount ?? 0) > 0) {
    verificationChecks.push(
      { type: 'self', passed: (verification?.failed ?? 0) === 0, label: 'Self-Check' },
      { type: 'cross', passed: (verification?.failed ?? 0) === 0, label: 'Cross-Check' },
    );
  }
  for (const r of evalResults) {
    verificationChecks.push({
      type: 'evaluator',
      passed: r.passed,
      label: `${r.step.replace(/_/g, ' ')} evaluator`,
    });
  }

  const nextSteps: NextStepItem[] = [];
  if (isComplete) {
    nextSteps.push({ label: 'Review the output', description: 'Read through the generated content carefully. Compare against your original brief to verify all requirements were addressed.', kind: 'action' });
    nextSteps.push({ label: 'Independent counsel review', description: 'For legally binding documents, have an independent attorney review the output before finalizing.', kind: 'watchout' });
  } else {
    nextSteps.push({ label: 'Session still in progress', description: `The session is at the "${stepLabel}" step. Return to the Working View to monitor progress.`, kind: 'action' });
  }

  // Limitations — flag what might be missing
  const flaggedItems: string[] = [];
  if (debateResolutions.some(r => r.escalationNeeded)) {
    flaggedItems.push('One or more debate resolutions were flagged for escalation');
  }
  if (findings.some(f => f.severity === 'RED')) {
    flaggedItems.push('RED severity findings were identified \u2014 verify remediation');
  }
  flaggedItems.push('Verify legal accuracy with qualified counsel before relying on this output');

  return {
    sessionId,
    status: isComplete ? 'Complete' : stepLabel,
    documentTitle: docTitle,
    executiveSummary: summaryParts.join(' '),
    keyChanges,
    dimensions,
    finalOutput: rawFinalOutput ?? '',
    debateResolutions,
    gateDecisions,
    verificationChecks,
    narrative,
    debate: { findingsCount: debate?.findingsCount ?? 0, challengesCount: debate?.challengesCount ?? 0, resolutionsCount: debate?.resolutionsCount ?? 0, unresolvedCount: debate?.unresolvedCount ?? 0 },
    verification: { resultsCount: (verification?.resultsCount ?? 0) + evalResults.length, passed: (verification?.passed ?? 0) + evalPassed, failed: (verification?.failed ?? 0) + evalFailed, confidence: bestScore },
    cost: { accumulated: cost?.accumulated ?? 0, budget: cost?.budget ?? 0, remaining: cost?.remaining ?? 0 },
    agentPerformance: agentPerfList,
    eventCount: (raw.eventCount as number | undefined) ?? 0,
    limitations: { flaggedForHumanReview: flaggedItems, confidenceIntervals: '', disclaimer: 'This analysis was produced by an AI system with multi-agent verification. For matters involving regulatory filings, litigation, or binding contractual obligations, we recommend independent counsel verification.' },
    nextSteps,
  };
}

// ── Archive response mapping ──────────────────────────────────────────────

function mapArchiveResponse(sessionId: string, raw: Record<string, unknown>): DeliveryData {
  const title = (raw.title as string) || 'Archived Session';
  // v18: Use assembledDocument (clean deliverable), never raw finalOutput (process dump)
  const finalOutput = (raw.assembledDocument as string) || '';
  const costUsd = (raw.costUsd as number) || 0;
  const budgetUsd = (raw.budgetUsd as number) || 0;
  const durationMs = (raw.durationMs as number) || 0;
  const findingsCount = (raw.findingsCount as number) || 0;
  const resolutionsCount = (raw.resolutionsCount as number) || 0;
  const teamRoles = (raw.teamRoles as string[]) || [];
  const completedAt = raw.completedAt as string | null;

  // Parse summary JSON (debate, topFindings, resolutions, scores, verification)
  const summary = (raw.summary as Record<string, unknown>) || {};
  const debate = (summary.debate as { findingsCount?: number; challengesCount?: number; resolutionsCount?: number }) || {};
  const topFindings = (summary.topFindings as Array<{ severity: string; content: string; agent: string }>) || [];
  const resolutions = (summary.resolutions as Array<{ topic: string; resolution: string }>) || [];
  const beforeScores = (summary.beforeScores as Array<{ dimension: string; score: number }>) || [];
  const afterScores = (summary.afterScores as Array<{ dimension: string; score: number }>) || [];
  const verification = (summary.verification as { total?: number; passed?: number }) || {};

  const mins = durationMs > 0 ? Math.round(durationMs / 60000) : 0;
  const summaryParts = [
    'Analysis complete.',
    findingsCount > 0 ? `${findingsCount} findings, ${resolutionsCount} resolutions.` : '',
    costUsd > 0 ? `Cost: $${costUsd.toFixed(2)} of $${budgetUsd.toFixed(2)} budget.` : '',
    mins > 0 ? `Duration: ${mins} min.` : '',
  ].filter(Boolean);

  // Build dimensions from before/after scores
  const dimensions: DimensionScore[] = beforeScores.map(b => {
    const a = afterScores.find(s => s.dimension === b.dimension);
    return { dimension: b.dimension, before: b.score, after: a?.score ?? b.score, delta: (a?.score ?? b.score) - b.score };
  });

  // Key changes from top findings
  const keyChanges: KeyChange[] = topFindings
    .filter(f => f.severity === 'RED' || f.severity === 'YELLOW')
    .slice(0, 8)
    .map(f => ({
      title: `${f.severity === 'RED' ? '\u26D4' : '\u26A0\uFE0F'} ${f.agent ? formatRole(f.agent) : 'Finding'}`,
      before: f.content,
      after: `Flagged by ${f.agent ? formatRole(f.agent) : 'specialist'}`,
    }));

  // Debate resolutions
  const debateResolutions: DebateResolutionRecord[] = resolutions.map(r => ({
    topic: r.topic,
    resolution: r.resolution,
    winningPosition: '',
    evidenceWeight: '',
    escalationNeeded: false,
  }));

  // Narrative from archive data
  const narrative: NarrativeSection[] = [];
  if (topFindings.length > 0) {
    const agents = [...new Set(topFindings.map(f => f.agent).filter(Boolean))];
    narrative.push({
      phase: 'Analysis',
      heading: `${findingsCount} findings from ${agents.length || 1} specialist${agents.length !== 1 ? 's' : ''}`,
      body: `The analysis produced ${findingsCount} findings. ${topFindings.filter(f => f.severity === 'RED').length} critical issues were identified.`,
      agents: agents.map(formatRole),
    });
  }
  for (const r of resolutions) {
    narrative.push({ phase: 'Debate', heading: r.topic, body: r.resolution, agents: [] });
  }
  narrative.push({ phase: 'Delivery', heading: 'Work product delivered', body: 'All workflow steps completed. The deliverable was assembled and delivered.', agents: [] });

  // Agent performance from team roles
  const agentPerformance: AgentPerf[] = teamRoles.map(role => ({
    name: formatRole(role), role, findingsPosted: 0, challengesSurvived: 0, avgConfidence: 0,
  }));

  const verifTotal = verification.total ?? 0;
  const verifPassed = verification.passed ?? 0;

  return {
    sessionId,
    status: 'Complete',
    documentTitle: title,
    executiveSummary: summaryParts.join(' '),
    keyChanges,
    dimensions,
    finalOutput,
    debateResolutions,
    gateDecisions: [],
    verificationChecks: verifTotal > 0
      ? [{ type: 'verification', passed: verifPassed === verifTotal, label: `${verifPassed}/${verifTotal} checks passed` }]
      : [],
    narrative,
    debate: { findingsCount: debate.findingsCount ?? findingsCount, challengesCount: debate.challengesCount ?? 0, resolutionsCount: debate.resolutionsCount ?? resolutionsCount, unresolvedCount: 0 },
    verification: { resultsCount: verifTotal, passed: verifPassed, failed: verifTotal - verifPassed, confidence: 0 },
    cost: { accumulated: costUsd, budget: budgetUsd, remaining: budgetUsd - costUsd },
    agentPerformance,
    eventCount: 0,
    limitations: {
      flaggedForHumanReview: ['Verify legal accuracy with qualified counsel before relying on this output'],
      confidenceIntervals: '',
      disclaimer: 'This analysis was produced by an AI system with multi-agent verification.',
    },
    nextSteps: [
      { label: 'Review the output', description: 'Read through the generated content carefully.', kind: 'action' },
      { label: 'Independent counsel review', description: 'For legally binding documents, have an independent attorney review.', kind: 'watchout' },
    ],
  };
}

// ── Demo data ─────────────────────────────────────────────────────────────

function buildDemoData(sessionId: string): DeliveryData {
  let matterTitle = 'Terms of Service Redesign';
  try {
    const stored = sessionStorage.getItem('shem-matter-data');
    if (stored) {
      const m = JSON.parse(stored);
      if (m.matterTitle) matterTitle = m.matterTitle;
    }
  } catch { /* use default */ }

  return {
    sessionId,
    status: 'Complete',

    documentTitle: matterTitle,
    executiveSummary:
      'Your document has been redesigned for clarity, accessibility, and legal precision. ' +
      'Reading level was reduced from Grade 14.2 to Grade 7.8, making it accessible to 94% of the adult population. ' +
      'Visual hierarchy was restructured with consistent heading levels, and all WCAG 2.1 AA compliance gaps were resolved. ' +
      'Legal meaning was independently verified as fully preserved throughout the transformation.',

    keyChanges: [
      { title: 'Readability', before: 'Flesch-Kincaid Grade 14.2 \u2014 university-level language requiring specialized knowledge', after: 'Grade 7.8 \u2014 clear, accessible language that maintains professional tone' },
      { title: 'Visual Hierarchy', before: 'Inconsistent heading structure, no clear information flow', after: 'Three-level heading system with consistent styling and logical document flow' },
      { title: 'Accessibility', before: 'Color contrast ratios below WCAG 2.1 AA thresholds in 3 sections', after: 'Full WCAG 2.1 AA compliance \u2014 all contrast ratios above 4.5:1' },
      { title: 'Legal Meaning', before: 'Original legal intent embedded in complex sentence structures', after: 'Identical legal meaning verified \u2014 no semantic drift detected across 12 checkpoint tests' },
    ],

    dimensions: [
      { dimension: 'Readability', before: 1.8, after: 3.8, delta: 2.0 },
      { dimension: 'Findability', before: 2.1, after: 3.4, delta: 1.3 },
      { dimension: 'Clarity', before: 2.3, after: 3.9, delta: 1.6 },
      { dimension: 'Visual Design', before: 2.5, after: 4.1, delta: 1.6 },
      { dimension: 'Ethics', before: 2.0, after: 3.2, delta: 1.2 },
    ],

    finalOutput:
      '# Terms of Service \u2014 Redesigned\n\n' +
      '## TL;DR\n\nThis agreement covers your use of our platform. You keep your data. We keep our platform running. If something goes wrong, our liability is limited to what you paid us. You can leave anytime.\n\n' +
      '## Key Terms\n\n| Term | Meaning |\n|------|--------|\n| **Service** | The platform and all features you access through your account |\n| **Content** | Anything you upload, create, or store on the platform |\n| **Subscription Period** | The billing cycle you selected (monthly or annual) |\n\n' +
      '## Your Rights\n\n- You own everything you create on the platform\n- You can export your data at any time\n- You can cancel your subscription at any time\n- We will not sell your personal data to third parties\n\n' +
      '## Your Obligations\n\n- Use the platform lawfully\n- Keep your login credentials secure\n- Do not attempt to reverse-engineer the platform\n- Respect other users\' content and privacy\n\n' +
      '## Liability\n\nOur total liability is limited to the fees you paid in the 12 months before the claim arose. We are not liable for indirect or consequential damages. This limitation does not apply to our indemnification obligations or breaches of confidentiality.\n\n' +
      '## Termination\n\nEither party may terminate this agreement with 30 days written notice. Upon termination, you have 60 days to export your data before it is deleted.\n',

    debateResolutions: [
      { topic: 'Visual hierarchy severity', resolution: 'Upgraded to RED \u2014 structural issue affects both comprehension and programmatic accessibility.', winningPosition: 'Ethics auditor\'s accessibility argument prevailed \u2014 heading hierarchy is a Level A WCAG failure, not merely cosmetic.', evidenceWeight: 'WCAG 2.1 SC 1.3.1 requirement is dispositive. Screen reader navigation testing confirmed complete failure.', escalationNeeded: false },
      { topic: 'Transformation quality', resolution: 'All verification checks passed. Document meets readability, accessibility, and accuracy targets.', winningPosition: 'Transformation specialist\'s restructuring and plain language rewrite both validated by cross-verification.', evidenceWeight: 'Three independent verification checks (readability, accessibility, legal-accuracy) all passed.', escalationNeeded: false },
    ],

    gateDecisions: [
      { gateType: 'ethics critical', decision: 'approve', summary: 'Three RED findings related to WCAG 2.1 AA compliance, readability, and heading structure. Approved to proceed with remediation.' },
      { gateType: 'final delivery', decision: 'approve', summary: 'All checks passed. Document meets all targets.' },
    ],

    verificationChecks: [
      { type: 'readability', passed: true, label: 'Readability' },
      { type: 'accessibility', passed: true, label: 'Accessibility' },
      { type: 'legal-accuracy', passed: true, label: 'Legal Accuracy' },
    ],

    narrative: [
      { phase: 'Analysis', heading: 'Three perspectives, three problems', body: 'The engagement began with three specialists examining the document simultaneously. The Design Reviewer identified inconsistent heading structures that disrupted the reading flow. The Plain Language Specialist measured readability at Grade 14.2 \u2014 well above the target of Grade 8. Meanwhile, the Ethics Auditor flagged color contrast ratios that fell short of WCAG 2.1 AA standards, meaning the document was inaccessible to readers with visual impairments.', agents: ['Design Reviewer', 'Plain Language Specialist', 'Ethics Auditor'] },
      { phase: 'First Review', heading: 'A challenge that changed the outcome', body: 'During the first review round, the Ethics Auditor challenged the Design Reviewer\'s severity assessment of the heading structure issue. The original classification was YELLOW \u2014 important but not critical. The challenge argued that inconsistent headings don\'t just affect aesthetics; they affect comprehension for screen reader users, making this an accessibility issue at its core. The Design Reviewer accepted the challenge, and the finding was upgraded to RED.', agents: ['Ethics Auditor', 'Design Reviewer'], highlight: 'This challenge elevated a visual issue to a structural accessibility concern \u2014 a distinction that changed the transformation approach.' },
      { phase: 'Ethics Check', heading: 'Flagged for human review', body: 'Two RED findings related to accessibility triggered the ethics gate. The system flagged that these issues affect users with disabilities and readers with lower literacy levels. After review, the decision was to proceed with remediation \u2014 the transformation would need to address both readability and accessibility comprehensively, not as separate fixes.', agents: [], highlight: 'The ethics gate ensured accessibility wasn\'t treated as cosmetic but as a fundamental requirement.' },
      { phase: 'Transformation', heading: 'Rewriting with precision', body: 'The Transformation Specialist restructured the entire document with a new three-level heading system. The Plain Language Specialist then rewrote the content to Grade 8 reading level, working sentence by sentence to simplify language without altering legal obligations. This was the most time-intensive phase \u2014 every simplification had to preserve exact legal meaning.', agents: ['Transformation Specialist', 'Plain Language Specialist'] },
      { phase: 'Verification', heading: 'All checks passed', body: 'Three independent verification checks confirmed the transformation met all targets. Readability scored Grade 7.8. Accessibility achieved full WCAG 2.1 AA compliance. Most critically, the legal accuracy verification confirmed that no semantic drift had occurred \u2014 every legal obligation, right, and condition in the original document was preserved in the new version.', agents: [] },
      { phase: 'Final Approval', heading: 'Ready for delivery', body: 'The Meaning Guardian performed a final independent review, running 12 checkpoint tests comparing original and transformed versions. The verdict: legal meaning fully preserved, no semantic drift detected. The document was approved for delivery.', agents: ['Meaning Guardian'] },
    ],

    debate: { findingsCount: 5, challengesCount: 1, resolutionsCount: 2, unresolvedCount: 0 },
    verification: { resultsCount: 3, passed: 3, failed: 0, confidence: 0.91, breakdown: [{ type: 'self', passed: true, confidence: 0.93, label: 'Self-Check' }, { type: 'cross', passed: true, confidence: 0.87, label: 'Cross-Check' }, { type: 'score', passed: true, confidence: 0.94, label: 'Score-Check' }] },
    cost: { accumulated: 4.58, budget: 10.00, remaining: 5.42 },
    agentPerformance: [
      { name: 'Design Reviewer', role: 'design-reviewer', findingsPosted: 2, challengesSurvived: 0, avgConfidence: 0.87 },
      { name: 'Ethics Auditor', role: 'ethics-auditor', findingsPosted: 1, challengesSurvived: 1, avgConfidence: 0.91 },
      { name: 'Plain Language Specialist', role: 'plain-language-specialist', findingsPosted: 1, challengesSurvived: 0, avgConfidence: 0.93 },
      { name: 'Transformation Specialist', role: 'transformation-specialist', findingsPosted: 1, challengesSurvived: 0, avgConfidence: 0.95 },
      { name: 'Meaning Guardian', role: 'meaning-guardian', findingsPosted: 1, challengesSurvived: 0, avgConfidence: 0.96 },
      { name: 'Synthesis Editor', role: 'synthesis-editor', findingsPosted: 0, challengesSurvived: 0, avgConfidence: 0 },
    ],
    eventCount: 47,

    limitations: { flaggedForHumanReview: ['Jurisdictional nuances for multi-state compliance', 'Industry-specific regulatory interpretations'], confidenceIntervals: '', disclaimer: 'This analysis was produced by an AI system with multi-agent verification. For matters involving regulatory filings, litigation, or binding contractual obligations, we recommend independent counsel verification.' },

    nextSteps: [
      { label: 'Review the transformed document', description: 'Compare the before and after versions side by side. Pay particular attention to sections where complex legal language was simplified \u2014 verify the plain-language version captures your intended meaning.', kind: 'action' },
      { label: 'Test with your audience', description: 'Share the document with 2-3 representative readers from your target audience. Ask them to explain key obligations in their own words \u2014 if they can, the readability improvements are working.', kind: 'action' },
      { label: 'Update your style guide', description: 'The heading structure and language patterns used in this transformation can serve as a template for future documents. Consider adopting the three-level heading system as your standard.', kind: 'action' },
      { label: 'Schedule a 90-day review', description: 'Set a reminder to review the document after 90 days of use. Collect feedback from users and identify any sections that cause confusion or questions.', kind: 'schedule' },
      { label: 'Accessibility testing recommended', description: 'While the document meets WCAG 2.1 AA standards, consider testing with actual assistive technology (screen readers, high-contrast mode) before publishing to your website.', kind: 'watchout' },
    ],
  };
}
