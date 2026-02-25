/**
 * useLLMInterview — Manages a conversational LLM-driven interview.
 *
 * Each turn sends the full conversation history to POST /api/briefing/interview
 * and streams back the interviewer's response via SSE. Finalization produces
 * a structured InterviewResult that plugs into the existing pipeline.
 *
 * Falls back to static questions if the first API call fails.
 */

import { useState, useCallback, useRef } from 'react';
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

const MAX_TURNS = 8;

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

  // Count user turns from messages
  const turnCount = messages.filter(m => m.role === 'user').length;

  const callInterview = useCallback(async (
    userMessage?: string,
    finalize = false,
  ) => {
    if (isStreaming) return;

    const controller = new AbortController();
    abortRef.current = controller;

    // Build history from current messages (exclude the message we're about to add)
    const history = messages.map(m => ({ role: m.role, content: m.content }));

    // Truncate document content for the API call
    const truncatedDocs = documents.map(d => ({
      name: d.name,
      content: d.content.slice(0, 3000),
    }));

    try {
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
        setInterviewResult(result);
        return;
      }

      // Conversational turn: SSE streaming
      if (userMessage) {
        setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
      }

      // Add empty assistant message to stream into
      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

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

      await consumeSSEStream(res, setMessages, controller.signal);
    } catch (err) {
      if (controller.signal.aborted) return;

      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('[useLLMInterview]', errorMessage);
      setError(errorMessage);

      // If the very first call fails, fall back to static questions
      if (messages.length === 0) {
        setFallbackToStatic(true);
      } else {
        // Mid-conversation failure: remove the empty assistant message
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last && last.role === 'assistant' && last.content === '') {
            return prev.slice(0, -1);
          }
          return prev;
        });
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsStreaming(false);
      }
      abortRef.current = null;
    }
  }, [isStreaming, messages, documents, workflowId, interviewerId]);

  const startInterview = useCallback(async () => {
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
