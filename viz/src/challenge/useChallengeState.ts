/**
 * useChallengeState — Manages the Marble Challenge lifecycle.
 *
 * Simple: upload two documents, POST /api/challenge, get scores back.
 * No sessions, no WebSocket, no polling.
 */

import { useState, useCallback } from 'react';
import { useDocumentUpload } from '../briefing/hooks/useDocumentUpload.js';

// ── Types ───────────────────────────────────────────────────────────────

export type ChallengePhase = 'idle' | 'processing' | 'reveal' | 'result';

export interface DimensionScore {
  name: string;
  description: string;
  scoreA: number;
  scoreB: number;
  weight: number;
}

export interface ComparisonResult {
  dimensions: DimensionScore[];
  overallA: number;
  overallB: number;
  assignment: { A: 'human' | 'marble'; B: 'human' | 'marble' };
  winner: 'human' | 'marble' | 'tie';
  summary: string;
}

// ── Hook ────────────────────────────────────────────────────────────────

export function useChallengeState() {
  const [phase, setPhase] = useState<ChallengePhase>('idle');
  const [result, setResult] = useState<ComparisonResult | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Two independent upload hooks — one for each document
  const marbleUpload = useDocumentUpload();
  const humanUpload = useDocumentUpload();

  const bothReady = marbleUpload.documents.length > 0 && humanUpload.documents.length > 0;
  const eitherParsing = marbleUpload.parsing || humanUpload.parsing;

  // ── Accept the challenge — single API call ──

  const acceptChallenge = useCallback(async () => {
    const marbleDoc = marbleUpload.documents[0];
    const humanDoc = humanUpload.documents[0];
    if (!marbleDoc || !humanDoc) return;

    // Get text from parsed documents or raw content
    const marbleText = marbleUpload.parsedDocuments[0]?.fullText ?? marbleDoc.content;
    const humanText = humanUpload.parsedDocuments[0]?.fullText ?? humanDoc.content;

    if (!marbleText || marbleText.length < 50) {
      setError('Marble document is too short or could not be read.');
      return;
    }
    if (!humanText || humanText.length < 50) {
      setError('Human document is too short or could not be read.');
      return;
    }

    setPhase('processing');
    setError(null);

    try {
      const res = await fetch('/api/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marbleText, humanText }),
      });

      if (!res.ok) {
        const err = await res.json() as { error: string };
        throw new Error(err.error || 'Challenge failed');
      }

      const compResult = await res.json() as ComparisonResult;
      setResult(compResult);
      setPhase('reveal');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Challenge failed');
      setPhase('idle');
    }
  }, [marbleUpload.documents, marbleUpload.parsedDocuments, humanUpload.documents, humanUpload.parsedDocuments]);

  // ── Reveal identities ──

  const doReveal = useCallback(() => {
    setRevealed(true);
    setTimeout(() => setPhase('result'), 2000);
  }, []);

  return {
    phase,
    result,
    revealed,
    error: error ?? marbleUpload.error ?? humanUpload.error,
    bothReady,
    eitherParsing,
    marbleUpload,
    humanUpload,
    acceptChallenge,
    doReveal,
  };
}
