/**
 * useLLMInterview — Manages a conversational LLM-driven interview.
 *
 * Each turn sends the full conversation history to POST /api/briefing/interview
 * and streams back the interviewer's response via SSE. Finalization produces
 * a structured InterviewResult that plugs into the existing pipeline.
 *
 * Falls back to static questions if the first API call fails.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { Sufficiency, FollowUpQuestion, EngagementBrief } from './useBriefingAnalysis.js';

/** Mirrors the backend InterviewResult shape. */
export interface InterviewResult {
  sufficiency: Sufficiency;
  followUpQuestions: FollowUpQuestion[];
  engagementBrief: EngagementBrief;
}

export interface InterviewMessage {
  role: 'assistant' | 'user';
  content: string;
}

export interface UseLLMInterviewReturn {
  messages: InterviewMessage[];
  isStreaming: boolean;
  turnCount: number;
  maxTurns: number;
  error: string | null;
  /** Structured result after finalization */
  interviewResult: InterviewResult | null;
  /** True if LLM call failed and we should fall back to static questions */
  fallbackToStatic: boolean;
  /** Start the interview (opening question, no user message) */
  startInterview: () => Promise<void>;
  /** Send user answer and get next question */
  sendAnswer: (text: string) => Promise<void>;
  /** Finalize: synthesize conversation into structured brief */
  finalizeInterview: () => Promise<void>;
}

const MAX_TURNS = 5;
const MAX_RETRIES = 2;

/**
 * Read an SSE stream and append text chunks to the last assistant message.
 * Returns the full accumulated text.
 */
