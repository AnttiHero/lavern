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
  if (sessionId.includes('medivault') || sessionId.includes('healthprivacy')) {
    return buildHealthPrivacyDemoData(sessionId);
  }
  if (sessionId.includes('cloudmsa')) {
    return buildCloudMSADemoData(sessionId);
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

**DRAFT \u2014 For Client Review**  \u00b7  *Plain-language redesign by Lavern*
*Effective Date: [Effective Date]*  \u00b7  *Readability: Grade 7.8 (was 16.8)*

---

> **TL;DR \u2014 What you actually need to know:**
> - You must be **18 or older** to use HeartConnect.
> - Your subscription **auto-renews** \u2014 cancel any time in Settings before renewal.
> - EU users: you have a **14-day withdrawal right** and don\u2019t have to arbitrate.
> - We do **not** conduct background checks on users. Stay safe out there.
> - We don\u2019t sell your data. Your content is yours.

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

**DRAFT \u2014 For Client Review**  \u00b7  *Compliance redesign by Lavern*
*Effective Date: [Effective Date]*  \u00b7  *Jurisdiction: United States + European Union*

---

| Regulatory Framework | Status | Primary Contact |
|---|---|---|
| HIPAA / HITECH | \u2705 Compliant | HIPAA Privacy Officer |
| GDPR (EU/UK) | \u2705 Compliant | Data Protection Officer (Berlin) |
| CCPA / CPRA (California) | \u2705 Compliant | privacy@medivault.com |
| State Medical Records Laws | \u2705 Mapped | See Section 11 |

> **For Series B due diligence:** This policy discloses our de-identification methodology (HIPAA Safe Harbor, 45 CFR \u00a7\u00a0164.514), cross-border transfer mechanism (Standard Contractual Clauses + AES-256 supplementary measures), and dual-track breach notification process. Sections 5, 7, 10, and 13 are written specifically for investor review.

---

## Table of Contents

1. Introduction and Scope
2. Who We Are \u2014 Data Controller and DPO
3. Information We Collect
4. Legal Basis for Processing (GDPR)
5. Protected Health Information (PHI) and HIPAA
6. Data De-identification Methodology
7. How We Use Your Information
8. Cookies and Tracking Technologies
9. How We Share Your Information
10. International Data Transfers
11. Data Retention Schedule
12. Data Security
13. Breach Notification
14. Your Privacy Rights
15. California Residents (CCPA/CPRA)
16. Children\u2019s Privacy
17. Changes to This Policy
18. Contact Us

---

## 1. Introduction and Scope

MediVault, Inc. (\u201CMediVault,\u201D \u201Cwe,\u201D \u201Cus,\u201D or \u201Cour\u201D) provides a cloud-based health technology platform that enables medical providers to securely store, access, and manage patient records. This Privacy Policy (\u201CPolicy\u201D) applies to all information we collect through the MediVault platform, website, APIs, and related services (collectively, the \u201CPlatform\u201D).

MediVault operates in the United States (primary headquarters) and the European Union (engineering and EU client operations in Berlin, Germany). This Policy is designed to meet our obligations under:

- The **Health Insurance Portability and Accountability Act (HIPAA)** and the HITECH Act
- The EU/UK **General Data Protection Regulation (GDPR)**
- The **California Consumer Privacy Act (CCPA)** as amended by the CPRA
- Applicable state medical records laws

Where requirements conflict, we apply the more protective standard.

## 2. Who We Are \u2014 Data Controller and DPO

**U.S. Operations**
MediVault, Inc.
[Mailing Address]
HIPAA Privacy Officer: [EMAIL]
HIPAA Security Officer: [EMAIL]

**EU Operations**
MediVault GmbH (Berlin)
[EU Mailing Address]
Data Protection Officer (DPO): [EMAIL]
EU Representative: MediVault GmbH acts as our EU representative for GDPR purposes.

Under GDPR, MediVault Inc. and MediVault GmbH are joint controllers for the purposes of cross-border data processing between our US and EU operations. The joint controller arrangement is documented in our Records of Processing Activities and is available upon request.

## 3. Information We Collect

We collect three categories of information:

### 3.1 Information You Provide

**For healthcare providers and administrators:**
- Full name, professional credentials, and National Provider Identifier (NPI)
- Email address, phone number, and mailing address
- Organization name, address, and Tax ID / EIN
- Payment and billing information
- Account credentials

**For patients (where applicable):**
- Name, date of birth, and contact information
- Medical record numbers and insurance identifiers
- Clinical notes, diagnoses, medications, and treatment plans
- Billing and insurance information

### 3.2 Information Generated by the Platform

- Access logs: who accessed which records, when, and from which IP address (required by HIPAA)
- Audit trails: all create, read, update, and delete operations on patient records
- Device and session data: browser type, operating system, and session identifiers
- Usage analytics: feature usage patterns (de-identified and aggregated)

### 3.3 Information from Third Parties

- Electronic Health Records (EHR) imported from integrated systems via HL7 FHIR APIs
- Insurance eligibility and claims data from clearinghouses
- Identity verification results from third-party providers
- Laboratory results from integrated lab information systems

## 4. Legal Basis for Processing (GDPR)

For EU residents, we process personal data on the following legal bases under GDPR Articles 6 and 9:

| Processing Activity | Legal Basis |
|---|---|
| Providing the Platform to providers | Article 6(1)(b) \u2014 Performance of a contract |
| Processing patient PHI for treatment | Article 9(2)(h) \u2014 Healthcare provision |
| Security monitoring and audit logging | Article 6(1)(c) \u2014 Legal obligation (GDPR Art. 32; HIPAA) |
| Platform improvement analytics | Article 6(1)(f) \u2014 Legitimate interests (using de-identified data only) |
| Marketing communications | Article 6(1)(a) \u2014 Consent (opt-in only) |
| Compliance with legal obligations | Article 6(1)(c) \u2014 Legal obligation |
| Research and public health | Article 9(2)(j) \u2014 Research / public health (de-identified data only) |

Where we rely on legitimate interests, you may object to this processing at any time (see Section 14).

## 5. Protected Health Information (PHI) and HIPAA

### 5.1 What Is PHI

Under HIPAA, \u201CProtected Health Information\u201D (PHI) means any individually identifiable health information we create, receive, maintain, or transmit in electronic, paper, or oral form. PHI includes names, dates, geographic data, phone numbers, account numbers, biometric identifiers, medical record numbers, and health or treatment information linked to a specific individual.

### 5.2 Business Associate Agreements

MediVault is a Business Associate under HIPAA. When we process PHI on behalf of a Covered Entity (a healthcare provider or health plan), we do so under a **Business Associate Agreement (BAA)**. The BAA governs:

- Permitted uses and disclosures of PHI
- Our obligation to implement HIPAA-required safeguards
- Our obligation to report breaches and security incidents
- Requirements on our subcontractors who access PHI

We will not process PHI for a Covered Entity without a fully executed BAA in place.

### 5.3 Minimum Necessary Standard

We apply HIPAA\u2019s minimum necessary standard to all PHI access. Our role-based access control system enforces this: each user account is configured with the minimum permissions required for their specific job function. Access to PHI is logged and reviewed quarterly.

### 5.4 Patient Rights Under HIPAA

If you are a patient whose PHI is stored on MediVault, you have the following rights, exercisable through the healthcare provider who is your Covered Entity:

- **Right to Access:** Receive a copy of your health records, typically within 30 days.
- **Right to Amend:** Request corrections to inaccurate or incomplete records.
- **Right to Accounting of Disclosures:** Request a list of who we have disclosed your PHI to, other than for treatment, payment, or healthcare operations.
- **Right to Request Restrictions:** Ask your provider to limit how they use or disclose your PHI.
- **Right to Confidential Communications:** Request that your provider communicate with you in a specific way or at a specific location.
- **Right to Breach Notification:** Be informed if your PHI is involved in a reportable breach.

## 6. Data De-identification Methodology

MediVault de-identifies patient data for platform analytics, performance improvement, and research. We use the **HIPAA Safe Harbor method** (45 CFR \u00a7 164.514(b)(2)), which requires removal of all 18 categories of identifiers specified by HHS, including:

Names \u2014 Geographic subdivisions smaller than state \u2014 Dates (except year) \u2014 Phone numbers \u2014 Fax numbers \u2014 Email addresses \u2014 Social Security numbers \u2014 Medical record numbers \u2014 Health plan beneficiary numbers \u2014 Account numbers \u2014 Certificate/license numbers \u2014 VINs \u2014 IP addresses \u2014 Device identifiers \u2014 Web URLs \u2014 Biometric identifiers \u2014 Full-face photographs \u2014 Any unique identifying number or code

Once de-identified, data is no longer PHI and is not subject to HIPAA restrictions. We use de-identified data for:

- Platform performance monitoring and improvement
- Aggregate benchmarking reports provided to providers
- Clinical research (shared under data use agreements only)

**Re-identification prohibition.** MediVault does not attempt to re-identify de-identified data, and our agreements with research partners include explicit re-identification prohibitions.

**Periodic risk assessments.** We conduct annual re-identification risk assessments to verify that our de-identification processes remain effective as the size and composition of our data corpus changes.

## 7. How We Use Your Information

We use the information we collect for the following purposes:

**Platform operations:** Providing, maintaining, and improving the MediVault platform, including processing and storing patient records, managing user accounts, and enabling integrations.

**Security and compliance:** Maintaining HIPAA-required audit logs, detecting unauthorized access, responding to security incidents, and meeting our legal obligations.

**Analytics and improvement:** Using de-identified and aggregated data to understand how the platform is used, identify bugs and performance issues, and develop new features.

**Communications:** Sending administrative messages (account notices, security alerts, policy updates) and, with consent, marketing communications.

**Legal purposes:** Responding to legal process, enforcing our agreements, and protecting our rights and the rights of users.

We do not use PHI to market products or services to patients. We do not sell PHI or personal data.

## 8. Cookies and Tracking Technologies

The MediVault platform uses the following types of cookies and tracking technologies:

| Type | Purpose | Storage Period |
|---|---|---|
| Session cookies | Authentication and session management | Session only |
| Security cookies | CSRF protection, bot detection | 24 hours |
| Preference cookies | UI settings, language preferences | 12 months |
| Analytics cookies | De-identified usage analytics | 13 months |

We do not use advertising cookies or behavioral tracking cookies.

**EU users:** We obtain consent for non-essential cookies via our cookie consent mechanism. You may withdraw consent at any time through our cookie settings page.

**All users:** You can control cookies through your browser settings. Disabling session and security cookies will prevent you from logging into the platform.

## 9. How We Share Your Information

**We do not sell your personal information or PHI.** We do not share PHI with advertisers, data brokers, or non-healthcare third parties.

We may share your information in the following circumstances:

### 9.1 Healthcare Operations

We share PHI with other healthcare providers for treatment purposes, and with health plans for payment purposes, as permitted by HIPAA without additional consent.

### 9.2 Service Providers

We share data with service providers who help us operate the platform. All service providers with access to PHI are required to execute BAAs. All service providers with access to EU personal data are required to execute Data Processing Agreements and Standard Contractual Clauses where applicable.

Our key service providers include: cloud infrastructure (US-based, HIPAA-compliant), email delivery, payment processing, identity verification, and customer support software. A complete list of service providers with access to personal data is available on request.

### 9.3 Legal Obligations

We may disclose information as required by applicable law, court order, subpoena, or government request. We will notify you of any such request to the extent legally permitted.

### 9.4 Public Health and Safety

HIPAA permits us to disclose PHI without authorization for public health activities (e.g., disease surveillance), required reports to government authorities (e.g., mandated reporting of abuse), and to avert a serious threat to health or safety.

### 9.5 Business Transfers

If MediVault is acquired, merged, or undergoes a change of control, your information may be transferred to the successor entity. We will notify you before your information becomes subject to a materially different privacy policy.

## 10. International Data Transfers

MediVault transfers personal data between the United States and the European Union. The legal mechanisms governing these transfers are:

**EU \u2192 US transfers:** Governed by Standard Contractual Clauses (SCCs) as approved by the European Commission (Decision 2021/914). We have implemented the following supplementary technical measures:
- AES-256 encryption at rest for all PHI and personal data
- TLS 1.3 encryption for all data in transit
- Pseudonymization of patient identifiers before transfer wherever clinically feasible
- Role-based access controls limiting US-side access to authorized personnel with documented need
- Data access logs reviewed by our EU Data Protection Officer quarterly

**US \u2192 EU transfers:** Data flows from US operations to our Berlin engineering team are governed by the same SCC framework and supplementary measures. Our Berlin team processes data solely for platform development, security, and EU client support purposes.

All cross-border data flows are documented in our **Records of Processing Activities (RoPA)**, maintained pursuant to GDPR Article 30. A summary of the RoPA is available to EU data subjects on request.

## 11. Data Retention Schedule

We retain different categories of data for different periods, based on legal requirements and operational necessity:

| Data Category | Retention Period | Basis |
|---|---|---|
| Account data (providers/admins) | Duration of account + 90 days post-closure | Contractual |
| Patient medical records | Per applicable state law (typically 7\u201310 years from last treatment; 10 years for pediatric records until the patient reaches 21) | State medical records laws |
| HIPAA Privacy Rule records | 6 years from creation, or 6 years from date last in effect | 45 CFR \u00a7 164.530(j) |
| HIPAA Security Rule records | 6 years from creation | 45 CFR \u00a7 164.316(b) |
| Audit logs | 6 years | HIPAA + GDPR Art. 5(2) |
| Security incident records | 6 years | HIPAA |
| BAAs | Duration of relationship + 6 years | HIPAA |
| EU personal data | See corresponding category above, subject to shorter GDPR retention where applicable | GDPR Art. 5(1)(e) |
| De-identified analytics data | Indefinite (not subject to deletion requests) | Not PHI; not personal data |
| Marketing consent records | Duration of consent + 3 years | GDPR accountability |

When data reaches the end of its retention period, we delete it using NIST SP 800-88 media sanitization guidelines.

## 12. Data Security

We implement administrative, technical, and physical safeguards as required by the HIPAA Security Rule (45 CFR Part 164, Subpart C) and GDPR Article 32. Our security program includes:

**Encryption:** AES-256 encryption at rest for all PHI and personal data. TLS 1.3 for all data in transit. Encrypted backups stored in geographically separate facilities.

**Access controls:** Multi-factor authentication required for all user accounts. Role-based access controls (RBAC) enforcing minimum necessary access. Privileged access management for administrative functions. Access reviews conducted quarterly.

**Monitoring and audit:** Real-time security monitoring with automated alerts. HIPAA-required audit logs for all PHI access and modification. Annual third-party penetration testing. Quarterly vulnerability scans. SOC 2 Type II audit conducted annually.

**Physical security:** Data stored in HIPAA-compliant, SOC 2-certified data centers with physical access controls, environmental controls, and 24/7 monitoring.

**Workforce:** Annual HIPAA training for all staff with access to PHI. Background checks for employees and contractors with PHI access. Confidentiality agreements for all workforce members.

**Incident response:** Written incident response plan tested annually. Dedicated security response team. Documented breach assessment procedures.

No security system is impenetrable. If you believe your account has been compromised, contact us immediately at [EMAIL].

## 13. Breach Notification

MediVault operates a dual-track breach notification process designed for our US-EU operational structure.

### 13.1 Internal Escalation (All Breaches)

Any potential breach or security incident, regardless of where discovered, must be reported to our Security Response Team within **24 hours** of discovery. The Security Response Team immediately notifies both the HIPAA Security Officer and the EU Data Protection Officer, activating parallel assessment tracks.

### 13.2 GDPR Track (EU Personal Data)

If a breach involves EU residents\u2019 personal data:

- We notify the relevant EU supervisory authority **within 72 hours** of becoming aware of the breach (GDPR Article 33).
- We notify affected EU individuals **without undue delay** if the breach is likely to result in a high risk to their rights and freedoms (GDPR Article 34).
- The notification will include: the nature of the breach, categories and approximate number of affected individuals, contact details of the DPO, likely consequences, and measures taken or proposed.

If we cannot complete the full investigation within 72 hours, we provide an initial notification with a commitment to supplement it.

### 13.3 HIPAA Track (PHI)

If a breach involves unsecured PHI:

- We notify **affected individuals within 60 days** of discovery of the breach (45 CFR \u00a7 164.404).
- For breaches affecting **500 or more individuals** in a state or jurisdiction, we also notify **prominent media outlets** in that state/jurisdiction within 60 days.
- All reportable breaches are submitted to the **HHS Secretary** (via the HHS Breach Reporting Portal) no later than 60 days after discovery. Breaches affecting fewer than 500 individuals are reported annually.
- The HIPAA breach notice will include: what happened, the types of information involved, steps individuals can take to protect themselves, what we are doing to investigate and address the breach, and contact information.

### 13.4 Breach Assessment

We treat all potential breaches with full seriousness. Our breach risk assessment follows the four-factor test under HIPAA: nature and extent of PHI involved, who accessed or could have accessed it, whether the PHI was actually acquired or viewed, and extent to which risk has been mitigated.

## 14. Your Privacy Rights

The rights available to you depend on where you live and which law applies to your data.

### 14.1 Rights Under GDPR (EU Residents)

If you are located in the European Union, you have the following rights under GDPR:

**Right of Access (Article 15).** You have the right to obtain confirmation of whether we process your personal data, and if so, a copy of that data along with information about how it is processed.

**Right to Rectification (Article 16).** You have the right to have inaccurate personal data corrected without undue delay.

**Right to Erasure (\u201CRight to be Forgotten\u201D) (Article 17).** You have the right to request deletion of your personal data where: it is no longer necessary for the purposes for which it was collected; you withdraw consent and there is no other legal basis; you object to processing based on legitimate interests and there are no overriding legitimate grounds; the data has been unlawfully processed; or deletion is required by law. This right does not apply where we are required to retain data by HIPAA or other legal obligations.

**Right to Restriction of Processing (Article 18).** You have the right to request that we restrict how we use your data in certain circumstances.

**Right to Data Portability (Article 20).** You have the right to receive your personal data in a structured, commonly used, machine-readable format, and to transmit that data to another controller where technically feasible.

**Right to Object (Article 21).** You have the right to object to processing based on legitimate interests. You also have an unconditional right to object to processing for direct marketing purposes.

**Rights Related to Automated Decision-Making (Article 22).** You have the right not to be subject to decisions based solely on automated processing that significantly affect you. MediVault does not make significant automated decisions about individuals without human review.

**Right to Lodge a Complaint.** You have the right to lodge a complaint with your local supervisory authority. A list of EU supervisory authorities is available at https://edpb.europa.eu/about-edpb/board/members.

To exercise your GDPR rights, contact our DPO at [EMAIL]. We will respond within one month (extendable by two months for complex requests).

### 14.2 Rights Under HIPAA (Patients)

See Section 5.4 for a full description of HIPAA patient rights. To exercise these rights, contact the healthcare provider who is your Covered Entity. MediVault can assist providers in facilitating these requests.

### 14.3 Marketing Opt-Out (All Users)

You may opt out of marketing communications at any time by clicking \u201Cunsubscribe\u201D in any marketing email, or by contacting us at [EMAIL]. Opting out of marketing does not affect administrative or service-related communications.

## 15. California Residents (CCPA/CPRA)

If you are a California resident, you have the following rights under the California Consumer Privacy Act (as amended by the CPRA):

**Right to Know.** You have the right to request information about the categories and specific pieces of personal information we collect, the sources from which we collect it, the business or commercial purpose for collecting it, and the categories of third parties we share it with.

**Right to Delete.** You have the right to request deletion of personal information we have collected, subject to certain exceptions (including our legal retention obligations under HIPAA).

**Right to Correct.** You have the right to request correction of inaccurate personal information.

**Right to Opt Out of Sale or Sharing.** We do not sell personal information, and we do not share personal information for cross-context behavioral advertising. No opt-out is needed, but you can confirm this by contacting us at [EMAIL].

**Right to Limit Use of Sensitive Personal Information.** We use sensitive personal information (including health information) only for the purposes necessary to provide our services. We do not use it for any secondary purposes that would trigger CPRA opt-out rights.

**Non-Discrimination.** We will not discriminate against you for exercising your CCPA/CPRA rights.

To exercise these rights, contact us at [EMAIL] or call [PHONE NUMBER]. We will verify your identity before processing requests. We will respond within 45 days (extendable by an additional 45 days where reasonably necessary).

## 16. Children\u2019s Privacy

MediVault does not knowingly collect personal information from children under 13 through direct sign-up. Our platform is designed for use by licensed healthcare providers, not by patients directly.

Patient records for minors are managed by healthcare providers as Covered Entities under HIPAA. Parental or guardian consent for minor patients is the responsibility of the Covered Entity. MediVault processes PHI for minor patients solely as a Business Associate under the provider\u2019s direction.

If you believe we have inadvertently collected personal information from a child under 13 outside of the healthcare context, please contact us at [EMAIL] and we will delete it promptly.

## 17. Changes to This Policy

We may update this Privacy Policy from time to time to reflect changes in our practices, technology, legal requirements, or other factors.

**Material changes** (changes that significantly affect how we process your personal data or that affect your rights) will be communicated to you at least **30 days** before they take effect, via email and/or prominent notice on the Platform.

**For EU residents:** Where a material change affects processing based on consent, we will request fresh consent before the change takes effect.

The updated Policy will be posted at [LINK]. The \u201CLast Updated\u201D date at the top of this Policy indicates when it was last revised. Your continued use of the Platform after the effective date of a change constitutes your acceptance of the updated Policy.

## 18. Contact Us

If you have questions about this Privacy Policy, our privacy practices, or your rights, please contact us:

**HIPAA Privacy Officer**
MediVault, Inc.
Email: [EMAIL]
Phone: [PHONE NUMBER]
Mailing Address: [Mailing Address]

**Data Protection Officer (GDPR)**
MediVault GmbH (Berlin)
Email: [EMAIL]
Mailing Address: [EU Mailing Address]

**For EU residents:** You may also contact us in the language of your EU member state. Responses will be provided in the language of your request where feasible.

---

*This Privacy Policy was last updated on [Effective Date].*

---

*Prepared by Lavern \u2014 Multi-Agent Legal Design System*
*This document was produced with AI assistance and reviewed by multi-agent verification. It does not constitute legal advice. For HIPAA compliance, EU regulatory filings, or any matter involving binding legal obligations, please verify with qualified legal professionals.*
`;

// ── Cloud MSA Demo Data ───────────────────────────────────────────────────

function buildCloudMSADemoData(sessionId: string): DeliveryData {
  return {
    sessionId,
    status: 'Complete',

    documentTitle: 'Cloud MSA \u2014 Negotiation Briefing',
    executiveSummary:
      'A negotiation briefing and set of redlined clauses has been prepared for a Cloud Master Services Agreement. ' +
      'The unlimited liability clause in \u00a78.3 is a show-stopper \u2014 the agreement as drafted would expose the client to consequential damages with no ceiling. ' +
      'The indemnification clause in \u00a712 uses \u201Carising in connection with\u201D language broad enough to shift the vendor\u2019s own product liability to the client. ' +
      'The SLA termination right has no cure period, creating a hair-trigger termination mechanism that vendors will not accept and courts may not enforce. ' +
      'All three issues are standard commercial negotiating points. Friday signing is achievable if redlines are sent today. Cost: $5.14 of $10.00 budget.',

    keyChanges: [
      {
        title: '\u26D4 Liability \u2014 Unlimited Exposure',
        before: 'Section 8.3 contained no limitation of liability. Either party could be held liable for all damages \u2014 including consequential, indirect, and punitive damages \u2014 with no ceiling.',
        after: 'Mutual exclusion of consequential damages. Aggregate liability capped at 12 months\u2019 fees. Carve-outs for IP indemnity, death/personal injury, fraud, and confidentiality breach \u2014 matching market standard.',
      },
      {
        title: '\u26D4 Indemnity \u2014 Overbroad Trigger',
        before: 'Section 12 required client to indemnify vendor for any third-party claim \u201Carising in connection with\u201D client\u2019s use of the service. This language is broad enough to cover claims arising from the vendor\u2019s own product defects.',
        after: 'Client indemnity narrowed to: (a) wilful misconduct or gross negligence; (b) breach of data use restrictions; (c) uploaded content infringing third-party IP. Vendor indemnity added for IP infringement by the service itself. Bilateral structure now mirrors market standard.',
      },
      {
        title: '\u26A0\uFE0F SLA \u2014 No Cure Period',
        before: 'Section 14.2 allowed termination for cause after any single month below the uptime SLA target. No cure period, no minimum failure threshold. Hair-trigger termination right that vendors will resist at contract review.',
        after: 'Termination right now requires three consecutive months below target, or four in any rolling 12-month period. 30-day written cure notice required before terminating. Service credit schedule added for failures that don\u2019t reach the termination threshold.',
      },
    ],

    dimensions: [
      { dimension: 'Liability Protection', before: 0.5, after: 4.2, delta: 3.7 },
      { dimension: 'Indemnity Balance', before: 0.8, after: 4.0, delta: 3.2 },
      { dimension: 'SLA Enforceability', before: 1.5, after: 3.8, delta: 2.3 },
      { dimension: 'Negotiation Readiness', before: 1.0, after: 4.3, delta: 3.3 },
      { dimension: 'Market Alignment', before: 1.2, after: 4.1, delta: 2.9 },
    ],

    finalOutput: CLOUDMSA_NEGOTIATION_DOCUMENT,

    debateResolutions: [
      {
        topic: 'Liability cap amount \u2014 12 months vs. 24 months',
        resolution: '12-month cap adopted as opening position; 24 months designated as concession. Market standard survey confirmed 12 months is the median for SaaS agreements of this value. 24 months offered as fallback preserves negotiating room without materially increasing risk.',
        winningPosition: 'Commercial Counsel\u2019s 12-month opening position prevailed over Risk Assessor\u2019s preference for 24 months. The Risk Assessor\u2019s argument was valid but tactically weaker \u2014 opening at 24 months signals willingness to accept higher exposure.',
        evidenceWeight: 'Bonterms Cloud Services Agreement (2023 benchmark), LegalSifter commercial contract dataset (n=1,240): 12-month cap in 68% of SaaS agreements, 24-month in 19%, unlimited in 13%.',
        escalationNeeded: false,
        confidence: 0.91,
      },
      {
        topic: 'Indemnity trigger language \u2014 \u201Carising in connection with\u201D vs. enumerated triggers',
        resolution: 'Enumerated triggers adopted. \u201CArising in connection with\u201D replaced with specific list: wilful misconduct, data use breach, uploaded IP infringement. Bilateral structure added so vendor also indemnifies client for service IP claims.',
        winningPosition: 'Liability Specialist\u2019s enumerated-triggers approach prevailed over Contract Specialist\u2019s argument that \u201Carising in connection with\u201D is industry standard. Both positions were legally valid; the decision turned on risk allocation preference for a buyer-side client.',
        evidenceWeight: 'Three appellate decisions cited where \u201Carising in connection with\u201D was applied to shift vendor product-defect liability to customer. Buyer-side risk allocation is the appropriate default for this engagement.',
        escalationNeeded: false,
        confidence: 0.93,
      },
    ],

    gateDecisions: [
      { gateType: 'ethics critical', decision: 'approve', summary: 'Two RED findings (unlimited liability, overbroad indemnity) and one HIGH finding (SLA cure period) approved for redline. Client must be informed that signing without these changes is not recommended.' },
      { gateType: 'final delivery', decision: 'approve', summary: 'Negotiation briefing and redlined clauses verified. Liability cap analysis, indemnity restructure, and SLA cure period all validated against market benchmarks.' },
    ],

    verificationChecks: [
      { type: 'liability-analysis', passed: true, label: 'Liability Cap Market Benchmark', score: 0.91 },
      { type: 'indemnity-structure', passed: true, label: 'Indemnity Bilateral Structure', score: 0.93 },
      { type: 'sla-enforceability', passed: true, label: 'SLA Enforceability', score: 0.88 },
      { type: 'legal-accuracy', passed: true, label: 'Legal Accuracy', score: 0.94 },
    ],

    narrative: [
      {
        phase: 'Analysis',
        heading: 'Five specialists review a cloud MSA under Friday deadline',
        body: 'The engagement opened with a Friday signing deadline and three red flags identified within the first pass. Commercial Counsel spotted the unlimited liability clause immediately: Section 8.3 contained no cap whatsoever, exposing the client to unlimited consequential damages. Liability Specialist flagged the indemnity language in Section 12 \u2014 \u201Carising in connection with\u201D is one of the broadest possible triggers, and three appellate decisions were on file where the same language shifted vendor product-defect liability to the customer. The Contract Specialist noted the SLA clause had no cure period, creating a theoretical hair-trigger termination right that would likely produce resistance from the vendor rather than acceptance.',
        agents: ['Commercial Counsel', 'Liability Specialist', 'Contract Specialist', 'Risk Assessor', 'Synthesis Editor'],
      },
      {
        phase: 'Debate',
        heading: 'The cap amount debate \u2014 12 months or 24?',
        body: 'The first debate turned on strategy, not law. Risk Assessor argued for a 24-month liability cap as the opening position: start higher, leave room to negotiate down to 12. Commercial Counsel countered that opening at 24 months signals willingness to accept above-market exposure \u2014 the vendor\u2019s lawyers would read it as inexperience. Market data supported Commercial Counsel: 68% of comparable SaaS agreements use a 12-month cap. The debate resolved in favor of the 12-month opening, with 24 months designated as the concession if the vendor pushes back. A tactical choice, not a legal one.',
        agents: ['Commercial Counsel', 'Risk Assessor'],
        highlight: 'This debate illustrates the difference between legal risk and negotiation strategy. The agents worked through both dimensions rather than treating them as the same question.',
      },
      {
        phase: 'Ethics Gate',
        heading: 'Signing advisory',
        body: 'The ethics gate was triggered by the unlimited liability finding. The system flagged that delivering a work product without an explicit client advisory \u2014 \u201Cdo not sign this as written\u201D \u2014 would be inconsistent with the firm\u2019s duty of candor. The negotiation briefing was structured accordingly: the bottom-line recommendation appears in a call-out box before any analysis, not buried in a section.',
        agents: [],
        highlight: 'The brief leads with the recommendation, not the analysis. Clients under time pressure need to know what to do before they read why.',
      },
      {
        phase: 'Drafting',
        heading: 'Redlining three clauses in parallel',
        body: 'Liability Specialist drafted the Section 8 replacement, inserting the mutual consequential damages exclusion and the 12-month aggregate cap with standard carve-outs. Contract Specialist restructured Section 12 into bilateral form: vendor indemnifies client for service IP claims; client indemnifies vendor for the three enumerated triggers only. The SLA clause was the most technically involved \u2014 the cure period, the three-consecutive-month threshold, the four-in-twelve alternative, and the service credit schedule all needed to interlock cleanly.',
        agents: ['Liability Specialist', 'Contract Specialist'],
      },
      {
        phase: 'Verification',
        heading: 'Market benchmark and legal accuracy checks',
        body: 'Four verification checks ran: liability cap market benchmark (12-month cap confirmed as market standard for this contract value band), indemnity bilateral structure (confirmed symmetrical, no hidden one-sidedness in the carve-outs), SLA enforceability (cure period and threshold verified against case law on termination-for-cause requirements), and overall legal accuracy. All four passed.',
        agents: [],
      },
      {
        phase: 'Delivery',
        heading: 'Ready to send',
        body: 'The negotiation briefing leads with the bottom-line recommendation and framing language the client can use with the vendor. The redlined clauses follow in Part II. The signing checklist closes with four steps the client should complete before Friday. All work product is ready for client review and, if appropriate, independent counsel sign-off.',
        agents: [],
      },
    ],

    debate: { findingsCount: 6, challengesCount: 2, resolutionsCount: 2, unresolvedCount: 0 },
    verification: {
      resultsCount: 4,
      passed: 4,
      failed: 0,
      confidence: 0.92,
      breakdown: [
        { type: 'self', passed: true, confidence: 0.91, label: 'Liability Benchmark' },
        { type: 'cross', passed: true, confidence: 0.93, label: 'Indemnity Structure' },
        { type: 'score', passed: true, confidence: 0.94, label: 'Legal Accuracy' },
      ],
    },
    cost: { accumulated: 5.14, budget: 10.00, remaining: 4.86 },
    agentPerformance: [
      { name: 'Commercial Counsel', role: 'commercial-counsel', findingsPosted: 2, challengesSurvived: 1, avgConfidence: 0.91 },
      { name: 'Liability Specialist', role: 'liability-specialist', findingsPosted: 2, challengesSurvived: 0, avgConfidence: 0.93 },
      { name: 'Contract Specialist', role: 'contract-specialist', findingsPosted: 1, challengesSurvived: 0, avgConfidence: 0.88 },
      { name: 'Risk Assessor', role: 'risk-assessor', findingsPosted: 1, challengesSurvived: 0, avgConfidence: 0.89 },
      { name: 'Synthesis Editor', role: 'synthesis-editor', findingsPosted: 0, challengesSurvived: 0, avgConfidence: 0 },
    ],
    eventCount: 52,

    limitations: {
      flaggedForHumanReview: [
        'Governing law and jurisdiction clause not reviewed \u2014 verify against client\u2019s entity structure',
        'Data processing addendum (DPA) not in scope \u2014 review separately before signing',
        'Payment and renewal terms not reviewed in this engagement',
      ],
      confidenceIntervals: '',
      disclaimer: 'This briefing was produced by an AI system with multi-agent verification. It does not constitute legal advice. For a commercial agreement of this significance, we recommend independent counsel review before signing.',
    },

    nextSteps: [
      { label: 'Send redlines today', description: 'Email the three redlined clauses to the vendor\u2019s counsel with the suggested cover language from the briefing. The vendor needs time to review before Friday.', kind: 'action' },
      { label: 'Do not accept \u201Cfix it in an amendment\u201D', description: 'If the vendor suggests deferring the liability cap or indemnity fix to a side letter or amendment, decline. Amendment obligations are frequently not fulfilled. Core commercial terms must be in the base agreement.', kind: 'watchout' },
      { label: 'Confirm SLA measurement methodology', description: 'Before signing, confirm how uptime is measured (vendor-reported vs. independent monitoring), what counts as scheduled maintenance, and how disputes about SLA calculations are resolved.', kind: 'action' },
      { label: 'Review the data processing addendum', description: 'The DPA was not in scope for this engagement. If the service processes personal data, the DPA must be reviewed for GDPR and CCPA compliance before signing.', kind: 'watchout' },
      { label: 'Schedule post-signing review', description: 'Set a calendar reminder to review SLA performance at the 90-day mark. If the vendor misses the uptime target in the first month, document it immediately \u2014 you\u2019ll need the record if the three-consecutive-month threshold is ever reached.', kind: 'schedule' },
    ],
  };
}

// ── Cloud MSA Negotiation Document ────────────────────────────────────────

const CLOUDMSA_NEGOTIATION_DOCUMENT = `# Cloud MSA \u2014 Negotiation Briefing

**DRAFT \u2014 For Client Review**  \u00b7  *Commercial contract review by Lavern*
*Prepared: [Date]*  \u00b7  *Signing deadline: Friday*  \u00b7  *Priority: Critical*

---

| Issue | Section | Severity | Status |
|-------|---------|----------|--------|
| Unlimited liability \u2014 no cap defined | \u00a78.3 | **CRITICAL** | Redlined |
| Indemnity scope \u2014 overbroad trigger | \u00a712 | **CRITICAL** | Redlined |
| SLA termination \u2014 no cure period | \u00a714.2 | **HIGH** | Redlined |

> **Bottom line:** Do not sign \u00a78.3 or \u00a712 as written. The unlimited liability exposure in \u00a78.3 is a show-stopper \u2014 the vendor could hold you liable for consequential damages with no ceiling. Section 12 uses \u201Carising in connection with\u201D language broad enough to shift the vendor\u2019s own product liability to you. Both are standard negotiating points that well-counseled buyers raise routinely. Friday is achievable if you send the redlines today.

---

## Part I \u2014 Negotiation Brief

### 1. Recommended Opening Position

Send the vendor all three redlines simultaneously. Frame them as standard commercial positions, not as objections to the deal. The framing matters: buyers who raise these points routinely get them accepted, especially when they signal they are otherwise ready to sign.

**Suggested cover language:**
> \u201CWe\u2019re ready to move forward. Three commercial points to resolve first. These are standard buyer positions and we\u2019re happy to discuss alternatives that work for both sides.\u201D

### 2. Issue-by-Issue Analysis

#### Issue 1: \u00a78.3 \u2014 Unlimited Liability

**What the clause says (paraphrased):** Each party is liable for all damages arising from breach of this agreement, with no limitation.

**Why this is a show-stopper:** A SaaS vendor serving many customers is a prime target for consequential damage claims \u2014 data loss, business interruption, downstream customer losses. Without a cap, a single incident could expose you to liability that dwarfs the value of the contract. More importantly, the lack of a cap makes this agreement difficult to insure: cyber liability and E&O policies routinely exclude uncapped indemnity obligations.

**Our position:** A mutual liability cap at 12 months of fees paid in the preceding 12 months. This is the market standard \u2014 present in 68% of comparable SaaS agreements. If the vendor pushes back, offer 24 months as a concession.

**Carve-outs we accept (on both sides):** Death or personal injury; fraud or wilful misconduct; breach of confidentiality; IP infringement indemnity obligations.

#### Issue 2: \u00a712 \u2014 Indemnification Scope

**What the clause says (paraphrased):** You will defend, indemnify, and hold harmless the vendor from any third-party claim \u201Carising in connection with\u201D your use of the service.

**Why this is dangerous:** Three appellate decisions are on file where identical language was applied to shift vendor product-defect liability to the customer. The plaintiff only needed to show a causal connection between the customer\u2019s use and their injury \u2014 the vendor\u2019s underlying product failure was treated as irrelevant to the indemnity obligation. You cannot accept this.

**Our position:** Narrow the trigger to three specific situations: (a) your wilful misconduct or gross negligence; (b) your breach of the data use restrictions; (c) content you upload that infringes a third party\u2019s IP. Add a vendor indemnity for IP infringement by the service itself. This bilateral structure is standard.

#### Issue 3: \u00a714.2 \u2014 SLA Termination Rights

**What the clause says (paraphrased):** If the vendor fails to meet monthly uptime targets, you may terminate with notice.

**What\u2019s missing:** No cure period. No minimum failure threshold. As drafted, a single month below target \u2014 even by 0.1% \u2014 technically triggers termination. Vendors will resist this at review and may walk away from a deal over it, even though the underlying issue is easy to fix.

**Our position:** Three consecutive months below the SLA target (or four in any rolling 12-month period) triggers a 30-day written cure notice. If the vendor achieves the uptime target during the cure period, the termination right for that period is waived. Service credits apply for failures that don\u2019t meet the termination threshold.

---

## Part II \u2014 Redlined Clauses

The following are our proposed replacement clauses.

### Section 8 \u2014 Limitation of Liability [REVISED]

**8.1 Mutual Exclusion of Consequential Damages**

Neither party shall be liable to the other for any indirect, incidental, special, exemplary, punitive, or consequential damages, including loss of revenue, loss of profits, loss of business, loss of data, or loss of goodwill, arising out of or related to this Agreement, even if such party has been advised of the possibility of such damages.

**8.2 Aggregate Liability Cap**

The aggregate liability of each party to the other for any and all claims arising out of or related to this Agreement shall not exceed the total fees paid or payable by Customer to Vendor in the twelve (12) calendar months immediately preceding the event giving rise to the claim.

**8.3 Exceptions**

The limitations in Sections 8.1 and 8.2 shall not apply to:

- **(a)** Either party\u2019s indemnification obligations under Section 12 for third-party IP infringement claims;
- **(b)** Damages arising from death or personal injury caused by a party\u2019s negligence or wilful act;
- **(c)** Fraud or wilful misconduct by either party;
- **(d)** Either party\u2019s material breach of the confidentiality obligations in Section 9.

---

### Section 12 \u2014 Indemnification [REVISED]

**12.1 Vendor Indemnification**

Vendor will defend, indemnify, and hold Customer harmless from and against any third-party claim, suit, or proceeding alleging that the Service, as provided by Vendor and used in accordance with this Agreement, infringes or misappropriates any patent, copyright, trademark, or trade secret of a third party. This obligation does not apply to claims arising from: (a) Customer\u2019s modification of the Service; (b) combination of the Service with third-party products not provided or approved by Vendor; or (c) Customer\u2019s use of the Service in violation of this Agreement.

**12.2 Customer Indemnification**

Customer will defend, indemnify, and hold Vendor harmless from and against any third-party claim, suit, or proceeding to the extent arising from:

- **(a)** Customer\u2019s wilful misconduct or gross negligence in connection with the use of the Service;
- **(b)** Customer\u2019s material breach of the data use restrictions in Section 6 of this Agreement; or
- **(c)** Content uploaded by Customer that infringes or misappropriates a third party\u2019s intellectual property rights.

For the avoidance of doubt, Customer\u2019s indemnification obligation under this Section does not extend to claims arising from defects in the Service, Vendor\u2019s product design decisions, or Vendor\u2019s own acts or omissions.

**12.3 Procedure**

The indemnifying party\u2019s obligations are conditioned on the indemnified party: (a) providing prompt written notice of the claim; (b) granting the indemnifying party sole control of the defense and settlement (provided that no settlement may impose liability on the indemnified party without its prior written consent); and (c) providing reasonable cooperation at the indemnifying party\u2019s expense.

---

### Section 14 \u2014 Service Level Agreement [REVISED]

**14.1 Uptime Commitment**

Vendor commits to a monthly uptime of 99.5% for the core Service features, measured on a calendar month basis and excluding: (a) scheduled maintenance windows communicated at least 72 hours in advance; (b) downtime caused by Customer\u2019s acts or omissions; and (c) force majeure events.

**14.2 Service Credits**

If Vendor fails to achieve the monthly uptime commitment, Vendor will apply the following credits to Customer\u2019s next invoice:

| Monthly Uptime Achieved | Credit (% of Monthly Fee) |
|------------------------|--------------------------|
| 99.0% \u2013 99.4% | 10% |
| 95.0% \u2013 98.9% | 25% |
| Below 95.0% | 50% |

Service credits are Customer\u2019s sole remedy for SLA failures that do not reach the termination threshold in Section 14.3.

**14.3 Termination Right**

Customer may terminate this Agreement for cause, with no early termination fee and with a pro-rata refund of any prepaid fees for the unused portion of any prepaid term, if:

- Vendor fails to meet the uptime commitment in **three (3) consecutive calendar months**; or
- Vendor fails to meet the uptime commitment in **four (4) or more calendar months** within any rolling 12-month period.

**Cure Period.** Before exercising the termination right, Customer must provide Vendor with written notice of its intent to terminate and a 30-day opportunity to cure. If Vendor achieves the monthly uptime commitment during the entire 30-day cure period, the termination right arising from the failures described in the notice is waived for that notice period (but not for future failures).

---

## Part III \u2014 Signing Checklist

Before signing:

1. **Send the three redlines today.** The vendor needs time to review. Even if they push back, opening the negotiation signals you are commercially prepared.
2. **Do not accept \u201Cwe\u2019ll fix it in an amendment.\u201D** Core commercial terms must be in the base agreement. Side-letter commitments are routinely not fulfilled.
3. **Confirm SLA measurement methodology.** The agreement should specify whether uptime is measured by vendor-reported telemetry or independent monitoring, and how measurement disputes are resolved.
4. **Review the data processing addendum separately.** The DPA was not in scope for this engagement. If the service processes personal data, the DPA requires separate review for GDPR/CCPA compliance.

---

*Prepared by Lavern \u2014 Multi-Agent Legal Design System*
*This briefing does not constitute legal advice. For a commercial agreement of this significance, we recommend independent counsel review before signing.*
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

**DRAFT \u2014 For Client Review**  \u00b7  *IP and classification risk remediation by Lavern*
*Effective Date: [Effective Date]*

---

**PARTIES**

This Agreement is entered into by and between:

**CodeCraft, Inc.**, a Delaware corporation, with its principal place of business at [Address] (\u201CCompany\u201D); and

**[Contractor Name]**, [an individual / a [State] [entity type]], with its principal place of business at [Address] (\u201CContractor\u201D).

---

**RECITALS**

WHEREAS, the Company desires to engage the Contractor to provide software development services; and

WHEREAS, the Contractor desires to provide such services as an independent contractor on the terms and conditions set forth herein;

NOW, THEREFORE, in consideration of the mutual covenants and agreements set forth below, and for other good and valuable consideration, the parties agree as follows:

---

> **Key changes from previous draft:**
> - IP assignment narrowed to \u201CDeliverable Work Product\u201D \u2014 contractor retains pre-existing IP, open-source contributions, and personal projects.
> - Exclusivity requirement removed; fixed hours removed \u2014 reduces misclassification risk under California ABC test.
> - Notice period balanced: 14 days each way (was 7 company / 30 contractor).
> - Liability tiered: 2\u00d7 general cap, 3\u00d7 for IP/confidentiality, uncapped for fraud.

---

## Table of Contents

1. Engagement and Scope
2. Independent Contractor Relationship
3. Deliverables, Acceptance, and Quality Standards
4. Compensation and Payment
5. Intellectual Property
6. Pre-existing IP Schedule
7. Confidentiality and Security
8. Non-Solicitation
9. Termination and Transition
10. Liability and Indemnification
11. Dispute Resolution
12. Representations and Warranties
13. General Provisions

---

## 1. Engagement and Scope

This Developer Services Agreement (\u201CAgreement\u201D) is entered into by CodeCraft, Inc., a Delaware corporation (\u201CCompany\u201D), and the individual or entity identified in the attached Statement of Work (\u201CContractor\u201D).

The Contractor will provide software development services as described in each Statement of Work (\u201CSOW\u201D) issued under this Agreement. Each SOW forms a part of this Agreement and will specify: the scope of work, deliverables, milestone schedule, acceptance criteria, and compensation.

This Agreement governs all engagements between the parties from its Effective Date unless and until superseded by a fully executed replacement agreement. In the event of conflict between the terms of this Agreement and an SOW, the SOW controls for the subject matter of that SOW only.

## 2. Independent Contractor Relationship

The Contractor is an independent contractor. The Contractor is not an employee, agent, joint venturer, or partner of the Company. This Agreement does not create an employment relationship.

### 2.1 Indicators of Independent Contractor Status

The following provisions are included to support an accurate classification under applicable law, including the California ABC test, IRS common law factors, and applicable federal and state misclassification standards. The parties intend these provisions to reflect the genuine nature of their relationship.

- **Schedule flexibility.** The Contractor determines when, where, and how to perform work, subject only to agreed milestone deadlines. The Company does not set or track work hours.
- **No exclusivity.** The Contractor is free to provide services to other clients concurrently with this engagement, provided there is no actual conflict of interest (see Section 7.3).
- **Own tools and environment.** The Contractor may use their own development hardware, software, and environment. Company-provided access credentials and systems are available for project purposes but their use is not mandatory.
- **Tax responsibility.** The Contractor is solely responsible for all federal, state, and local income taxes, self-employment taxes, and other tax obligations arising from compensation paid under this Agreement. The Company will issue Form 1099-NEC for annual payments of $600 or more.

### 2.2 No Benefits

The Company does not provide the Contractor with employee benefits, including health insurance, retirement benefits, paid time off, stock options, or expense reimbursement except as explicitly agreed in an SOW.

### 2.3 Contractor Acknowledgment

The Contractor acknowledges that: (a) they have the right to enter into this Agreement; (b) this Agreement does not conflict with any other contract or obligation by which the Contractor is bound; and (c) they are not currently subject to any non-compete agreement that would restrict their performance of services for the Company.

## 3. Deliverables, Acceptance, and Quality Standards

### 3.1 Deliverables

The Contractor will deliver software code, documentation, designs, and other materials as specified in each SOW (\u201CDeliverables\u201D). All Deliverables must:

- Conform to the specifications, acceptance criteria, and technical standards set out in the applicable SOW
- Pass automated test suites as specified in the SOW (minimum code coverage as specified)
- Pass code review by the Company\u2019s engineering team (typically within 5 business days of submission)
- Be free of known critical and high-severity security vulnerabilities at the time of delivery
- Include documentation as specified in the SOW (inline code documentation, README updates, API documentation where applicable)

### 3.2 Acceptance Process

Upon submission of a Deliverable, the Company will review and either:
- **Accept** the Deliverable (triggering the applicable milestone payment), or
- **Reject** with written notice specifying the deficiencies

The Contractor will have **10 business days** to cure deficiencies in a rejected Deliverable. If a Deliverable fails a second review, the parties will meet within 5 business days to agree on a remediation plan.

The Company will not unreasonably withhold or delay acceptance of a Deliverable that substantially conforms to the SOW specifications.

### 3.3 Warranty Period

Following acceptance, the Contractor warrants each Deliverable against material defects in workmanship for **60 days** (the \u201CWarranty Period\u201D). If a material defect is discovered during the Warranty Period, the Contractor will correct it at no additional charge within a reasonable time. This warranty does not cover defects caused by modifications made by the Company after acceptance.

## 4. Compensation and Payment

### 4.1 Rates and Milestones

Compensation for each engagement is set out in the applicable SOW. Compensation may be structured as a fixed fee per milestone, an hourly rate, or a combination.

### 4.2 Invoicing and Payment Terms

The Contractor will submit invoices upon completion and acceptance of each milestone. Payment is due **within 30 calendar days** of the Company\u2019s receipt of a conforming invoice. Invoices must specify: the SOW reference, the milestone or period covered, the amount due, and payment instructions.

### 4.3 Late Payment

Undisputed amounts not paid within 30 days accrue interest at the lesser of **1.5% per month** (18% per annum) or the maximum rate permitted by applicable law, calculated from the due date until the date of payment.

### 4.4 Disputed Invoices

If the Company disputes any portion of an invoice, it will notify the Contractor in writing within 15 days of receipt, specifying the disputed amount and the basis for the dispute. The Company will pay undisputed amounts by the original due date. The parties will use good faith efforts to resolve any dispute within 30 days.

### 4.5 Expenses

The Company will reimburse pre-approved expenses only. The Contractor must obtain written approval before incurring any reimbursable expense and must submit receipts with each invoice.

## 5. Intellectual Property

### 5.1 Definitions

\u201CDeliverable Work Product\u201D means all code, documentation, designs, inventions, works of authorship, and other materials that: (a) are created by the Contractor specifically for the Company in the performance of services under this Agreement, AND (b) are either delivered to the Company as a milestone Deliverable or committed to the Company\u2019s code repositories for the purpose of Company projects.

\u201CPre-existing IP\u201D means intellectual property that the Contractor owned or controlled before the Effective Date of this Agreement, or that is developed by the Contractor independently of this Agreement without use of the Company\u2019s Confidential Information, resources, or equipment.

### 5.2 Assignment of Deliverable Work Product

To the extent any Deliverable Work Product qualifies as a \u201Cwork made for hire\u201D under 17 U.S.C. \u00a7 101, it is hereby designated as such, with the Company as the author. To the extent any Deliverable Work Product does not qualify as a work made for hire (including because independent contractors\u2019 software generally does not under 17 U.S.C. \u00a7 101), the Contractor hereby irrevocably assigns to the Company all right, title, and interest in and to such Deliverable Work Product, including all copyright, patent, trade secret, and other intellectual property rights, worldwide, in perpetuity.

The Contractor agrees to execute any documents and take any actions reasonably requested by the Company to perfect, record, or enforce the Company\u2019s ownership of assigned intellectual property.

### 5.3 Retained Contractor Rights

The Contractor retains all right, title, and interest in:

- **Pre-existing IP**, as identified in the Pre-existing IP Schedule (Section 6) and updated as required
- **General programming knowledge**, methodologies, algorithms, techniques, and know-how of general applicability (not specific to the Company\u2019s products or confidential information)
- **Open-source contributions** to projects listed in the Pre-existing IP Schedule, even if developed using skills or knowledge gained during the engagement
- **Personal projects** developed on the Contractor\u2019s own time, using the Contractor\u2019s own resources, that are not related to the Company\u2019s business and do not incorporate Confidential Information

### 5.4 License to Pre-existing IP

If the Contractor incorporates any Pre-existing IP into Deliverable Work Product, the Contractor hereby grants the Company a **perpetual, irrevocable, non-exclusive, royalty-free, worldwide license** to use, copy, modify, distribute, and sublicense such Pre-existing IP solely as incorporated in the Deliverable Work Product.

### 5.5 Moral Rights Waiver

To the extent permitted by applicable law, the Contractor waives any moral rights in Deliverable Work Product in favor of the Company and its successors.

## 6. Pre-existing IP Schedule

The Contractor must complete and deliver this schedule before beginning work under any SOW. The schedule must list any pre-existing intellectual property (owned or licensed by the Contractor) that may be incorporated into or relied upon in delivering work under this Agreement.

**Pre-existing Proprietary IP:**

| Item | Brief Description | Owner | Permitted Use in Deliverables |
|------|------------------|-------|------------------------------|
| [Item name] | [Brief description] | [Contractor / Third Party] | [Describe permitted use] |

**Open-Source Projects (Continuing Contributions):**

| Project Name | License (SPDX identifier) | Contribution Scope |
|---|---|---|
| [Project name] | [e.g., MIT, Apache-2.0] | [General contributions / Feature X only] |

The Contractor must update this schedule promptly if additional Pre-existing IP is incorporated into any Deliverable. The Company\u2019s written approval is required before incorporating any Pre-existing IP that is subject to a copyleft license (GPL, AGPL, LGPL, or similar) into Deliverable Work Product intended for proprietary distribution.

## 7. Confidentiality and Security

### 7.1 Confidential Information

\u201CConfidential Information\u201D means any non-public information disclosed by the Company to the Contractor in connection with this Agreement, including source code, product roadmaps, customer data, business plans, financial information, and the terms of this Agreement.

Confidential Information does not include information that: (a) is or becomes publicly available without the Contractor\u2019s breach; (b) the Contractor independently developed without use of Confidential Information; (c) the Contractor received from a third party without restriction; or (d) was known to the Contractor before disclosure, as evidenced by written records.

### 7.2 Obligations

The Contractor will: (a) use Confidential Information only for purposes of performing services under this Agreement; (b) protect Confidential Information using at least the same care as the Contractor uses for their own confidential information, and no less than reasonable care; (c) not disclose Confidential Information to third parties without prior written consent; and (d) promptly notify the Company of any unauthorized disclosure or suspected breach.

These obligations survive termination of this Agreement for **3 years** for general Confidential Information, and indefinitely for trade secrets under applicable trade secret law.

### 7.3 Conflict of Interest

The Contractor will promptly disclose to the Company any circumstances that could reasonably be perceived as a conflict of interest with the Company\u2019s business. The Contractor will not use Confidential Information to benefit a competitor of the Company.

### 7.4 Security Obligations

The Contractor will: (a) store and access Confidential Information only on password-protected, encrypted devices; (b) not store Confidential Information on personal cloud storage services without prior written approval; (c) notify the Company within 48 hours of any lost or stolen device that contained Confidential Information; and (d) return or certify the destruction of all Confidential Information upon termination.

## 8. Non-Solicitation

During the term of this Agreement and for **12 months** after its termination, the Contractor will not directly solicit for employment any employee of the Company who the Contractor had material interactions with during the engagement.

This provision does not restrict: (a) general solicitation not targeted at Company employees (e.g., public job postings); or (b) responding to an unsolicited approach from a Company employee.

The parties acknowledge that this non-solicitation obligation is narrowly tailored to protect legitimate business interests and does not restrict the Contractor\u2019s ability to perform services for other companies, including competitors of the Company.

## 9. Termination and Transition

### 9.1 Termination for Convenience

Either party may terminate this Agreement or any active SOW with **14 calendar days\u2019 written notice**.

### 9.2 Termination for Cause

Either party may terminate this Agreement or any active SOW immediately upon written notice if the other party: (a) commits a material breach that remains uncured after **10 business days\u2019** written notice specifying the breach in reasonable detail; (b) becomes insolvent, makes an assignment for the benefit of creditors, or is subject to insolvency proceedings; or (c) commits fraud or willful misconduct.

### 9.3 Code Handover Protocol

Upon notice of termination (for any reason), the following transition process applies to each active SOW:

**Days 1\u20135 (Work Completion):**
- The Contractor documents all work in progress with sufficient detail for a replacement developer to continue.
- All open pull requests are completed, reviewed, and either merged or closed with documentation of the reason for closure.
- No new code is introduced that increases handover complexity without written approval.

**Days 6\u201310 (Knowledge Transfer):**
- The Contractor participates in up to 5 hours of knowledge transfer sessions per active SOW, at mutually agreed times.
- The Contractor documents non-obvious design decisions, known issues, and technical debt.

**Days 11\u201314 (Access Revocation):**
- All Company-issued credentials, access tokens, and system access are rotated and revoked.
- The Contractor delivers a final documentation package as specified in the applicable SOW.
- The Contractor certifies in writing that all Confidential Information has been deleted from the Contractor\u2019s devices.

### 9.4 Payment on Termination

On termination, the Company will pay: (a) all completed and accepted milestone payments not yet paid; and (b) a pro-rata portion of the next uncompleted milestone payment, calculated based on documented, accepted work completed through the termination date. No payment will be made for uncompleted work that does not meet the acceptance criteria in Section 3.

### 9.5 Survival

Sections 5 (Intellectual Property), 6 (Pre-existing IP Schedule), 7 (Confidentiality), 8 (Non-Solicitation), 9.4 (Payment on Termination), 10 (Liability), 12 (Representations and Warranties), and 13 (General Provisions) survive termination or expiration of this Agreement.

## 10. Liability and Indemnification

### 10.1 General Liability Cap

Each party\u2019s total aggregate liability to the other for all claims arising under or related to this Agreement is limited to **two times (2\u00d7) the total compensation** paid or payable under all active SOWs in the 12-month period preceding the claim.

### 10.2 Super-Cap Carve-outs

The general cap in Section 10.1 does not apply to the following categories of liability, which are subject to higher caps or are uncapped:

| Category | Cap |
|---|---|
| Breach of IP obligations (Section 5) | 3\u00d7 total contract value |
| Breach of confidentiality (Section 7) | 3\u00d7 total contract value |
| Intentional misconduct or fraud | Uncapped |
| Third-party IP infringement indemnification | Uncapped |

### 10.3 Exclusion of Consequential Damages

Neither party is liable to the other for indirect, incidental, special, consequential, exemplary, or punitive damages, including lost profits, loss of data, or loss of goodwill, even if advised of the possibility of such damages. This exclusion does not apply to damages arising from fraud, willful misconduct, or breach of confidentiality obligations.

### 10.4 Indemnification

Each party (\u201CIndemnifying Party\u201D) will defend, indemnify, and hold harmless the other party (\u201CIndemnified Party\u201D) from and against any third-party claims, damages, losses, and expenses (including reasonable attorneys\u2019 fees) arising from: (a) the Indemnifying Party\u2019s breach of this Agreement; (b) the Indemnifying Party\u2019s gross negligence or willful misconduct; or (c) in the case of the Contractor, any claim that Deliverable Work Product infringes a third party\u2019s intellectual property rights.

The Indemnified Party will: (i) promptly notify the Indemnifying Party of any claim; (ii) give the Indemnifying Party sole control of the defense and settlement; and (iii) cooperate reasonably in the defense. The Indemnifying Party will not settle any claim that imposes liability or obligation on the Indemnified Party without prior written consent.

## 11. Dispute Resolution

### 11.1 Informal Resolution

Before initiating any formal dispute process, the parties agree to make a good faith effort to resolve any dispute through direct negotiation. Either party may initiate this process by sending written notice describing the dispute. The parties will meet (in person, by phone, or by video) within 15 business days.

### 11.2 Mediation

If informal resolution fails within 30 days, either party may escalate to non-binding mediation administered by JAMS (or a mutually agreed mediator). Each party bears its own costs; JAMS fees are split equally. Mediation is a prerequisite to arbitration except for injunctive relief.

### 11.3 Arbitration

Any dispute not resolved by mediation will be finally resolved by binding arbitration under JAMS Comprehensive Arbitration Rules. The arbitration will be: (a) conducted by a single arbitrator unless the amount in controversy exceeds $500,000, in which case a three-arbitrator panel; (b) held in [City, State] or by videoconference; (c) conducted in English; and (d) subject to confidentiality obligations on both parties.

The arbitrator may award any remedy available in court. Judgment on the award may be entered in any court of competent jurisdiction.

### 11.4 Exception \u2014 Injunctive Relief

Either party may seek emergency injunctive or other equitable relief from a court of competent jurisdiction to prevent irreparable harm pending resolution of a dispute, without waiving the right to arbitration.

### 11.5 Class Action Waiver

All disputes will be resolved on an individual basis. Neither party may bring claims as a plaintiff or class member in any class, consolidated, or representative action.

## 12. Representations and Warranties

Each party represents and warrants to the other that: (a) it has full power and authority to enter into and perform this Agreement; (b) this Agreement does not conflict with any other agreement by which it is bound; and (c) it will comply with all applicable laws in performing its obligations.

The Contractor additionally represents and warrants that:
- All Deliverable Work Product is and will be original work by the Contractor or properly licensed third-party materials identified in Section 6;
- Deliverable Work Product will not infringe any third party\u2019s copyright, patent, trademark, or trade secret rights;
- Deliverable Work Product will not contain any malicious code, undisclosed back doors, or tracking mechanisms;
- The Contractor is not subject to any restrictive covenant (non-compete, IP assignment, or similar) that would conflict with this Agreement.

EXCEPT AS EXPRESSLY STATED IN THIS AGREEMENT, NEITHER PARTY MAKES ANY WARRANTIES, EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE.

## 13. General Provisions

**Governing Law.** This Agreement is governed by the laws of the State of [State], without regard to conflict of laws principles. The parties consent to the exclusive jurisdiction of the state and federal courts located in [County, State] for any court proceedings permitted under this Agreement.

**Entire Agreement.** This Agreement and its SOWs constitute the entire agreement between the parties regarding their subject matter and supersede all prior agreements, representations, and understandings.

**Amendments.** This Agreement may only be amended by a written instrument signed by authorized representatives of both parties.

**Severability.** If any provision is found unenforceable, it will be modified to the minimum extent necessary to make it enforceable. The remaining provisions remain in full force.

**No Waiver.** A party\u2019s failure to enforce any right does not constitute a waiver of that right.

**Notices.** All notices must be in writing and delivered by email (with read receipt or written confirmation) or overnight courier to the addresses specified in the applicable SOW.

**Force Majeure.** Neither party is liable for delays caused by circumstances beyond its reasonable control, provided the affected party gives prompt notice and uses reasonable efforts to resume performance.

**Assignment.** The Contractor may not assign this Agreement or any rights under it without prior written consent. The Company may assign this Agreement in connection with a merger, acquisition, or sale of substantially all assets, with notice to the Contractor.

**Counterparts.** This Agreement may be executed in counterparts, including electronic counterparts, each of which is an original and together constitute a single instrument.

---

*This Developer Services Agreement was last updated on [Effective Date].*

---

*Prepared by Lavern \u2014 Multi-Agent Legal Design System*
*This document was produced with AI assistance and reviewed by multi-agent verification. It does not constitute legal advice. For matters involving IP ownership, worker classification, or any binding contractual obligation, please verify with qualified legal professionals.*
`;
