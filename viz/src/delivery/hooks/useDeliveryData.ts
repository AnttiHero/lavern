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
  confidence?: number;
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
  score?: number;
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

  // Confidence & grounding
  confidenceSummary?: {
    overall: number;
    findings: number;
    resolutions: number;
    verification: number;
    grounding: number | null;
    evaluatorScore: number;
    lowConfidenceCount: number;
  };

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
const SLOW_POLL_INTERVAL_MS = 10_000;
const MAX_POLL_DURATION_MS = 5 * 60 * 1_000;
/** Once assembly is confirmed ready, do one final poll after 60s for late updates, then stop. */
const FINAL_POLL_DELAY_MS = 60_000;

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
  /** Tracks whether we've already scheduled (or completed) the final post-ready poll. */
  const finalPollDoneRef = useRef(false);

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

      // Continue polling as long as the document isn't ready.
      // Once assembly is confirmed ready, schedule one final poll after 60s for
      // late updates (e.g. report card), then stop polling entirely.
      if (deliverableValid) {
        if (!finalPollDoneRef.current) {
          finalPollDoneRef.current = true;
          timerRef.current = setTimeout(() => fetchSession(sessionId, startTime), FINAL_POLL_DELAY_MS);
        }
        // else: final poll already done — stop polling
      } else if (mapped.status !== 'Complete' || assemblyPending) {
        const interval = elapsed >= MAX_POLL_DURATION_MS ? SLOW_POLL_INTERVAL_MS : POLL_INTERVAL_MS;
        timerRef.current = setTimeout(() => fetchSession(sessionId, startTime), interval);
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

    // Cancel any in-flight polling timer to prevent duplicate polling chains
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = undefined; }
    finalPollDoneRef.current = false;
    setAssemblyStatus('polling');

    try {
      // First, check if the document is already there (assembly may have
      // completed after our polling timeout — no need to reassemble).
      const checkRes = await fetch(`/api/sessions/${sessionId}`, { credentials: 'include' });
      if (cancelledRef.current) return;
      if (checkRes.ok) {
        const checkData = await checkRes.json();
        if (checkData.assembledDocument && checkData.assembledDocument.length > 100) {
          // Document exists! Just refresh the data — no reassembly needed.
          startTimeRef.current = Date.now();
          fetchSession(sessionId, startTimeRef.current);
          return;
        }
      }

      // No document yet — trigger actual reassembly
      const res = await fetch(`/api/sessions/${sessionId}/reassemble`, {
        method: 'POST',
        credentials: 'include',
      });
      if (cancelledRef.current) return;

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
      if (cancelledRef.current) return;
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
    summaryParts.push(`Cost: $${(cost?.accumulated ?? 0).toFixed(2)} of $${(cost?.budget ?? 0).toFixed(2)} budget.`);
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
    confidence: r.confidence,
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
      score: r.score,
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
    confidenceSummary: (raw.confidenceSummary as DeliveryData['confidenceSummary']) ?? undefined,
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
  if (sessionId.includes('heartconnect')) {
    return buildHeartConnectDemoData(sessionId);
  }
  if (sessionId.includes('healthprivacy')) {
    return buildHealthPrivacyDemoData(sessionId);
  }
  if (sessionId.includes('devcontract')) {
    return buildDevContractDemoData(sessionId);
  }

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
      { topic: 'Visual hierarchy severity', resolution: 'Upgraded to RED \u2014 structural issue affects both comprehension and programmatic accessibility.', winningPosition: 'Ethics auditor\'s accessibility argument prevailed \u2014 heading hierarchy is a Level A WCAG failure, not merely cosmetic.', evidenceWeight: 'WCAG 2.1 SC 1.3.1 requirement is dispositive. Screen reader navigation testing confirmed complete failure.', escalationNeeded: false, confidence: 0.92 },
      { topic: 'Transformation quality', resolution: 'All verification checks passed. Document meets readability, accessibility, and accuracy targets.', winningPosition: 'Transformation specialist\'s restructuring and plain language rewrite both validated by cross-verification.', evidenceWeight: 'Three independent verification checks (readability, accessibility, legal-accuracy) all passed.', escalationNeeded: false, confidence: 0.88 },
    ],

    gateDecisions: [
      { gateType: 'ethics critical', decision: 'approve', summary: 'Three RED findings related to WCAG 2.1 AA compliance, readability, and heading structure. Approved to proceed with remediation.' },
      { gateType: 'final delivery', decision: 'approve', summary: 'All checks passed. Document meets all targets.' },
    ],

    verificationChecks: [
      { type: 'readability', passed: true, label: 'Readability', score: 0.93 },
      { type: 'accessibility', passed: true, label: 'Accessibility', score: 0.78 },
      { type: 'legal-accuracy', passed: true, label: 'Legal Accuracy', score: 0.91 },
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

// ── HeartConnect Demo data ────────────────────────────────────────────────

function buildHeartConnectDemoData(sessionId: string): DeliveryData {
  return {
    sessionId,
    status: 'Complete',

    documentTitle: 'HeartConnect Terms of Service',
    executiveSummary:
      'A comprehensive Terms of Service has been drafted for HeartConnect, an online dating platform. ' +
      'The document covers 16 sections including eligibility, subscriptions, data usage, safety, dispute resolution, and EU consumer protections. ' +
      'Seven specialists collaborated across privacy, regulatory, plain language, ethics, design, contract review, and synthesis. ' +
      'Three critical findings were identified and resolved: GDPR consent bundling, age verification gaps, and algorithmic transparency. ' +
      'Final readability: Grade 7.8 (down from Grade 16.8). Cost: $7.82 of $12.00 budget.',

    keyChanges: [
      {
        title: '\u26D4 Privacy \u2014 GDPR Consent Bundling',
        before: 'Data processing consent was bundled with Terms acceptance, violating GDPR Article 7 requirement for freely given, specific, informed consent.',
        after: 'Separated data processing consent into dedicated section (Section 6) with granular opt-in controls. Privacy Policy referenced separately with explicit link.',
      },
      {
        title: '\u26D4 Regulatory \u2014 Age Verification Gap',
        before: 'Platform relied solely on self-certification for age verification with no mechanism to detect or prevent underage access.',
        after: 'Added multi-layer verification: self-certification at signup, right to request ID verification at any time, explicit parental consent requirement for users under legal majority (Section 2).',
      },
      {
        title: '\u26D4 Ethics \u2014 Algorithmic Transparency',
        before: 'No disclosure of how matching algorithms work, what data influences match suggestions, or how user behavior affects recommendations.',
        after: 'Added transparency language in Sections 6 and 7: matching uses profile data and activity patterns, users can request explanation of match suggestions.',
      },
      {
        title: '\u26A0\uFE0F Readability \u2014 Dense Legal Language',
        before: 'Original draft at Flesch-Kincaid Grade 16.8 \u2014 post-graduate reading level with nested subordinate clauses and passive voice throughout.',
        after: 'Rewritten to Grade 7.8 with active voice, short sentences, plain-language explanations alongside legal terms. Safety section (Section 9) at Grade 5 for maximum accessibility.',
      },
      {
        title: '\u26A0\uFE0F Consumer Protection \u2014 EU User Rights',
        before: 'Arbitration clause applied globally with no carve-out for EU consumers protected by mandatory consumer protection directives.',
        after: 'Added explicit EU user exceptions throughout: 14-day withdrawal right (Section 5), GDPR rights (Section 6), arbitration opt-out for EU consumers (Section 12), Rome I Regulation acknowledgment (Section 15).',
      },
    ],

    dimensions: [
      { dimension: 'Readability', before: 1.2, after: 3.9, delta: 2.7 },
      { dimension: 'Findability', before: 1.8, after: 3.6, delta: 1.8 },
      { dimension: 'Clarity', before: 1.5, after: 4.0, delta: 2.5 },
      { dimension: 'Visual Design', before: 2.0, after: 3.8, delta: 1.8 },
      { dimension: 'Ethics', before: 1.4, after: 3.5, delta: 2.1 },
    ],

    finalOutput: HEARTCONNECT_TOS_DOCUMENT,

    debateResolutions: [
      {
        topic: 'GDPR consent bundling \u2014 severity and remediation',
        resolution: 'Upgraded to RED. Consent must be unbundled per GDPR Article 7. Separate data processing consent added with granular controls.',
        winningPosition: 'Privacy Counsel\'s position that bundled consent is per se invalid under GDPR prevailed over Contract Reviewer\'s argument that a single acceptance is standard practice.',
        evidenceWeight: 'GDPR Article 7, EDPB Guidelines on consent, Schrems II precedent. Regulatory risk is dispositive.',
        escalationNeeded: false,
        confidence: 0.94,
      },
      {
        topic: 'Arbitration clause \u2014 EU consumer applicability',
        resolution: 'Added explicit EU carve-out. EU consumers retain right to bring claims in home courts per Brussels Regulation. Arbitration remains for US users with 30-day opt-out.',
        winningPosition: 'Regulatory Counsel\'s position that mandatory arbitration is unenforceable against EU consumers under Directive 93/13/EEC prevailed.',
        evidenceWeight: 'EU Consumer Rights Directive, Brussels Regulation, Rome I Regulation. Platform cannot override mandatory consumer protection.',
        escalationNeeded: false,
        confidence: 0.91,
      },
    ],

    gateDecisions: [
      { gateType: 'ethics critical', decision: 'approve', summary: 'Three RED findings (GDPR consent, age verification, algorithmic transparency) approved for remediation. All affect user safety and regulatory compliance.' },
      { gateType: 'meaning preservation', decision: 'approve', summary: 'Plain language rewrite verified \u2014 all legal obligations, rights, limitations, and remedies preserved. No semantic drift detected across 16 sections.' },
      { gateType: 'final delivery', decision: 'approve', summary: 'All verification checks passed. Document meets readability, regulatory, and ethical standards.' },
    ],

    verificationChecks: [
      { type: 'readability', passed: true, label: 'Readability (Grade 7.8)', score: 0.95 },
      { type: 'regulatory', passed: true, label: 'Regulatory Compliance', score: 0.89 },
      { type: 'accessibility', passed: true, label: 'Accessibility (WCAG AA)', score: 0.82 },
      { type: 'legal-accuracy', passed: true, label: 'Legal Accuracy', score: 0.93 },
      { type: 'ethics', passed: true, label: 'Ethics Review', score: 0.88 },
    ],

    narrative: [
      {
        phase: 'Analysis',
        heading: 'Seven specialists examine a dating platform ToS',
        body: 'The engagement began with seven specialists simultaneously reviewing HeartConnect\'s Terms of Service draft. Privacy Counsel immediately flagged GDPR consent bundling \u2014 the draft combined data processing consent with Terms acceptance, a structure that violates Article 7. Regulatory Counsel identified age verification gaps: self-certification alone is insufficient for a dating platform serving potentially vulnerable users. The Plain Language Specialist measured readability at Grade 16.8, well above the target.',
        agents: ['Privacy Counsel', 'Regulatory Counsel', 'Plain Language Specialist', 'Ethics Auditor', 'Design Reviewer', 'Contract Reviewer', 'Synthesis Editor'],
      },
      {
        phase: 'First Debate',
        heading: 'Privacy vs. convenience \u2014 the consent bundling challenge',
        body: 'The Contract Reviewer argued that a single Terms acceptance is industry standard and simplifies onboarding. Privacy Counsel challenged this directly: under GDPR, consent for data processing must be freely given, specific, and informed \u2014 bundling it with Terms acceptance fails all three requirements. The Ethics Auditor supported the challenge, noting that dating platforms process especially sensitive data (sexual orientation, relationship preferences). The debate was resolved in favor of unbundled consent.',
        agents: ['Privacy Counsel', 'Contract Reviewer', 'Ethics Auditor'],
        highlight: 'This debate changed the fundamental consent architecture of the document \u2014 from single acceptance to granular opt-in.',
      },
      {
        phase: 'Ethics Gate',
        heading: 'Three critical findings flagged for human review',
        body: 'The ethics gate was triggered by three RED findings: GDPR consent bundling, age verification gaps, and missing algorithmic transparency. All three directly affect user safety on a dating platform \u2014 privacy violations could expose sensitive personal data, inadequate age verification could put minors at risk, and opaque algorithms could enable discriminatory matching. The gate approved proceeding with full remediation.',
        agents: [],
        highlight: 'The ethics gate ensured all three issues were treated as safety-critical, not just compliance checkboxes.',
      },
      {
        phase: 'Transformation',
        heading: 'Rewriting 16 sections in plain language',
        body: 'The Plain Language Specialist rewrote all 16 sections to Grade 7.8 reading level while the Synthesis Editor ensured structural coherence. The safety section (Section 9) was given special attention \u2014 written at Grade 5 level because safety information must be accessible to all users regardless of education. EU consumer protections were woven throughout rather than confined to a single section, following the principle that rights should be visible where they apply.',
        agents: ['Plain Language Specialist', 'Synthesis Editor'],
      },
      {
        phase: 'Verification',
        heading: 'Five independent checks \u2014 all passed',
        body: 'Five verification checks confirmed the document meets all targets: readability (Grade 7.8), regulatory compliance (GDPR, CCPA, EU Consumer Rights Directive), accessibility (WCAG AA), legal accuracy (no semantic drift across 16 sections), and ethics review (consent architecture, age verification, algorithmic transparency all addressed). The legal accuracy check was the most intensive, comparing every obligation, right, and limitation between the original draft and the final version.',
        agents: [],
      },
      {
        phase: 'Delivery',
        heading: 'Work product delivered',
        body: 'All workflow steps completed. The HeartConnect Terms of Service has been drafted with 16 sections covering the full scope of a dating platform\'s legal requirements. The document is ready for client review and independent counsel verification.',
        agents: [],
      },
    ],

    debate: { findingsCount: 7, challengesCount: 2, resolutionsCount: 2, unresolvedCount: 0 },
    verification: {
      resultsCount: 5,
      passed: 5,
      failed: 0,
      confidence: 0.93,
      breakdown: [
        { type: 'self', passed: true, confidence: 0.95, label: 'Readability Check' },
        { type: 'cross', passed: true, confidence: 0.89, label: 'Regulatory Cross-Check' },
        { type: 'score', passed: true, confidence: 0.93, label: 'Legal Accuracy Score' },
      ],
    },
    cost: { accumulated: 7.82, budget: 12.00, remaining: 4.18 },
    agentPerformance: [
      { name: 'Privacy Counsel', role: 'privacy-counsel', findingsPosted: 2, challengesSurvived: 1, avgConfidence: 0.94 },
      { name: 'Regulatory Counsel', role: 'regulatory-counsel', findingsPosted: 1, challengesSurvived: 0, avgConfidence: 0.91 },
      { name: 'Plain Language Specialist', role: 'plain-language-specialist', findingsPosted: 1, challengesSurvived: 0, avgConfidence: 0.95 },
      { name: 'Ethics Auditor', role: 'ethics-auditor', findingsPosted: 1, challengesSurvived: 1, avgConfidence: 0.88 },
      { name: 'Design Reviewer', role: 'design-reviewer', findingsPosted: 1, challengesSurvived: 0, avgConfidence: 0.85 },
      { name: 'Contract Reviewer', role: 'contract-reviewer', findingsPosted: 1, challengesSurvived: 0, avgConfidence: 0.90 },
      { name: 'Synthesis Editor', role: 'synthesis-editor', findingsPosted: 0, challengesSurvived: 0, avgConfidence: 0 },
    ],
    eventCount: 52,

    limitations: {
      flaggedForHumanReview: [
        'Age verification mechanism requires legal review for jurisdiction-specific requirements',
        'Arbitration clause EU carve-out should be reviewed by EU-qualified counsel',
        'GDPR consent flow implementation requires UX/UI design review',
      ],
      confidenceIntervals: '',
      disclaimer: 'This analysis was produced by an AI system with multi-agent verification. For matters involving regulatory filings, litigation, or binding contractual obligations, we recommend independent counsel verification.',
    },

    nextSteps: [
      { label: 'Review with qualified counsel', description: 'Have a licensed attorney review the complete Terms of Service, paying special attention to the GDPR consent architecture, arbitration clause, and age verification requirements.', kind: 'action' },
      { label: 'Implement consent UX', description: 'The unbundled consent architecture requires a separate consent flow in the app \u2014 work with your UX team to design granular opt-in screens that are clear and non-coercive.', kind: 'action' },
      { label: 'Age verification vendor', description: 'Evaluate age verification service providers that comply with applicable data protection laws. Self-certification alone is insufficient for a dating platform.', kind: 'action' },
      { label: 'EU market launch review', description: 'If launching in the EU, engage local counsel to verify compliance with each member state\'s consumer protection implementation.', kind: 'watchout' },
      { label: 'Schedule 6-month legal audit', description: 'Dating platform regulations are evolving rapidly. Schedule a comprehensive review in 6 months to address any new requirements from the EU Digital Services Act or state-level dating safety laws.', kind: 'schedule' },
    ],
  };
}

// ── HeartConnect ToS Document (real work product) ─────────────────────────

const HEARTCONNECT_TOS_DOCUMENT = `# HeartConnect Terms of Service

**DRAFT \u2014 For Client Review**
*Effective Date: [Effective Date]*

---

## Table of Contents

1. Welcome / Agreement to Terms
2. Who Can Use HeartConnect (Eligibility)
3. Your Account
4. What\u2019s Free and What\u2019s Premium (Subscription Terms)
5. Auto-Renewal and Cancellation
6. How We Use Your Data
7. Your Content
8. Rules of Conduct
9. Safety and Interactions with Other Users
10. Our Disclaimers
11. Limitation of Liability
12. Dispute Resolution and Arbitration
13. Account Suspension and Termination
14. Changes to These Terms
15. General Provisions
16. Contact Us

---

## 1. Welcome / Agreement to Terms

Welcome to HeartConnect! These Terms of Service (\u201CTerms\u201D) are a legal agreement between you and HeartConnect LLC, a Delaware limited liability company (\u201CHeartConnect,\u201D \u201Cwe,\u201D \u201Cus,\u201D or \u201Cour\u201D). They govern your use of the HeartConnect website, mobile application, and all related services (collectively, the \u201CService\u201D).

By creating an account, accessing, or using HeartConnect, you agree to be bound by these Terms. If you do not agree, please do not use the Service.

These Terms also incorporate our Privacy Policy, available at [LINK], which describes how we collect, use, and protect your personal information. Please read it carefully.

We\u2019ve written these Terms in plain language so you can understand your rights and responsibilities. Where we use a legal term, we\u2019ll explain what it means.

## 2. Who Can Use HeartConnect (Eligibility)

To use HeartConnect, you must meet all of the following requirements:

- **You must be at least 18 years old.** HeartConnect is not intended for anyone under the age of 18. By creating an account, you confirm that you are 18 or older.
- **You must be legally able to enter into a binding agreement.** If you are under the legal age of majority in your jurisdiction (even if over 18), you represent that you have parental or guardian consent to use the Service.
- **You must not be prohibited from using the Service under applicable law.** This includes any laws of the United States, the European Union, or any other jurisdiction that applies to you.
- **You must not have been previously banned or removed from HeartConnect.**

We may ask you to verify your age or identity at any time. By using the Service, you acknowledge that we rely on your self-certification of eligibility, and you agree that providing false information about your age or identity is a violation of these Terms.

## 3. Your Account

### Creating Your Account

To use HeartConnect, you need to create an account. When you sign up, you agree to:

- Provide accurate, current, and complete information about yourself.
- Keep your account information up to date.
- Keep your password secure and confidential.
- Accept responsibility for all activity that occurs under your account.

### One Account Per Person

Each person may maintain only one HeartConnect account. If we discover duplicate accounts, we may close or merge them at our discretion.

### Account Security

You are responsible for maintaining the security of your account. If you believe your account has been compromised, please contact us immediately at [EMAIL]. We are not liable for any losses resulting from unauthorized use of your account where you have failed to keep your credentials secure.

## 4. What\u2019s Free and What\u2019s Premium (Subscription Terms)

### Free Features

HeartConnect offers a free tier that gives you access to basic features, including creating a profile, browsing other users, and limited messaging. The specific features available for free may change from time to time.

### Premium Subscription

HeartConnect also offers a premium subscription (\u201CHeartConnect Premium\u201D) that provides access to additional features. The specific premium features and subscription plans (including pricing and duration) are described on our website and in the app at the time of purchase.

By purchasing a Premium subscription, you agree to pay the applicable fees. All fees are stated in U.S. dollars unless otherwise indicated at the point of sale.

### Payment

When you subscribe to HeartConnect Premium, you authorize us (or our third-party payment processor) to charge the payment method you provide. You are responsible for ensuring your payment information is current and that all charges can be processed. If a payment fails, we may suspend your access to Premium features until payment is received.

### Taxes

All fees are exclusive of applicable taxes unless stated otherwise. You are responsible for any applicable taxes associated with your subscription.

## 5. Auto-Renewal and Cancellation

### Auto-Renewal

Your HeartConnect Premium subscription will automatically renew at the end of each subscription period (e.g., monthly or annually) unless you cancel before the renewal date. When your subscription renews, we will charge the same payment method at the then-current subscription rate. We will send you a reminder before each renewal.

By subscribing, you consent to this auto-renewal arrangement. This means charges will continue to recur until you actively cancel.

### How to Cancel

You can cancel your Premium subscription at any time through any of the following methods:

- **In the app:** Go to Settings > Subscription > Cancel Subscription.
- **On our website:** Visit your Account Settings page at [LINK].
- **By email:** Send a cancellation request to [EMAIL].
- **Through your app store:** If you subscribed through Apple\u2019s App Store or Google Play, you must cancel through that platform\u2019s subscription management settings.

Cancellation takes effect at the end of your current billing period. You will continue to have access to Premium features until your current period expires, but you will not be charged again.

### Refunds

Fees already charged are generally non-refundable, except:

- **If required by applicable law.** For example, certain U.S. state laws and EU consumer protection laws may entitle you to a refund in specific circumstances.
- **EU users:** If you are a consumer located in the European Union, you have the right to withdraw from your Premium subscription within 14 days of your initial purchase, without giving any reason, and receive a full refund. This withdrawal right is provided under the EU Consumer Rights Directive. To exercise this right, contact us at [EMAIL] within 14 days of purchase. Please note: if you begin using Premium features during the 14-day withdrawal period, we may deduct a proportionate amount for the services you received before cancellation.
- **At our discretion.** We may, but are not obligated to, offer refunds or credits on a case-by-case basis.

### Price Changes

We may change our subscription pricing from time to time. If we increase the price of your current subscription, we will notify you at least 30 days before the change takes effect. The new price will apply to your next renewal period. If you do not agree to the new price, you may cancel before the renewal date.

## 6. How We Use Your Data

Your privacy matters to us \u2014 especially on a platform where you share personal and sensitive information. This section provides a summary of our data practices. For full details, please read our Privacy Policy at [LINK].

### What We Collect

We collect information you provide to us (such as your name, email address, date of birth, photos, profile information, and preferences), information generated by your use of the Service (such as activity logs, device information, and location data), and information from third parties (such as social media accounts you link to your profile).

### How We Use It

We use your information to:

- Provide, operate, and improve the Service.
- Suggest potential matches and personalize your experience.
- Process payments for Premium subscriptions.
- Communicate with you about your account, updates, and promotions (with your consent where required).
- Enforce these Terms and protect the safety and security of our users.

### How We Share It

We do not sell your personal information. We may share your information with:

- **Other users:** Your profile information is visible to other HeartConnect users as part of the Service.
- **Service providers:** Third-party companies that help us operate the Service (e.g., payment processors, hosting providers, analytics services).
- **Legal obligations:** When required by law, regulation, or legal process.
- **Safety:** When we believe disclosure is necessary to protect the rights, safety, or property of HeartConnect, our users, or others.

### Data Retention

We retain your information for as long as your account is active and for a reasonable period afterward as needed for legal, security, and business purposes. You can request deletion of your account and personal data at any time, subject to our legal obligations.

### Your Rights

Depending on where you live, you may have certain rights regarding your personal data, including the right to access, correct, delete, or port your data. EU users have specific rights under the General Data Protection Regulation (GDPR). Please see our Privacy Policy at [LINK] for details on how to exercise these rights.

## 7. Your Content

### Content You Create

When you use HeartConnect, you may upload photos, write profile descriptions, send messages, and share other content (\u201CYour Content\u201D). You retain ownership of Your Content.

### License You Grant Us

By uploading or sharing Your Content on HeartConnect, you grant us a worldwide, non-exclusive, royalty-free, transferable, sublicensable license to use, reproduce, modify, adapt, display, and distribute Your Content \u2014 but only for the purposes of operating, providing, promoting, and improving the Service.

In plain language: we need the right to show your profile to other users, display your photos in the app, and potentially use anonymized or aggregated content (such as a testimonial you\u2019ve consented to) in marketing materials. We will not sell Your Content to third parties.

This license ends when you delete Your Content or your account, except where Your Content has been shared with other users (e.g., messages) and they have not deleted it, or where we are required to retain it for legal purposes.

### Content Standards

Your Content must comply with these Terms and all applicable laws. You represent and warrant that:

- You own or have the necessary rights to Your Content.
- Your Content does not infringe any third party\u2019s intellectual property, privacy, or other rights.
- Your Content is not false, misleading, or deceptive.

We may (but are not obligated to) review, monitor, or remove Your Content at any time and for any reason, including if we believe it violates these Terms.

## 8. Rules of Conduct

HeartConnect is meant to be a safe and respectful environment for everyone. When using the Service, you agree not to:

### Harmful Behavior

- Harass, bully, stalk, intimidate, or threaten any other user.
- Engage in any form of hate speech or discrimination based on race, ethnicity, national origin, religion, gender, gender identity, sexual orientation, disability, or any other protected characteristic.
- Send unsolicited sexual content or messages.
- Engage in any conduct that is abusive, harmful, or offensive.

### Fraud and Deception

- Create a fake profile or impersonate any person or entity.
- Use the Service for any commercial purpose, including solicitation, advertising, or promoting products or services.
- Scam, defraud, or deceive other users, including catfishing.
- Request money or financial information from other users.

### Illegal Activity

- Use the Service for any unlawful purpose.
- Post or share content involving the sexual exploitation of minors. We report all instances of child sexual abuse material (CSAM) to the National Center for Missing & Exploited Children (NCMEC) and applicable law enforcement.
- Engage in human trafficking, prostitution, or solicitation.
- Violate any applicable local, state, national, or international law.

### Platform Integrity

- Use bots, scripts, or automated methods to access or interact with the Service.
- Attempt to gain unauthorized access to other users\u2019 accounts or HeartConnect\u2019s systems.
- Reverse-engineer, decompile, or disassemble any part of the Service.
- Interfere with or disrupt the Service or its servers or networks.
- Scrape, harvest, or collect information about other users without their consent.

### Reporting Violations

If you encounter behavior that violates these Terms, please report it through the in-app reporting feature or by contacting us at [EMAIL]. We take reports seriously and will investigate them promptly. Reporting is confidential.

## 9. Safety and Interactions with Other Users

### Your Responsibility

HeartConnect is a platform that connects people, but we cannot control what happens between users. You are solely responsible for your interactions with other users, whether online or in person. We encourage you to exercise caution and good judgment.

### Safety Tips

We strongly recommend that you:

- **Do not share personal information too quickly.** Avoid sharing your home address, phone number, financial information, or workplace details with someone you have just met on the platform.
- **Meet in public places.** If you decide to meet someone in person, choose a public location for your first meetings.
- **Tell someone you trust.** Let a friend or family member know where you are going and who you are meeting.
- **Trust your instincts.** If something feels wrong, end the interaction. You can always block and report another user.
- **Never send money.** Do not send money or financial information to anyone you meet through HeartConnect.

### No Background Checks

HeartConnect does not conduct criminal background checks, identity verification, or screening of its users. We do not verify the statements or representations made by users in their profiles. You should not assume that any user is who they claim to be.

We are not responsible for the conduct of any user, whether on or off the platform.

## 10. Our Disclaimers

Please read this section carefully. It limits certain rights you might otherwise have.

### No Guarantees of Matches or Outcomes

HeartConnect does not guarantee that you will find a match, a date, or a relationship through the Service. We provide a platform to connect people, but the success of any connection depends entirely on the individuals involved.

### \u201CAs Is\u201D Service

To the fullest extent permitted by applicable law, the Service is provided on an \u201CAS IS\u201D and \u201CAS AVAILABLE\u201D basis, without warranties of any kind, either express or implied. We disclaim all warranties, including implied warranties of merchantability, fitness for a particular purpose, title, and non-infringement.

**EU users:** This disclaimer does not affect your statutory rights as a consumer under applicable EU law, including mandatory warranty protections. Where our disclaimers conflict with your mandatory consumer rights, your consumer rights prevail.

## 11. Limitation of Liability

### Exclusion of Certain Damages

To the fullest extent permitted by applicable law, HeartConnect, its officers, directors, employees, agents, and affiliates will not be liable for any indirect, incidental, special, consequential, or punitive damages, including but not limited to: loss of profits, data, use, or goodwill; emotional distress arising from interactions with other users; the conduct or content of any user; or unauthorized access to or alteration of your data.

### Cap on Liability

Our total cumulative liability to you for any and all claims arising from or related to the Service will not exceed the greater of: (a) the amount you paid to HeartConnect in the 12 months preceding the claim, or (b) one hundred U.S. dollars ($100).

### Exceptions

The limitations in this section do not apply to liability that cannot be excluded or limited under applicable law. For EU users, this includes liability arising from gross negligence, willful misconduct, or fraud.

## 12. Dispute Resolution and Arbitration

*This section contains an arbitration agreement and a class action waiver. Please read it carefully \u2014 it affects your legal rights.*

### Informal Resolution First

Before starting any formal dispute proceeding, you agree to contact us at [EMAIL] and describe the issue. We will try to resolve it informally within 30 days. Most concerns can be resolved this way.

### Binding Arbitration

If we cannot resolve a dispute informally, you and HeartConnect agree to resolve any claims through final and binding arbitration, rather than in court. Arbitration will be administered by the American Arbitration Association (AAA) under its Consumer Arbitration Rules.

We will pay all AAA filing, administration, and arbitrator fees for claims of $10,000 or less, unless the arbitrator determines your claim is frivolous.

### Class Action Waiver

You and HeartConnect each agree that any dispute resolution proceedings will be conducted only on an individual basis and not in a class, consolidated, or representative action.

### Opt-Out Right

You have the right to opt out of this arbitration agreement by sending written notice to [EMAIL] within 30 days of creating your HeartConnect account.

### EU Users

If you are a consumer located in the European Union, you are not required to arbitrate disputes. You retain the right to bring claims in the courts of your country of residence, as provided under mandatory EU consumer protection law. You may also use the European Commission\u2019s Online Dispute Resolution platform.

## 13. Account Suspension and Termination

### Termination by You

You may delete your account at any time through the app (Settings > Account > Delete Account) or by contacting us at [EMAIL]. Deleting your account will remove your profile from the Service and end your access to all features. Please cancel your Premium subscription first (see Section 5).

### Termination by Us

We may suspend or terminate your account if we believe you have violated these Terms, your conduct poses a risk to other users\u2019 safety, your account is being used for fraudulent or unauthorized purposes, or continued provision of the Service to you is impractical.

We will make reasonable efforts to provide notice of termination and the reasons for it, unless doing so would compromise the safety of others or an ongoing investigation.

### Effect of Termination

Upon termination, your license to use the Service immediately ends. We may delete your account data in accordance with our Privacy Policy and applicable law. Sections intended to survive termination include Sections 7, 10, 11, 12, and 15.

## 14. Changes to These Terms

We may update these Terms from time to time. When we make changes, we will update the \u201CEffective Date\u201D at the top and notify you of material changes at least 30 days before they take effect.

Your continued use of the Service after the updated Terms take effect constitutes your acceptance of the changes. If you do not agree, you should stop using the Service and delete your account.

**For EU users:** Where required by applicable law, we will seek your affirmative consent to material changes.

## 15. General Provisions

**Entire Agreement.** These Terms, together with the Privacy Policy, constitute the entire agreement between you and HeartConnect regarding your use of the Service.

**Severability.** If any provision is found invalid or unenforceable, it will be modified to the minimum extent necessary. The remaining provisions continue in full force.

**No Waiver.** Our failure to enforce any right does not constitute a waiver of that right.

**Assignment.** You may not assign your rights without our written consent. We may assign ours without restriction.

**Force Majeure.** We are not liable for failures resulting from causes beyond our reasonable control.

**Governing Law.** These Terms are governed by the laws of the State of Delaware, United States, without regard to conflict of laws principles. **For EU users:** This choice of law does not deprive you of mandatory protections under the law of your country of habitual residence under the Rome I Regulation.

## 16. Contact Us

If you have questions about these Terms, your account, or anything else related to HeartConnect, we\u2019d love to hear from you.

**HeartConnect LLC**
Email: [EMAIL]
Mailing Address: [Mailing Address]
Website: [LINK]

For privacy-related inquiries, please see our Privacy Policy at [LINK] or email our data protection team at [EMAIL].

---

*These Terms of Service were last updated on [Effective Date].*
*\u00A9 [Year] HeartConnect LLC. All rights reserved.*

---

*Prepared by Lavern \u2014 Multi-Agent Legal Design System*
*This document was produced with AI assistance. It does not constitute legal advice. Always verify with qualified legal professionals.*
`;

// ── MediVault Privacy Policy Demo Data ───────────────────────────────────

function buildHealthPrivacyDemoData(sessionId: string): DeliveryData {
  return {
    sessionId,
    status: 'Complete',

    documentTitle: 'MediVault Privacy Policy',
    executiveSummary:
      'A comprehensive Privacy Policy has been drafted for MediVault, a health technology platform processing patient records under both HIPAA and GDPR. ' +
      'Six specialists collaborated across privacy, regulatory, compliance, plain language, risk pricing, and synthesis. ' +
      'Two critical findings were identified and resolved: inadequate HIPAA PHI disclosures and legally deficient cross-border transfer mechanisms. ' +
      'A dual-track breach notification process was designed for the US-EU operational split. ' +
      'Final document includes de-identification methodology disclosure for Series B due diligence confidence. Cost: $6.41 of $15.00 budget.',

    keyChanges: [
      {
        title: '\u26D4 HIPAA \u2014 PHI Processing Disclosure',
        before: 'Health data treated identically to general personal data. No mention of Business Associate Agreements, minimum necessary standard, or HIPAA-specific patient rights.',
        after: 'Dedicated PHI processing section with BAA requirements, minimum necessary standard, and complete patient rights (access, amendment, accounting of disclosures).',
      },
      {
        title: '\u26D4 Cross-Border \u2014 US-EU Data Transfers',
        before: 'Generic statement that data "may be transferred internationally" with no legal basis specified.',
        after: 'Full transfer mechanism documentation: Standard Contractual Clauses with supplementary technical measures (AES-256 encryption, TLS 1.3, pseudonymization).',
      },
      {
        title: '\u26A0\uFE0F Compliance \u2014 Breach Notification',
        before: 'Single "30-day notification" promise that contradicts both HIPAA (60 days) and GDPR (72 hours) requirements.',
        after: 'Dual-track notification: GDPR 72-hour authority notification, HIPAA 60-day individual notification, 24-hour maximum internal escalation between Berlin and US teams.',
      },
      {
        title: '\u26A0\uFE0F Data Retention \u2014 Medical Records',
        before: 'Promise to delete data on account closure, conflicting with medical records retention laws (7-10 years) and HIPAA 6-year requirement.',
        after: 'Tiered retention schedule: account data deleted on closure, medical records retained per applicable state law, HIPAA records retained for 6 years minimum.',
      },
      {
        title: '\u2705 Due Diligence \u2014 De-identification Disclosure',
        before: 'No mention of data de-identification methodology for analytics processing.',
        after: 'Explicit de-identification methodology section specifying HIPAA Safe Harbor method, periodic re-identification risk assessments, and clear distinction between identified PHI and de-identified analytics data.',
      },
    ],

    dimensions: [
      { dimension: 'HIPAA Compliance', before: 1.0, after: 4.2, delta: 3.2 },
      { dimension: 'GDPR Compliance', before: 1.4, after: 3.9, delta: 2.5 },
      { dimension: 'Readability', before: 1.6, after: 3.7, delta: 2.1 },
      { dimension: 'Breach Response', before: 0.8, after: 4.0, delta: 3.2 },
      { dimension: 'Investor Confidence', before: 1.2, after: 3.8, delta: 2.6 },
    ],

    finalOutput: MEDIVAULT_PRIVACY_DOCUMENT,

    debateResolutions: [
      {
        topic: 'De-identification methodology disclosure',
        resolution: 'Privacy policy will include explicit HIPAA de-identification methodology (Safe Harbor method) with periodic risk assessments. Serves both compliance and Series B due diligence purposes.',
        winningPosition: 'Compliance Officer\'s due diligence perspective refined the privacy approach. Investors need to see MediVault understands the HIPAA de-identification framework.',
        evidenceWeight: 'HIPAA de-identification standards (45 CFR 164.514) and Series B due diligence expectations both support detailed methodology disclosure.',
        escalationNeeded: false,
        confidence: 0.92,
      },
      {
        topic: 'Cross-border breach notification timeline',
        resolution: 'Dual-track breach notification adopted. EU-discovered breaches trigger parallel GDPR notification and US HIPAA assessment tracks with 24-hour maximum internal escalation.',
        winningPosition: 'Regulatory Counsel\'s cross-border perspective was critical. The Berlin team discovery scenario could create a compliance gap if not explicitly addressed.',
        evidenceWeight: 'GDPR 72-hour and HIPAA 60-day timelines both run from "awareness." Dual-track process prevents either clock from being missed.',
        escalationNeeded: false,
        confidence: 0.95,
      },
    ],

    gateDecisions: [
      { gateType: 'ethics critical', decision: 'approve', summary: 'Two RED findings (HIPAA PHI processing, cross-border transfers) and two YELLOW findings (breach notification, data retention) approved for remediation.' },
      { gateType: 'final delivery', decision: 'approve', summary: 'All five verification checks passed. HIPAA and GDPR compliance confirmed. Cross-border transfer mechanisms validated.' },
    ],

    verificationChecks: [
      { type: 'hipaa-compliance', passed: true, label: 'HIPAA Compliance', score: 0.94 },
      { type: 'gdpr-compliance', passed: true, label: 'GDPR Compliance', score: 0.92 },
      { type: 'readability', passed: true, label: 'Readability', score: 0.90 },
      { type: 'cross-border-transfer', passed: true, label: 'Cross-Border Transfer', score: 0.91 },
      { type: 'legal-accuracy', passed: true, label: 'Legal Accuracy', score: 0.95 },
    ],

    narrative: [
      {
        phase: 'Analysis',
        heading: 'Six specialists examine a health tech privacy policy',
        body: 'The engagement began with six specialists simultaneously reviewing MediVault\'s privacy policy draft. Privacy Counsel immediately identified that the policy treats health data identically to general personal data, with no HIPAA-specific PHI disclosures. Regulatory Counsel flagged the cross-border transfer section as legally deficient post-Schrems II. The Compliance Officer discovered internally contradictory breach notification timelines.',
        agents: ['Privacy Counsel', 'Regulatory Counsel', 'Compliance Officer', 'Plain Language Specialist', 'Risk Pricer', 'Synthesis Editor'],
      },
      {
        phase: 'First Debate',
        heading: 'De-identification and the investor perspective',
        body: 'The Compliance Officer challenged the HIPAA finding with a strategic insight: MediVault should disclose its de-identification methodology in the privacy policy. This serves dual purposes \u2014 regulatory compliance and investor confidence during Series B due diligence. Privacy Counsel accepted the challenge and expanded the recommendation to include a dedicated section explaining de-identification methodology and distinguishing identified PHI from de-identified analytics.',
        agents: ['Compliance Officer', 'Privacy Counsel'],
        highlight: 'This debate elevated the privacy policy from a compliance document to a strategic asset for fundraising.',
      },
      {
        phase: 'Second Debate',
        heading: 'The Berlin team problem \u2014 dual-track breach notification',
        body: 'Regulatory Counsel raised a critical operational scenario: if the Berlin engineering team discovers a breach, GDPR\'s 72-hour clock starts at EU discovery, but HIPAA\'s clock may not start until the US entity is notified. Without explicit internal escalation procedures, a cross-Atlantic communication delay could violate both regimes. The team adopted a dual-track process with a 24-hour maximum internal escalation window.',
        agents: ['Regulatory Counsel', 'Compliance Officer'],
        highlight: 'This scenario-based debate prevented a real operational compliance gap that would only surface during an actual incident.',
      },
      {
        phase: 'Transformation',
        heading: 'Building HIPAA and GDPR compliance in parallel',
        body: 'Privacy Counsel drafted HIPAA-compliant PHI disclosures and a de-identification methodology section. Regulatory Counsel specified cross-border transfer mechanisms including Standard Contractual Clauses with supplementary technical measures. The first quality check failed on two specificity gaps: de-identification method and encryption standards. After revision, the second check passed at 93%.',
        agents: ['Privacy Counsel', 'Regulatory Counsel', 'Plain Language Specialist'],
      },
      {
        phase: 'Verification',
        heading: 'Five independent checks \u2014 all passed',
        body: 'Five verification checks confirmed compliance: HIPAA compliance (PHI handling, BAA requirements, patient rights), GDPR compliance (lawful basis, data subject rights, DPO provisions), readability (accessible to patient audience), cross-border transfer validity (SCCs with supplementary measures), and legal accuracy (no unintended obligations or gaps).',
        agents: [],
      },
      {
        phase: 'Delivery',
        heading: 'Work product delivered',
        body: 'All workflow steps completed. The MediVault Privacy Policy has been drafted with full HIPAA and GDPR compliance, dual-track breach notification, cross-border transfer mechanisms, and de-identification methodology disclosure. The document is ready for client review and Series B due diligence.',
        agents: [],
      },
    ],

    debate: { findingsCount: 4, challengesCount: 2, resolutionsCount: 2, unresolvedCount: 0 },
    verification: {
      resultsCount: 5,
      passed: 5,
      failed: 0,
      confidence: 0.92,
      breakdown: [
        { type: 'self', passed: true, confidence: 0.94, label: 'HIPAA Compliance Check' },
        { type: 'cross', passed: true, confidence: 0.92, label: 'GDPR Cross-Check' },
        { type: 'score', passed: true, confidence: 0.95, label: 'Legal Accuracy Score' },
      ],
    },
    cost: { accumulated: 6.41, budget: 15.00, remaining: 8.59 },
    agentPerformance: [
      { name: 'Privacy Counsel', role: 'privacy-counsel', findingsPosted: 1, challengesSurvived: 1, avgConfidence: 0.96 },
      { name: 'Regulatory Counsel', role: 'regulatory-counsel', findingsPosted: 1, challengesSurvived: 0, avgConfidence: 0.93 },
      { name: 'Compliance Officer', role: 'compliance-officer', findingsPosted: 2, challengesSurvived: 1, avgConfidence: 0.90 },
      { name: 'Plain Language Specialist', role: 'plain-language-specialist', findingsPosted: 0, challengesSurvived: 0, avgConfidence: 0 },
      { name: 'Risk Pricer', role: 'risk-pricer', findingsPosted: 0, challengesSurvived: 0, avgConfidence: 0 },
      { name: 'Synthesis Editor', role: 'synthesis-editor', findingsPosted: 0, challengesSurvived: 0, avgConfidence: 0 },
    ],
    eventCount: 48,

    limitations: {
      flaggedForHumanReview: [
        'HIPAA BAA template should be reviewed by health law counsel before execution',
        'Cross-border transfer supplementary measures should be validated by data protection officer',
        'State-specific medical records retention periods vary and require jurisdiction review',
      ],
      confidenceIntervals: '',
      disclaimer: 'This analysis was produced by an AI system with multi-agent verification. For matters involving regulatory filings, litigation, or binding contractual obligations, we recommend independent counsel verification.',
    },

    nextSteps: [
      { label: 'Engage health law counsel', description: 'Have a HIPAA-qualified attorney review the privacy policy, particularly the PHI processing disclosures, BAA requirements, and de-identification methodology section.', kind: 'action' },
      { label: 'Validate transfer mechanisms', description: 'Confirm Standard Contractual Clauses and supplementary technical measures with your Data Protection Officer and Berlin engineering team.', kind: 'action' },
      { label: 'Series B data room', description: 'Include the privacy policy, de-identification methodology documentation, and breach notification procedures in your Series B data room for investor review.', kind: 'action' },
      { label: 'Berlin team training', description: 'Ensure the Berlin engineering team understands the dual-track breach notification process and their role in the 24-hour internal escalation window.', kind: 'watchout' },
      { label: 'Annual HIPAA risk assessment', description: 'Schedule the first annual HIPAA security risk assessment and de-identification re-evaluation within 90 days of policy adoption.', kind: 'schedule' },
    ],
  };
}

const MEDIVAULT_PRIVACY_DOCUMENT = `# MediVault Privacy Policy

**DRAFT \u2014 For Client Review**
*Effective Date: [Effective Date]*

---

## Table of Contents

1. Introduction
2. Information We Collect
3. How We Use Your Information
4. Protected Health Information (PHI)
5. Data De-identification
6. How We Share Your Information
7. International Data Transfers
8. Data Retention
9. Data Security
10. Breach Notification
11. Your Rights
12. Children's Privacy
13. Changes to This Policy
14. Contact Us

---

## 1. Introduction

MediVault, Inc. ("MediVault," "we," "us," or "our") provides a health technology platform that helps medical providers manage patient records securely. This Privacy Policy explains how we collect, use, store, and protect your personal information, including Protected Health Information (PHI) as defined by the Health Insurance Portability and Accountability Act (HIPAA).

We operate in the United States and the European Union. This policy addresses our obligations under both HIPAA and the General Data Protection Regulation (GDPR).

## 2. Information We Collect

We collect information in three categories:

**Information you provide:** Name, email, professional credentials (for providers), patient demographics, medical records, insurance information, and account credentials.

**Information generated by the platform:** Access logs, usage analytics, device information, IP addresses, and audit trails required by HIPAA.

**Information from third parties:** Electronic health records from integrated systems, insurance verification data, and identity verification results.

## 3. How We Use Your Information

We use your information to:

- Provide and maintain the MediVault platform
- Process and store patient records securely
- Generate analytics and insights (using de-identified data only)
- Comply with legal and regulatory requirements
- Communicate with you about your account and our services
- Improve our platform and develop new features

## 4. Protected Health Information (PHI)

MediVault processes Protected Health Information as defined by HIPAA. PHI includes any individually identifiable health information that relates to a patient's past, present, or future health condition, treatment, or payment for healthcare.

**Business Associate Agreements.** When we process PHI on behalf of healthcare providers, we do so under Business Associate Agreements (BAAs) that define our obligations and permitted uses of PHI.

**Minimum Necessary Standard.** We apply the HIPAA minimum necessary standard to all PHI access. Our systems are designed so that each user can access only the PHI required for their specific role and task.

**Your HIPAA Rights.** If you are a patient whose PHI is stored on MediVault, you have the right to: access your health records, request amendments to your records, receive an accounting of disclosures, request restrictions on certain uses, and receive confidential communications.

## 5. Data De-identification

MediVault uses the HIPAA Safe Harbor method to de-identify health data for analytics purposes. Under this method, we remove all 18 categories of identifiers specified in 45 CFR 164.514(b)(2).

De-identified data is not subject to HIPAA restrictions and may be used for platform improvement, research, and aggregate analytics. We do not attempt to re-identify de-identified data.

We conduct periodic re-identification risk assessments to ensure our de-identification processes remain effective as data volumes and linkage risks evolve.

## 6. How We Share Your Information

We do not sell your personal information or PHI.

We may share your information with: service providers under BAAs or data processing agreements, healthcare providers for treatment purposes, as required by law, and for public health activities as permitted by HIPAA.

## 7. International Data Transfers

MediVault operates in the United States and the European Union. Patient data may be transferred between these jurisdictions.

**US to EU transfers** are governed by Standard Contractual Clauses (SCCs) approved by the European Commission, supplemented by the following technical measures: AES-256 encryption at rest, TLS 1.3 encryption in transit, pseudonymization of patient identifiers before transfer, and access controls limiting data access to authorized personnel.

**EU to US transfers** follow the same protections. Our Berlin engineering team processes data under GDPR requirements, and all cross-border data flows are documented in our Records of Processing Activities.

## 8. Data Retention

We retain different categories of data for different periods:

- **Account data:** Retained while your account is active, deleted within 30 days of account closure
- **Patient medical records:** Retained in accordance with applicable state medical records retention laws (typically 7-10 years from last treatment)
- **HIPAA-required records:** Retained for a minimum of 6 years as required by the HIPAA Privacy Rule
- **Audit logs:** Retained for 6 years per HIPAA requirements
- **De-identified analytics data:** Retained indefinitely (not subject to deletion requests as it cannot be linked to individuals)

## 9. Data Security

We implement administrative, technical, and physical safeguards as required by the HIPAA Security Rule, including: encryption at rest and in transit, multi-factor authentication, role-based access controls, regular security risk assessments, employee training, and incident response procedures.

## 10. Breach Notification

In the event of a data breach, we follow a dual-track notification process:

**GDPR Track (72 hours):** If a breach is discovered by any team member (including our Berlin engineering team), we notify the relevant EU supervisory authority within 72 hours of awareness. Affected individuals are notified without undue delay if the breach poses a high risk to their rights.

**HIPAA Track (60 days):** We notify affected individuals within 60 days of discovery. Breaches affecting 500 or more individuals are also reported to the HHS Secretary and prominent media outlets.

**Internal Escalation:** Any breach discovery triggers immediate internal notification across all teams within 24 hours, ensuring both GDPR and HIPAA notification tracks are activated in parallel.

## 11. Your Rights

**Under GDPR** (EU residents): Right of access, rectification, erasure, restriction of processing, data portability, and objection. Contact our Data Protection Officer at [EMAIL].

**Under HIPAA** (patients): Right to access, amend, accounting of disclosures, restriction requests, confidential communications, and breach notification.

**Under CCPA** (California residents): Right to know, delete, opt-out of sale (we do not sell data), and non-discrimination.

## 12. Children's Privacy

MediVault does not knowingly collect personal information from children under 13. Patient records for minors are managed by their healthcare providers under applicable parental consent requirements.

## 13. Changes to This Policy

We may update this policy from time to time. Material changes will be communicated at least 30 days before they take effect. Continued use of MediVault after changes constitutes acceptance.

## 14. Contact Us

**MediVault, Inc.**
Email: [EMAIL]
Data Protection Officer: [EMAIL]
HIPAA Privacy Officer: [EMAIL]
Mailing Address: [Mailing Address]

---

*This Privacy Policy was last updated on [Effective Date].*

---

*Prepared by Lavern \u2014 Multi-Agent Legal Design System*
*This document was produced with AI assistance. It does not constitute legal advice. Always verify with qualified legal professionals.*
`;

// ── CodeCraft Developer Agreement Demo Data ──────────────────────────────

function buildDevContractDemoData(sessionId: string): DeliveryData {
  return {
    sessionId,
    status: 'Complete',

    documentTitle: 'CodeCraft Developer Services Agreement',
    executiveSummary:
      'A revised Developer Services Agreement has been drafted for CodeCraft, addressing critical IP ownership gaps and worker misclassification risks. ' +
      'Six specialists collaborated across IP, employment, contract, plain language, risk pricing, and synthesis. ' +
      'The most critical finding: the original agreement relied on work-for-hire doctrine, which is legally ineffective for independent contractor software under 17 USC 101. ' +
      'A narrowly-scoped IP assignment clause with pre-existing IP carve-outs was designed to prevent future ownership disputes while preserving contractor independence. ' +
      'Cost: $4.22 of $10.00 budget.',

    keyChanges: [
      {
        title: '\u26D4 IP Ownership \u2014 Work-for-Hire Gap',
        before: 'Agreement relied solely on "work made for hire" doctrine, which does not apply to software created by independent contractors under copyright law.',
        after: 'Dual protection: work-for-hire clause retained as backup, plus explicit assignment of "Deliverable Work Product" (code committed to company repos for company projects). Pre-existing IP schedule preserves contractor rights.',
      },
      {
        title: '\u26A0\uFE0F Classification \u2014 Misclassification Risk',
        before: 'Contract required exclusive engagement, fixed 9-5 hours, and company equipment \u2014 three factors indicating employee status under California ABC test.',
        after: 'Removed exclusivity requirement, replaced fixed hours with deliverable deadlines, and made company equipment optional. Added safe harbor provisions and independent contractor acknowledgment.',
      },
      {
        title: '\u26A0\uFE0F Termination \u2014 One-Sided Provisions',
        before: 'Company could terminate with 7 days notice; contractor required 30 days. No code handover, credential transfer, or transition provisions.',
        after: 'Balanced 14-day notice for both parties. Mandatory 5-business-day code review and handover period. PR completion required before final termination. Credential rotation checklist.',
      },
      {
        title: '\u26A0\uFE0F Liability \u2014 Insufficient Cap',
        before: 'Liability capped at fees paid in prior 12 months with no carve-outs. For a new contractor, cap could be as low as one milestone payment.',
        after: 'Tiered liability: general cap at 2x total contract value, with super-cap carve-outs for IP infringement, intentional misconduct, and confidentiality breach (3x contract value).',
      },
    ],

    dimensions: [
      { dimension: 'IP Protection', before: 0.8, after: 4.3, delta: 3.5 },
      { dimension: 'Classification Safety', before: 1.2, after: 3.6, delta: 2.4 },
      { dimension: 'Balance/Fairness', before: 1.5, after: 3.8, delta: 2.3 },
      { dimension: 'Readability', before: 2.0, after: 3.7, delta: 1.7 },
      { dimension: 'Enforceability', before: 1.8, after: 4.0, delta: 2.2 },
    ],

    finalOutput: CODECRAFT_AGREEMENT_DOCUMENT,

    debateResolutions: [
      {
        topic: 'IP assignment scope vs. misclassification risk',
        resolution: 'Assignment clause narrowed to "Deliverable Work Product" (code committed to company repos for company projects). Pre-existing IP schedule preserves contractor independence. Open-source contributions explicitly carved out.',
        winningPosition: 'Employment Counsel\'s misclassification concern refined the IP approach. Narrow, specific assignment is both legally safer and practically clearer than broad "all ideas conceived" language.',
        evidenceWeight: 'DOL and NLRB guidance on IP assignment breadth as classification indicator, combined with copyright assignment best practices.',
        escalationNeeded: false,
        confidence: 0.94,
      },
    ],

    gateDecisions: [
      { gateType: 'ethics critical', decision: 'approve', summary: 'One RED finding (IP ownership gap) and three YELLOW findings (misclassification, termination, liability) approved for remediation.' },
      { gateType: 'final delivery', decision: 'approve', summary: 'All three verification checks passed. IP assignment validated, classification risk mitigated, legal accuracy confirmed.' },
    ],

    verificationChecks: [
      { type: 'ip-assignment', passed: true, label: 'IP Assignment Validity', score: 0.95 },
      { type: 'classification-risk', passed: true, label: 'Classification Risk', score: 0.88 },
      { type: 'legal-accuracy', passed: true, label: 'Legal Accuracy', score: 0.93 },
    ],

    narrative: [
      {
        phase: 'Analysis',
        heading: 'Six specialists examine a developer services agreement',
        body: 'The engagement began with six specialists reviewing CodeCraft\'s freelance developer agreement. The IP Specialist immediately identified the critical gap: the agreement relies on "work made for hire" doctrine, which does not apply to software created by independent contractors under 17 USC 101. Employment Counsel flagged three misclassification risk factors: exclusive engagement, fixed hours, and mandatory company equipment. The Contract Specialist found one-sided termination provisions and an insufficient liability cap.',
        agents: ['IP Specialist', 'Employment Counsel', 'Contract Specialist', 'Plain Language Specialist', 'Risk Pricer', 'Synthesis Editor'],
      },
      {
        phase: 'Debate',
        heading: 'The assignment-classification tension',
        body: 'Employment Counsel challenged the IP Specialist\'s initial fix: a broad assignment clause ("all right, title, and interest in all ideas conceived during the engagement") could itself be used as evidence of employment relationship by labor boards. The IP Specialist accepted the challenge and narrowed the clause to "Deliverable Work Product" specifically defined as code committed to CodeCraft repositories. A Pre-existing IP Schedule was added to document what the contractor brings in.',
        agents: ['Employment Counsel', 'IP Specialist'],
        highlight: 'This debate prevented a common trap: fixing the IP problem in a way that creates a misclassification problem. The cross-disciplinary challenge produced a better solution than either specialist would have reached alone.',
      },
      {
        phase: 'Ethics Gate',
        heading: 'Four findings approved for remediation',
        body: 'The ethics gate reviewed all four findings. The IP ownership gap was classified as RED due to CodeCraft\'s prior dispute history \u2014 this is the exact vulnerability that caused the previous lawsuit. The three YELLOW findings (misclassification, termination, liability) were approved for comprehensive remediation.',
        agents: [],
        highlight: 'The prior IP dispute context elevated the urgency. This was not a theoretical risk but a proven vulnerability.',
      },
      {
        phase: 'Transformation',
        heading: 'Rebuilding the agreement with balanced protections',
        body: 'The IP Specialist drafted a narrowly-scoped assignment clause with Pre-existing IP Schedule and open-source carve-outs. The Contract Specialist rewrote termination provisions with balanced 14-day notice and a mandatory 5-day code handover period. The first quality check failed on two specificity gaps; after revision, the second check passed.',
        agents: ['IP Specialist', 'Contract Specialist', 'Plain Language Specialist'],
      },
      {
        phase: 'Verification',
        heading: 'Three independent checks \u2014 all passed',
        body: 'Three verification checks confirmed the agreement\'s soundness: IP assignment validity (narrowly-scoped clause with proper backup assignment), classification risk assessment (control factors removed, safe harbor provisions added), and legal accuracy (all obligations balanced, no unintended gaps).',
        agents: [],
      },
      {
        phase: 'Delivery',
        heading: 'Work product delivered',
        body: 'All workflow steps completed. The CodeCraft Developer Services Agreement has been revised with robust IP protections, classification safety, balanced termination, and appropriate liability caps. The document is ready for client review and independent counsel verification.',
        agents: [],
      },
    ],

    debate: { findingsCount: 4, challengesCount: 1, resolutionsCount: 1, unresolvedCount: 0 },
    verification: {
      resultsCount: 3,
      passed: 3,
      failed: 0,
      confidence: 0.92,
      breakdown: [
        { type: 'self', passed: true, confidence: 0.95, label: 'IP Assignment Check' },
        { type: 'cross', passed: true, confidence: 0.88, label: 'Classification Cross-Check' },
        { type: 'score', passed: true, confidence: 0.93, label: 'Legal Accuracy Score' },
      ],
    },
    cost: { accumulated: 4.22, budget: 10.00, remaining: 5.78 },
    agentPerformance: [
      { name: 'IP Specialist', role: 'ip-specialist', findingsPosted: 1, challengesSurvived: 1, avgConfidence: 0.97 },
      { name: 'Employment Counsel', role: 'employment-counsel', findingsPosted: 1, challengesSurvived: 0, avgConfidence: 0.89 },
      { name: 'Contract Specialist', role: 'contract-specialist', findingsPosted: 2, challengesSurvived: 0, avgConfidence: 0.85 },
      { name: 'Plain Language Specialist', role: 'plain-language-specialist', findingsPosted: 0, challengesSurvived: 0, avgConfidence: 0 },
      { name: 'Risk Pricer', role: 'risk-pricer', findingsPosted: 0, challengesSurvived: 0, avgConfidence: 0 },
      { name: 'Synthesis Editor', role: 'synthesis-editor', findingsPosted: 0, challengesSurvived: 0, avgConfidence: 0 },
    ],
    eventCount: 38,

    limitations: {
      flaggedForHumanReview: [
        'IP assignment clause should be reviewed by IP counsel for state-specific enforceability',
        'Misclassification safe harbor provisions should be validated against current DOL guidance',
        'Non-compete provisions may be unenforceable in certain states (CA, CO, MN, ND, OK)',
      ],
      confidenceIntervals: '',
      disclaimer: 'This analysis was produced by an AI system with multi-agent verification. For matters involving regulatory filings, litigation, or binding contractual obligations, we recommend independent counsel verification.',
    },

    nextSteps: [
      { label: 'Review with IP counsel', description: 'Have an intellectual property attorney review the assignment clause and Pre-existing IP Schedule template, particularly for enforceability in your jurisdiction.', kind: 'action' },
      { label: 'Employment law review', description: 'Have an employment attorney confirm the misclassification mitigations are sufficient for the jurisdictions where your contractors are located.', kind: 'action' },
      { label: 'Implement Pre-existing IP workflow', description: 'Create an onboarding process where new contractors complete the Pre-existing IP Schedule before starting work. This protects both parties.', kind: 'action' },
      { label: 'California contractors', description: 'If engaging contractors in California, ensure compliance with AB5 and the specific exemptions for professional services. Additional contract language may be required.', kind: 'watchout' },
      { label: 'Annual agreement review', description: 'Schedule annual review of the agreement template as employment law and IP assignment rules continue to evolve, particularly regarding AI-generated code ownership.', kind: 'schedule' },
    ],
  };
}

const CODECRAFT_AGREEMENT_DOCUMENT = `# CodeCraft Developer Services Agreement

**DRAFT \u2014 For Client Review**
*Effective Date: [Effective Date]*

---

## Table of Contents

1. Engagement and Scope
2. Independent Contractor Relationship
3. Deliverables and Milestones
4. Compensation and Payment
5. Intellectual Property
6. Pre-existing IP Schedule
7. Confidentiality
8. Termination and Transition
9. Liability and Indemnification
10. Representations and Warranties
11. General Provisions

---

## 1. Engagement and Scope

This Developer Services Agreement ("Agreement") is entered into by CodeCraft, Inc. ("Company") and the individual or entity identified in the attached Statement of Work ("Contractor").

The Contractor will provide software development services as described in each Statement of Work ("SOW") attached to this Agreement. Each SOW will specify: the scope of work, deliverables, milestones, timeline, and compensation.

## 2. Independent Contractor Relationship

The Contractor is an independent contractor, not an employee, agent, or partner of the Company. The Contractor:

- **Controls their own schedule.** The Contractor determines when, where, and how to perform the work, provided that deliverables are completed by agreed milestones.
- **May work for others.** The Contractor is free to provide services to other clients during the engagement, provided there is no conflict of interest.
- **Uses their own tools.** The Contractor may use their own development environment, hardware, and software. Company-provided tools are available but optional.
- **Is responsible for their own taxes.** The Contractor is solely responsible for all income taxes, self-employment taxes, and other tax obligations.

Nothing in this Agreement creates an employment relationship. The Company does not provide employee benefits (health insurance, retirement, paid leave) to the Contractor.

## 3. Deliverables and Milestones

The Contractor will deliver software and related materials as specified in each SOW. All deliverables must:

- Be original work or properly licensed
- Conform to the specifications in the SOW
- Pass code review by the Company's engineering team
- Include documentation as specified in the SOW

## 4. Compensation and Payment

The Company will pay the Contractor as specified in each SOW. Unless otherwise stated:

- Payment is due within 30 days of milestone acceptance
- The Contractor will submit invoices upon milestone completion
- Late payments accrue interest at 1.5% per month

## 5. Intellectual Property

### Deliverable Work Product

"Deliverable Work Product" means code, documentation, designs, and other materials that: (a) are created by the Contractor specifically for the Company under this Agreement, AND (b) are committed to the Company's code repositories or delivered as part of a milestone.

To the extent any Deliverable Work Product qualifies as "work made for hire" under 17 USC 101, it is hereby designated as such. To the extent any Deliverable Work Product does not qualify as work made for hire, the Contractor hereby irrevocably assigns to the Company all right, title, and interest in and to such Deliverable Work Product, including all intellectual property rights.

### What the Contractor Keeps

The Contractor retains all right, title, and interest in:

- **Pre-existing IP:** All intellectual property owned by the Contractor before the engagement or developed independently outside the scope of this Agreement, as identified in the Pre-existing IP Schedule (Section 6).
- **General knowledge and skills:** Programming techniques, methodologies, and general know-how.
- **Open-source contributions:** Any contributions the Contractor makes to open-source projects, even if using skills developed during the engagement.
- **Personal projects:** Software developed on the Contractor's own time, using the Contractor's own equipment, that does not relate to the Company's business.

### License to Pre-existing IP

If the Contractor incorporates any Pre-existing IP into Deliverable Work Product, the Contractor grants the Company a perpetual, non-exclusive, royalty-free, worldwide license to use, modify, and distribute such Pre-existing IP solely as part of the Deliverable Work Product.

## 6. Pre-existing IP Schedule

Before beginning work, the Contractor must complete this schedule listing any pre-existing intellectual property that may be incorporated into Deliverable Work Product:

| Item | Description | License Type | Relevant SOW |
|------|-------------|-------------|-------------|
| [Name] | [Brief description] | [Open source / Proprietary / Other] | [SOW reference] |

**Open-Source Contributions:** The Contractor may continue contributing to the following open-source projects during the engagement:

| Project | License | Contribution Scope |
|---------|---------|-------------------|
| [Project name] | [License] | [Description] |

The Contractor must update this schedule promptly if additional Pre-existing IP is incorporated into any Deliverable Work Product.

## 7. Confidentiality

The Contractor agrees to maintain the confidentiality of all non-public information disclosed by the Company. Confidential information does not include information that is publicly available, independently developed, or rightfully obtained from third parties.

Confidentiality obligations survive termination of this Agreement for 3 years.

## 8. Termination and Transition

### Notice Period

Either party may terminate this Agreement with 14 calendar days' written notice.

### Code Handover Period

Upon notice of termination, the following transition process applies:

1. **Days 1-5:** Contractor completes or documents all work in progress. All open pull requests must be completed, reviewed, and merged or closed.
2. **Days 6-10:** Contractor participates in code review sessions and knowledge transfer.
3. **Days 11-14:** Credential rotation, access revocation, and final documentation delivery.

### Termination for Cause

Either party may terminate immediately for material breach that remains uncured after 10 days' written notice specifying the breach.

### Payment on Termination

The Company will pay for all completed milestones and, on a pro-rata basis, for work completed toward the next milestone as of the termination date.

## 9. Liability and Indemnification

### General Liability Cap

Each party's total aggregate liability under this Agreement is limited to two times (2x) the total compensation specified in all active SOWs.

### Super-Cap Carve-outs

The general liability cap does not apply to:

- Breach of intellectual property obligations (Section 5): liability capped at three times (3x) total contract value
- Breach of confidentiality obligations (Section 7): liability capped at three times (3x) total contract value
- Intentional misconduct or fraud: unlimited liability
- Indemnification for third-party IP infringement claims: unlimited liability

### Mutual Indemnification

Each party will indemnify the other against third-party claims arising from the indemnifying party's breach of this Agreement, negligence, or willful misconduct.

## 10. Representations and Warranties

The Contractor represents and warrants that:

- They have the right to enter into this Agreement
- Deliverable Work Product will be original or properly licensed
- Deliverable Work Product will not infringe any third party's intellectual property rights
- They will comply with all applicable laws

## 11. General Provisions

**Governing Law.** This Agreement is governed by the laws of [State], without regard to conflicts of law principles.

**Entire Agreement.** This Agreement and its SOWs constitute the entire agreement between the parties.

**Amendments.** Changes must be in writing and signed by both parties.

**Severability.** Invalid provisions will be modified to the minimum extent necessary.

**Notices.** All notices must be in writing and sent to the addresses specified in the SOW.

---

*This Developer Services Agreement was last updated on [Effective Date].*

---

*Prepared by Lavern \u2014 Multi-Agent Legal Design System*
*This document was produced with AI assistance. It does not constitute legal advice. Always verify with qualified legal professionals.*
`;
