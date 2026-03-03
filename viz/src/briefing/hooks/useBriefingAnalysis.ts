/**
 * useBriefingAnalysis — Manages LLM-powered intake analysis.
 *
 * Calls POST /api/briefing/analyze with documents, answers, follow-up answers,
 * and final instructions. Returns sufficiency assessment, follow-up questions,
 * and a structured engagement brief.
 *
 * Max 2 analysis rounds (initial + after follow-ups), then force-continue.
 */

import { useState, useCallback, useRef, useEffect } from 'react';

// ── Types (mirrors backend BriefingAnalyzeResponse) ─────────────────────

export interface Sufficiency {
  score: number;
  verdict: 'insufficient' | 'adequate' | 'strong';
  gaps: string[];
  ambiguities: string[];
}

export interface FollowUpQuestion {
  id: string;
  text: string;
  hint: string;
  category: 'context' | 'scope' | 'constraints' | 'objectives';
  required: boolean;
}

export interface EngagementBrief {
  summary: string;
  objective: string;
  documentAnalysis: string | null;
  scopeAndConstraints: string;
  riskFactors: string[];
  successCriteria: string[];
  specialInstructions: string;
}

interface AnalyzeParams {
  workflowId: string;
  documents: Array<{ name: string; content: string }>;
  answers: Record<string, string>;
}

interface AnalyzeResponse {
  sufficiency: Sufficiency;
  followUpQuestions: FollowUpQuestion[];
  engagementBrief: EngagementBrief;
}

/** Returned from analyze/reanalyze so callers don't hit stale-closure issues with React state. */
export interface AnalyzeCallResult {
  success: boolean;
  data?: AnalyzeResponse;
  error?: string;
}

export interface UseBriefingAnalysisReturn {
  isAnalyzing: boolean;
  analysisError: string | null;
  sufficiency: Sufficiency | null;
  followUpQuestions: FollowUpQuestion[];
  followUpAnswers: Record<string, string>;
  engagementBrief: EngagementBrief | null;
  setFollowUpAnswer: (id: string, value: string) => void;
  analyze: (params: AnalyzeParams) => Promise<AnalyzeCallResult>;
  reanalyze: () => Promise<AnalyzeCallResult>;
  analysisRound: number;
  finalInstructions: string;
  setFinalInstructions: (text: string) => void;
  /** Inject result from LLM interview finalization (bypasses /api/briefing/analyze). */
  setFromInterviewResult: (result: { sufficiency: Sufficiency; followUpQuestions: FollowUpQuestion[]; engagementBrief: EngagementBrief }) => void;
}

const MAX_ROUNDS = 2;

export function useBriefingAnalysis(): UseBriefingAnalysisReturn {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [sufficiency, setSufficiency] = useState<Sufficiency | null>(null);
  const [followUpQuestions, setFollowUpQuestions] = useState<FollowUpQuestion[]>([]);
  const [followUpAnswers, setFollowUpAnswers] = useState<Record<string, string>>({});
  const [engagementBrief, setEngagementBrief] = useState<EngagementBrief | null>(null);
  const [analysisRound, setAnalysisRound] = useState(0);
  const [finalInstructions, setFinalInstructions] = useState('');

  // Keep last params for reanalyze
  const lastParams = useRef<AnalyzeParams | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Abort in-flight analysis on unmount
  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  const callAnalyze = useCallback(async (body: Record<string, unknown>): Promise<AnalyzeCallResult> => {
    setIsAnalyzing(true);
    setAnalysisError(null);

    const controller = new AbortController();
    abortRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), 60_000);

    try {
      const res = await fetch('/api/briefing/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Analysis request failed' }));
        throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
      }

      const data = (await res.json()) as AnalyzeResponse;
      setSufficiency(data.sufficiency);
      setFollowUpQuestions(data.followUpQuestions ?? []);
      setEngagementBrief(data.engagementBrief);
      setAnalysisRound(prev => prev + 1);
      return { success: true, data };
    } catch (err) {
      const isAbort = err instanceof DOMException && err.name === 'AbortError';
      const message = isAbort
        ? 'Analysis timed out — server may be unreachable.'
        : err instanceof Error ? err.message : String(err);
      setAnalysisError(message);
      console.error('[BRIEFING ANALYSIS] Failed:', message);
      return { success: false, error: message };
    } finally {
      clearTimeout(timeout);
      abortRef.current = null;
      setIsAnalyzing(false);
    }
  }, []);

  const analyze = useCallback(async (params: AnalyzeParams): Promise<AnalyzeCallResult> => {
    lastParams.current = params;
    setAnalysisRound(0);
    setFollowUpAnswers({});
    setFinalInstructions('');

    return await callAnalyze({
      workflowId: params.workflowId,
      documents: params.documents.map(d => ({
        name: d.name,
        content: d.content.slice(0, 8000),
      })),
      answers: params.answers,
    });
  }, [callAnalyze]);

  const reanalyze = useCallback(async (): Promise<AnalyzeCallResult> => {
    if (!lastParams.current) return { success: false, error: 'No previous analysis' };
    if (analysisRound >= MAX_ROUNDS) return { success: false, error: 'Max rounds reached' };

    return await callAnalyze({
      workflowId: lastParams.current.workflowId,
      documents: lastParams.current.documents.map(d => ({
        name: d.name,
        content: d.content.slice(0, 8000),
      })),
      answers: lastParams.current.answers,
      followUpAnswers,
      finalInstructions: finalInstructions.trim() || undefined,
    });
  }, [callAnalyze, followUpAnswers, finalInstructions, analysisRound]);

  const setFollowUpAnswer = useCallback((id: string, value: string) => {
    setFollowUpAnswers(prev => ({ ...prev, [id]: value }));
  }, []);

  /**
   * Inject structured result from the LLM interview finalization.
   * Bypasses the /api/briefing/analyze call — the interview already produced
   * an equivalent BriefingAnalyzeResponse.
   */
  const setFromInterviewResult = useCallback((result: {
    sufficiency: Sufficiency;
    followUpQuestions: FollowUpQuestion[];
    engagementBrief: EngagementBrief;
  }) => {
    setSufficiency(result.sufficiency);
    setFollowUpQuestions(result.followUpQuestions ?? []);
    setEngagementBrief(result.engagementBrief);
    setAnalysisRound(1);
    setFollowUpAnswers({});
    setAnalysisError(null);
  }, []);

  return {
    isAnalyzing,
    analysisError,
    sufficiency,
    followUpQuestions,
    followUpAnswers,
    engagementBrief,
    setFollowUpAnswer,
    analyze,
    reanalyze,
    analysisRound,
    finalInstructions,
    setFinalInstructions,
    setFromInterviewResult,
  };
}
