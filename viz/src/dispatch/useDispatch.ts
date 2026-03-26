/**
 * useDispatch — Voice command routing for Claw Mode.
 *
 * Parses natural language commands via keyword matching (no LLM cost),
 * calls the appropriate Claw API endpoint, and formats the response
 * for spoken output via SpeechSynthesis.
 */

import { useState, useCallback, useRef } from 'react';

// ── Command Types ────────────────────────────────────────────────────────

export type DispatchCommand =
  | 'status'
  | 'findings'
  | 'scan'
  | 'pause'
  | 'resume'
  | 'retry'
  | 'budget'
  | 'unknown';

export interface DispatchResult {
  command: DispatchCommand;
  text: string;
  spoken: string;
  success: boolean;
}

// ── Command Parser ──────────────────────────────────────────────────────

export function parseCommand(input: string): DispatchCommand {
  const lower = input.toLowerCase().trim();

  if (/\b(pause)\b/.test(lower)) return 'pause';
  if (/\b(resume|unpause)\b/.test(lower)) return 'resume';
  if (/\b(scan|check|look)\b/.test(lower)) return 'scan';
  if (/\b(retry|failed|errors?)\b/.test(lower)) return 'retry';
  if (/\b(budget|spent|cost|money|balance)\b/.test(lower)) return 'budget';
  if (/\b(critical|flagged|findings?|issues?|problems?|risks?)\b/.test(lower)) return 'findings';
  if (/\b(status|how|what|update|report|summary)\b/.test(lower)) return 'status';

  return 'unknown';
}

// ── API Callers ─────────────────────────────────────────────────────────

async function fetchJson(url: string, options?: RequestInit): Promise<any> {
  const res = await fetch(url, { credentials: 'include', ...options });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

async function executeStatus(): Promise<DispatchResult> {
  const data = await fetchJson('/api/claw/status');
  const docs = data.documents;
  const budget = data.budget;
  const spoken = `You have ${docs.total} documents. ${docs.reviewed} reviewed, ${docs.flagged} flagged, ${docs.pending} pending, ${docs.errors} errors. Budget: $${budget.spentUsd.toFixed(2)} of $${budget.totalUsd.toFixed(2)} spent. ${budget.exhausted ? 'Budget is exhausted.' : `$${budget.remainingUsd.toFixed(2)} remaining.`}`;

  return { command: 'status', text: spoken, spoken, success: true };
}

async function executeFindings(): Promise<DispatchResult> {
  const data = await fetchJson('/api/claw/documents');
  const flagged = (data.documents ?? []).filter((d: any) => d.status === 'flagged');

  if (flagged.length === 0) {
    return { command: 'findings', text: 'No critical findings.', spoken: 'No critical findings. Everything looks clean.', success: true };
  }

  const names = flagged.slice(0, 5).map((d: any) => d.name).join(', ');
  const spoken = `${flagged.length} document${flagged.length === 1 ? '' : 's'} flagged with critical findings: ${names}.`;
  return { command: 'findings', text: spoken, spoken, success: true };
}

async function executeScan(): Promise<DispatchResult> {
  await fetchJson('/api/claw/scan', { method: 'POST' });
  return { command: 'scan', text: 'Scan triggered.', spoken: 'Scanning now. I\'ll process any new documents I find.', success: true };
}

async function executePause(): Promise<DispatchResult> {
  const data = await fetchJson('/api/claw/pause', { method: 'PATCH' });
  if (data.alreadyPaused) {
    return { command: 'pause', text: 'Already paused.', spoken: 'Already paused.', success: true };
  }
  return { command: 'pause', text: 'Paused.', spoken: 'Processing paused. Say resume when you\'re ready.', success: true };
}

async function executeResume(): Promise<DispatchResult> {
  const data = await fetchJson('/api/claw/resume', { method: 'PATCH' });
  if (data.alreadyResumed) {
    return { command: 'resume', text: 'Already running.', spoken: 'Already running.', success: true };
  }
  const pending = data.pendingDocuments ?? 0;
  const spoken = pending > 0
    ? `Resumed. Found ${pending} document${pending === 1 ? '' : 's'} to process.`
    : 'Resumed. No pending documents.';
  return { command: 'resume', text: spoken, spoken, success: true };
}

async function executeRetry(): Promise<DispatchResult> {
  const data = await fetchJson('/api/claw/retry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  const count = data.retriedCount ?? 0;
  const spoken = count > 0
    ? `Queued ${count} failed document${count === 1 ? '' : 's'} for retry.`
    : 'No failed documents to retry.';
  return { command: 'retry', text: spoken, spoken, success: true };
}

async function executeBudget(): Promise<DispatchResult> {
  const data = await fetchJson('/api/claw/status');
  const b = data.budget;
  const pct = b.totalUsd > 0 ? Math.round((b.spentUsd / b.totalUsd) * 100) : 0;
  const spoken = `Budget: $${b.spentUsd.toFixed(2)} spent of $${b.totalUsd.toFixed(2)}. That's ${pct}%. $${b.remainingUsd.toFixed(2)} remaining.`;
  return { command: 'budget', text: spoken, spoken, success: true };
}

// ── Executor ────────────────────────────────────────────────────────────

async function executeCommand(command: DispatchCommand): Promise<DispatchResult> {
  switch (command) {
    case 'status': return executeStatus();
    case 'findings': return executeFindings();
    case 'scan': return executeScan();
    case 'pause': return executePause();
    case 'resume': return executeResume();
    case 'retry': return executeRetry();
    case 'budget': return executeBudget();
    case 'unknown':
      return {
        command: 'unknown',
        text: 'I didn\'t understand that command.',
        spoken: 'I didn\'t understand that. Try: status, scan, pause, resume, findings, or budget.',
        success: false,
      };
  }
}

// ── Speech Synthesis ────────────────────────────────────────────────────

function speak(text: string): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.0;
  utterance.pitch = 1.0;
  window.speechSynthesis.speak(utterance);
}

// ── Hook ────────────────────────────────────────────────────────────────

export interface UseDispatchReturn {
  isListening: boolean;
  isProcessing: boolean;
  isSupported: boolean;
  transcript: string;
  lastResult: DispatchResult | null;
  error: string | null;
  startListening: () => void;
  stopListening: () => void;
}

export function useDispatch(): UseDispatchReturn {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [lastResult, setLastResult] = useState<DispatchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  const SpeechRecognition = typeof window !== 'undefined'
    ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    : null;

  const isSupported = !!SpeechRecognition;

  const processTranscript = useCallback(async (text: string) => {
    if (!text.trim()) return;
    setIsProcessing(true);
    setError(null);

    try {
      const command = parseCommand(text);
      const result = await executeCommand(command);
      setLastResult(result);
      speak(result.spoken);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Command failed';
      setError(msg);
      speak('Sorry, something went wrong.');
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const startListening = useCallback(() => {
    if (!SpeechRecognition || isListening) return;
    setError(null);
    setTranscript('');

    // Stop any existing recognition instance before creating a new one
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* already stopped */ }
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: any) => {
      let interim = '';
      let final = '';
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }
      setTranscript(final || interim);
      if (final) {
        processTranscript(final);
      }
    };

    recognition.onerror = (event: any) => {
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        setError(`Voice error: ${event.error}`);
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [SpeechRecognition, isListening, processTranscript]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
  }, []);

  return { isListening, isProcessing, isSupported, transcript, lastResult, error, startListening, stopListening };
}