async function consumeSSEStream(
  res: Response,
  setMessages: React.Dispatch<React.SetStateAction<InterviewMessage[]>>,
  signal: AbortSignal,
): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (signal.aborted) break;

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const jsonStr = line.slice(6);
        try {
          const event = JSON.parse(jsonStr) as { type: string; content?: string };

          if (event.type === 'text' && event.content) {
            fullText += event.content;
            setMessages(prev => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last && last.role === 'assistant') {
                updated[updated.length - 1] = { ...last, content: last.content + event.content };
              }
              return updated;
            });
          }

          // Acknowledge stream completion — break out of the read loop
          if (event.type === 'done') {
            reader.releaseLock();
            return fullText;
          }

          if (event.type === 'error' && event.content) {
            throw new Error(event.content);
          }
        } catch (e) {
          if (e instanceof Error && e.message !== 'Unexpected end of JSON input') {
            throw e;
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return fullText;
}

export function useLLMInterview(
  workflowId: string,
  interviewerId: string | undefined,
  documents: Array<{ name: string; content: string }>,
): UseLLMInterviewReturn {
  const [messages, setMessages] = useState<InterviewMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [interviewResult, setInterviewResult] = useState<InterviewResult | null>(null);
  const [fallbackToStatic, setFallbackToStatic] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const isStreamingRef = useRef(false);
  const mountedRef = useRef(true);

  // Abort in-flight requests on unmount to prevent setState on unmounted component
  useEffect(() => {
    return () => { mountedRef.current = false; abortRef.current?.abort(); };
  }, []);

  // Count user turns from messages
  const turnCount = messages.filter(m => m.role === 'user').length;

  // Ref to capture latest messages without stale closure
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const callInterview = useCallback(async (
    userMessage?: string,
    finalize = false,
    retryAttempt = 0,
  ) => {
    // Use ref guard — state value may be stale due to closure capture
    if (isStreamingRef.current) return;

    const controller = new AbortController();
    abortRef.current = controller;

    // Tracks whether this call handed off to a recursive retry (in which case
    // the inner call owns the streaming lock cleanup, not this one).
    let didRetry = false;

    // Timeout: 30s for finalization (non-streaming), 20s for initial SSE connection
    const timeoutMs = finalize ? 30_000 : 20_000;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    // Build history from ref (avoids stale closure over messages state)
    const history = messagesRef.current.map(m => ({ role: m.role, content: m.content }));

    // Truncate document content for the API call
    const truncatedDocs = documents.map(d => ({
      name: d.name,
      content: d.content.slice(0, 3000),
    }));

    try {
      isStreamingRef.current = true;
      setIsStreaming(true);
      setError(null);

      // Finalization: non-streaming JSON call
      if (finalize) {
        const res = await fetch('/api/briefing/interview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            workflowId,
            interviewerId,
            documents: truncatedDocs,
            history,
            userMessage,
            finalize: true,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Finalization failed' }));
          throw new Error(err.error || err.message || 'Finalization failed');
        }

        const result = await res.json();
        if (!mountedRef.current) return;
        setInterviewResult(result);
        return;
      }

      // Conversational turn: SSE streaming
      // Only add user message on first attempt (not on retries)
      if (userMessage && retryAttempt === 0) {
        setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
      }

      // Add empty assistant message to stream into (only on first attempt)
      if (retryAttempt === 0) {
        setMessages(prev => [...prev, { role: 'assistant', content: '' }]);
      }

      const res = await fetch('/api/briefing/interview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          workflowId,
          interviewerId,
          documents: truncatedDocs,
          history: userMessage ? [...history, { role: 'user', content: userMessage }] : history,
          userMessage: undefined, // history already includes it
          finalize: false,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(err.error || err.message || 'Request failed');
      }

      // SSE connection established — cancel the connection timeout
      // (the stream itself can take longer as tokens flow in)
      clearTimeout(timeout);

      await consumeSSEStream(res, setMessages, controller.signal);
    } catch (err) {
      // Determine error message — aborts are timeouts (we only abort via timeout)
      const isAbort = err instanceof DOMException && err.name === 'AbortError';
      const errorMessage = isAbort
        ? 'Interview request timed out — server may be unreachable.'
        : err instanceof Error ? err.message : String(err);

      console.error(`[useLLMInterview] attempt ${retryAttempt + 1}:`, errorMessage);

      // If the very first call fails (no messages yet), fall back to static questions
      if (messagesRef.current.length === 0 ||
          (messagesRef.current.length === 1 && messagesRef.current[0].content === '')) {
        // Clean up the empty assistant message before falling back
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last && last.role === 'assistant' && last.content === '') {
            return prev.slice(0, -1);
          }
          return prev;
        });
        setFallbackToStatic(true);
        setError(errorMessage);
      } else if (retryAttempt < MAX_RETRIES) {
        // Mid-conversation failure: retry before giving up
        // Remove the empty assistant message (we'll re-add it on retry)
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last && last.role === 'assistant' && last.content === '') {
            return prev.slice(0, -1);
          }
          return prev;
        });

        console.log(`[useLLMInterview] Retrying in ${(retryAttempt + 1) * 2}s (attempt ${retryAttempt + 2}/${MAX_RETRIES + 1})...`);

        // Release streaming lock so retry can proceed
        isStreamingRef.current = false;
        setIsStreaming(false);
        abortRef.current = null;
        clearTimeout(timeout);

        // Exponential backoff: 2s, 4s
        await new Promise(r => setTimeout(r, (retryAttempt + 1) * 2000));
        // Guard against retry after unmount — component may have been unmounted during backoff
        if (!mountedRef.current) return;
        // Recursive retry — outer finally must not reset the lock (inner owns it)
        didRetry = true;
        await callInterview(userMessage, finalize, retryAttempt + 1);
        return;
      } else {
        // All retries exhausted — clean up and show error
        setError(errorMessage);
        setMessages(prev => {
          let cleaned = prev;
          // Remove empty assistant message
          const last = cleaned[cleaned.length - 1];
          if (last && last.role === 'assistant' && last.content === '') {
            cleaned = cleaned.slice(0, -1);
          }
          // Remove the user message we optimistically added
          if (userMessage) {
            const lastUser = cleaned[cleaned.length - 1];
            if (lastUser && lastUser.role === 'user' && lastUser.content.trim() === userMessage.trim()) {
              cleaned = cleaned.slice(0, -1);
            }
          }
          return cleaned;
        });
      }
    } finally {
      clearTimeout(timeout);
      // Always release the streaming lock, unless this call already handed off to
      // a recursive retry (didRetry = true). In that case, the inner call owns
      // cleanup and will release the lock when it finishes.
      if (!didRetry) {
        isStreamingRef.current = false;
        setIsStreaming(false);
        abortRef.current = null;
      }
    }
  }, [documents, workflowId, interviewerId]);

  const startInterview = useCallback(async () => {
    // Use ref to avoid stale closure — messages.length in deps would recreate
    // the callback on every message, potentially causing double-starts
    if (messagesRef.current.length > 0 || isStreamingRef.current) return;
    await callInterview(undefined, false);
  }, [callInterview]);

  const sendAnswer = useCallback(async (text: string) => {
    await callInterview(text.trim(), false);
  }, [callInterview]);

  const finalizeInterview = useCallback(async () => {
    await callInterview(undefined, true);
  }, [callInterview]);

  return {
    messages,
    isStreaming,
    turnCount,
    maxTurns: MAX_TURNS,
    error,
    interviewResult,
    fallbackToStatic,
    startInterview,
    sendAnswer,
    finalizeInterview,
  };
}
