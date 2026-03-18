/**
 * useChallengeState — Manages the Lavern Challenge lifecycle.
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
  assignment: { A: 'human' | 'lavern'; B: 'human' | 'lavern' };
  winner: 'human' | 'lavern' | 'tie';
  summary: string;
}

// ── Hook ────────────────────────────────────────────────────────────────

export function useChallengeState() {
  const [phase, setPhase] = useState<ChallengePhase>('idle');
  const [result, setResult] = useState<ComparisonResult | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Two independent upload hooks — one for each document
  const lavernUpload = useDocumentUpload();
  const humanUpload = useDocumentUpload();

  // ── Pre-loaded Lavern text (from active session) ──
  const [lavernSessionText, setLavernSessionText] = useState<string | null>(null);
  const [lavernSessionTitle, setLavernSessionTitle] = useState<string | null>(null);

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

  const bothReady = (lavernUpload.documents.length > 0 || !!lavernSessionText) && humanUpload.documents.length > 0;
  const eitherParsing = lavernUpload.parsing || humanUpload.parsing;

  // ── Load Lavern document directly from an active session ──
  const loadLavernFromSession = useCallback(async () => {
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

      setLavernSessionText(session.assembledDocument);
      setLavernSessionTitle(session.matterTitle ?? 'Lavern Work Product');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load from session');
    }
  }, []);

  // ── Accept the challenge — single API call ──

  const acceptChallenge = useCallback(async () => {
    const humanDoc = humanUpload.documents[0];
    if (!humanDoc) return;

    // Lavern text: from session pre-load OR from uploaded file
    let lavernText: string | null = lavernSessionText;
    if (!lavernText) {
      const lavernDoc = lavernUpload.documents[0];
      if (!lavernDoc) return;
      const lavernParsed = lavernUpload.parsedDocuments[0]?.fullText;
      const isLavernText = lavernDoc.type.startsWith('text/') || lavernDoc.name.endsWith('.md') || lavernDoc.name.endsWith('.txt');
      lavernText = lavernParsed ?? (isLavernText ? lavernDoc.content : null);
    }

    // Human text: from uploaded file
    const humanParsed = humanUpload.parsedDocuments[0]?.fullText;
    const isHumanText = humanDoc.type.startsWith('text/') || humanDoc.name.endsWith('.md') || humanDoc.name.endsWith('.txt');
    const humanText = humanParsed ?? (isHumanText ? humanDoc.content : null);

    if (!lavernText) {
      setError('Could not extract text from the Lavern document. Try "Load from session" or a different format.');
      return;
    }
    if (!humanText) {
      setError('Could not extract text from the challenger document. Try a different format (TXT, MD, PDF, DOCX).');
      return;
    }
    if (lavernText.length < 50) {
      setError('Lavern document is too short (minimum 50 characters).');
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
        body: JSON.stringify({ lavernText, humanText }),
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
  }, [lavernSessionText, lavernUpload.documents, lavernUpload.parsedDocuments, humanUpload.documents, humanUpload.parsedDocuments]);

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
    error: error ?? lavernUpload.error ?? humanUpload.error,
    bothReady,
    eitherParsing,
    lavernUpload,
    humanUpload,
    lavernSessionText,
    lavernSessionTitle,
    loadLavernFromSession,
    acceptChallenge,
    doReveal,
    retry,
  };
}
