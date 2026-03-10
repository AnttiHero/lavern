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

  // ── Pre-loaded Marble text (from active session) ──
  const [marbleSessionText, setMarbleSessionText] = useState<string | null>(null);
  const [marbleSessionTitle, setMarbleSessionTitle] = useState<string | null>(null);

  const bothReady = (marbleUpload.documents.length > 0 || !!marbleSessionText) && humanUpload.documents.length > 0;
  const eitherParsing = marbleUpload.parsing || humanUpload.parsing;

  // ── Load Marble document directly from an active session ──
  const loadMarbleFromSession = useCallback(async () => {
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

      setMarbleSessionText(session.assembledDocument);
      setMarbleSessionTitle(session.matterTitle ?? 'Marble Work Product');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load from session');
    }
  }, []);

  // ── Accept the challenge — single API call ──

  const acceptChallenge = useCallback(async () => {
    const humanDoc = humanUpload.documents[0];
    if (!humanDoc) return;

    // Marble text: from session pre-load OR from uploaded file
    let marbleText: string | null = marbleSessionText;
    if (!marbleText) {
      const marbleDoc = marbleUpload.documents[0];
      if (!marbleDoc) return;
      const marbleParsed = marbleUpload.parsedDocuments[0]?.fullText;
      const isMarbleText = marbleDoc.type.startsWith('text/') || marbleDoc.name.endsWith('.md') || marbleDoc.name.endsWith('.txt');
      marbleText = marbleParsed ?? (isMarbleText ? marbleDoc.content : null);
    }

    // Human text: from uploaded file
    const humanParsed = humanUpload.parsedDocuments[0]?.fullText;
    const isHumanText = humanDoc.type.startsWith('text/') || humanDoc.name.endsWith('.md') || humanDoc.name.endsWith('.txt');
    const humanText = humanParsed ?? (isHumanText ? humanDoc.content : null);

    if (!marbleText) {
      setError('Could not extract text from the Marble document. Try "Load from session" or a different format.');
      return;
    }
    if (!humanText) {
      setError('Could not extract text from the challenger document. Try a different format (TXT, MD, PDF, DOCX).');
      return;
    }
    if (marbleText.length < 50) {
      setError('Marble document is too short (minimum 50 characters).');
      return;
    }
    if (humanText.length < 50) {
      setError('Challenger document is too short (minimum 50 characters).');
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
    marbleSessionText,
    marbleSessionTitle,
    loadMarbleFromSession,
    acceptChallenge,
    doReveal,
  };
}
