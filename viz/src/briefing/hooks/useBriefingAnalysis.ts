/**
 * useBriefingAnalysis — Manages LLM-powered intake analysis.
 *
 * Calls POST /api/briefing/analyze with documents, answers, follow-up answers,
 * and final instructions. Returns sufficiency assessment, follow-up questions,
 * and a structured engagement brief.
 *
 * Max 2 analysis rounds (initial + after follow-ups), then force-continue.
 */

import { useState, useCallback, useRef } from 'react';

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

export interface UseBriefingAnalysisReturn {
  isAnalyzing: boolean;
  analysisError: string | null;
  sufficiency: Sufficiency | null;
  followUpQuestions: FollowUpQuestion[];
  followUpAnswers: Record<string, string>;
  engagementBrief: EngagementBrief | null;
  setFollowUpAnswer: (id: string, value: string) => void;
  analyze: (params: AnalyzeParams) => Promise<void>;
  reanalyze: () => Promise<void>;
  analysisRound: number;
  finalInstructions: string;
  setFinalInstructions: (text: string) => void;
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

  const callAnalyze = useCallback(async (body: Record<string, unknown>) => {
    setIsAnalyzing(true);
    setAnalysisError(null);

    try {
      const res = await fetch('/api/briefing/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
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
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setAnalysisError(message);
      console.error('[BRIEFING ANALYSIS] Failed:', message);
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  const analyze = useCallback(async (params: AnalyzeParams) => {
    lastParams.current = params;
    setAnalysisRound(0);
    setFollowUpAnswers({});
    setFinalInstructions('');

    await callAnalyze({
      workflowId: params.workflowId,
      documents: params.documents.map(d => ({
        name: d.name,
        content: d.content.slice(0, 8000),
      })),
      answers: params.answers,
    });
  }, [callAnalyze]);

  const reanalyze = useCallback(async () => {
    if (!lastParams.current) return;
    if (analysisRound >= MAX_ROUNDS) return;

    await callAnalyze({
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
  };
}
