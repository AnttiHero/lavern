/**
 * useChallengeState — Manages the Whiteshoe Challenge lifecycle.
 *
 * Simple: upload two documents, POST /api/challenge, get scores back.
 * No sessions, no WebSocket, no polling.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useDocumentUpload } from '../briefing/hooks/useDocumentUpload.js';

// ── Types ───────────────────────────────────────────────────────────────

export type ChallengePhase = 'idle' | 'processing' | 'reveal' | 'result' | 'error';

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
  assignment: { A: 'human' | 'whiteshoe'; B: 'human' | 'whiteshoe' };
  winner: 'human' | 'whiteshoe' | 'tie';
  summary: string;
}

// ── Hook ────────────────────────────────────────────────────────────────

export function useChallengeState() {
  const [phase, setPhase] = useState<ChallengePhase>('idle');
  const [result, setResult] = useState<ComparisonResult | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Two independent upload hooks — one for each document
  const whiteshoeUpload = useDocumentUpload();
  const humanUpload = useDocumentUpload();

  // ── Pre-loaded Whiteshoe text (from active session) ──
  const [whiteshoeSessionText, setWhiteshoeSessionText] = useState<string | null>(null);
  const [whiteshoeSessionTitle, setWhiteshoeSessionTitle] = useState<string | null>(null);

  // Timer cleanup for reveal animation and timeout
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    return () => {
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  const bothReady = (whiteshoeUpload.documents.length > 0 || !!whiteshoeSessionText) && humanUpload.documents.length > 0;
  const eitherParsing = whiteshoeUpload.parsing || humanUpload.parsing;

  // ── Load Whiteshoe document directly from an active session ──
  const loadWhiteshoeFromSession = useCallback(async () => {
    try {
      setError(null);
      // Find the active session
      const listRes = await fetch('/api/sessions', { credentials: 'include' });
      if (!listRes.ok) throw new Error('Could not fetch sessions');
      const { sessions } = await listRes.json() as { sessions: Array<{ id: string }> };
      if (!sessions.length) { setError('No active sessions found.'); return; }

      // Get the first (most recent) session's assembled document
      const detailRes = await fetch(`/api/sessions/${sessions[0].id}`, { credentials: 'include' });
      if (!detailRes.ok) throw new Error('Could not fetch session');
      const session = await detailRes.json() as { assembledDocument?: string; matterTitle?: string };
      if (!session.assembledDocument) { setError('Session has no assembled document. Run reassembly first.'); return; }

      setWhiteshoeSessionText(session.assembledDocument);
      setWhiteshoeSessionTitle(session.matterTitle ?? 'Whiteshoe Work Product');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load from session');
    }
  }, []);

  // ── Accept the challenge — single API call ──

  const acceptChallenge = useCallback(async () => {
    const humanDoc = humanUpload.documents[0];
    if (!humanDoc) return;

    // Whiteshoe text: from session pre-load OR from uploaded file
    let whiteshoeText: string | null = whiteshoeSessionText;
    if (!whiteshoeText) {
      const whiteshoeDoc = whiteshoeUpload.documents[0];
      if (!whiteshoeDoc) return;
      const whiteshoeParsed = whiteshoeUpload.parsedDocuments[0]?.fullText;
      const isWhiteshoeText = whiteshoeDoc.type.startsWith('text/') || whiteshoeDoc.name.endsWith('.md') || whiteshoeDoc.name.endsWith('.txt');
      whiteshoeText = whiteshoeParsed ?? (isWhiteshoeText ? whiteshoeDoc.content : null);
    }

    // Human text: from uploaded file
    const humanParsed = humanUpload.parsedDocuments[0]?.fullText;
    const isHumanText = humanDoc.type.startsWith('text/') || humanDoc.name.endsWith('.md') || humanDoc.name.endsWith('.txt');
    const humanText = humanParsed ?? (isHumanText ? humanDoc.content : null);

    if (!whiteshoeText) {
      setError('Could not extract text from the Whiteshoe document. Try "Load from session" or a different format.');
      return;
    }
    if (!humanText) {
      setError('Could not extract text from the challenger document. Try a different format (TXT, MD, PDF, DOCX).');
      return;
    }
    if (whiteshoeText.length < 50) {
      setError('Whiteshoe document is too short (minimum 50 characters).');
      return;
    }
    if (humanText.length < 50) {
      setError('Challenger document is too short (minimum 50 characters).');
      return;
    }

    setPhase('processing');
    setError(null);

    // Abort any previous in-flight request
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // Timeout: 3 minutes for the judge to deliberate
    const CHALLENGE_TIMEOUT_MS = 180_000;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      controller.abort();
      setError('The comparison is taking too long. The judge may be overwhelmed by lengthy documents. Try shorter documents or retry.');
      setPhase('error');
    }, CHALLENGE_TIMEOUT_MS);

    try {
      const res = await fetch('/api/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ whiteshoeText, humanText }),
        signal: controller.signal,
      });

      // Clear timeout on response
      if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Challenge failed' })) as { error: string };
        throw new Error(err.error || 'Challenge failed');
      }

      const compResult = await res.json() as ComparisonResult;
      setResult(compResult);
      setPhase('reveal');
    } catch (err) {
      // Clear timeout on error
      if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }

      // Don't overwrite timeout-triggered error (abort signal means timeout already handled)
      if (controller.signal.aborted) return;

      setError(err instanceof Error ? err.message : 'Challenge failed');
      setPhase('error');
    }
  }, [whiteshoeSessionText, whiteshoeUpload.documents, whiteshoeUpload.parsedDocuments, humanUpload.documents, humanUpload.parsedDocuments]);

  // ── Retry — reset to idle so user can try again ──
  const retry = useCallback(() => {
    setError(null);
    setPhase('idle');
    setResult(null);
    setRevealed(false);
  }, []);

  // ── Reveal identities ──

  const doReveal = useCallback(() => {
    setRevealed(true);
    if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    revealTimerRef.current = setTimeout(() => {
      revealTimerRef.current = null;
      setPhase('result');
    }, 2000);
  }, []);

  return {
    phase,
    result,
    revealed,
    error: error ?? whiteshoeUpload.error ?? humanUpload.error,
    bothReady,
    eitherParsing,
    whiteshoeUpload,
    humanUpload,
    whiteshoeSessionText,
    whiteshoeSessionTitle,
    loadWhiteshoeFromSession,
    acceptChallenge,
    doReveal,
    retry,
  };
}
