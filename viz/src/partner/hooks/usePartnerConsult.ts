/**
 * usePartnerConsult — Manages the partner consultation conversation.
 *
 * Handles SSE streaming for conversational turns and structured
 * JSON finalization for the recommendation.
 */

import { useState, useCallback, useRef, useEffect } from 'react';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface PartnerRecommendation {
  workflowId: string;
  requestType: string;
  intensity: 'standard' | 'maximal' | 'maximum';
  budgetUsd: number;
  teamRoles: string[];
  briefingMemo: string;
  reasoning: string;
}

interface UsePartnerConsultReturn {
  messages: Message[];
  isStreaming: boolean;
  streamingText: string;
  recommendation: PartnerRecommendation | null;
  isFinalizing: boolean;
  error: string | null;
  sendMessage: (text: string) => void;
  startConversation: () => void;
  finalize: () => void;
  documents: Array<{ name: string; content: string }>;
  addDocument: (doc: { name: string; content: string }) => void;
  /** True after the partner signals readiness to finalize */
  readyToFinalize: boolean;
}

const READY_SIGNAL = 'recommendation for you';

export function usePartnerConsult(): UsePartnerConsultReturn {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [recommendation, setRecommendation] = useState<PartnerRecommendation | null>(null);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [readyToFinalize, setReadyToFinalize] = useState(false);
  const [documents, setDocuments] = useState<Array<{ name: string; content: string }>>([]);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => { mountedRef.current = false; abortRef.current?.abort(); };
  }, []);

  const addDocument = useCallback((doc: { name: string; content: string }) => {
    setDocuments(prev => [...prev, doc]);
  }, []);

  const streamTurn = useCallback(async (
    history: Message[],
    userMessage?: string,
  ) => {
    setIsStreaming(true);
    setStreamingText('');
    setError(null);

    // Add user message to display immediately
    if (userMessage) {
      setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    }

    abortRef.current = new AbortController();

    try {
      const res = await fetch('/api/partner/consult', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        signal: abortRef.current.signal,
        body: JSON.stringify({
          history,
          userMessage,
          documents,
          finalize: false,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error((errData as { error?: string }).error || `HTTP ${res.status}`);
      }

      // Parse SSE stream
      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const jsonStr = line.slice(6).trim();
            if (!jsonStr) continue;

            try {
              const event = JSON.parse(jsonStr);
              if (event.type === 'text') {
                fullText += event.content;
                setStreamingText(fullText.replace(/\s*[\u2012\u2013\u2014\u2015\u2E3A\u2E3B\uFE58\uFE31\uFE32]\s*/g, ', '));
              } else if (event.type === 'error') {
                throw new Error(event.content);
              }
            } catch (e) {
              // Re-throw real errors (from event.type === 'error'), but swallow
              // JSON parse failures from incomplete SSE chunks
              if (e instanceof SyntaxError) continue;
              throw e;
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      // Commit the assistant message
      // Strip em dashes that slip through despite prompt constraints
      fullText = fullText.replace(/\s*[\u2012\u2013\u2014\u2015\u2E3A\u2E3B\uFE58\uFE31\uFE32]\s*/g, ', ');
      const assistantMsg: Message = { role: 'assistant', content: fullText };
      const updatedHistory = userMessage
        ? [...history, { role: 'user' as const, content: userMessage }, assistantMsg]
        : [...history, assistantMsg];

      setMessages(updatedHistory);
      setStreamingText('');

      // Check if partner signaled readiness
      if (fullText.toLowerCase().includes(READY_SIGNAL)) {
        setReadyToFinalize(true);
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      setError(msg);
    } finally {
      setIsStreaming(false);
    }
  }, [documents]);

  const startConversation = useCallback(() => {
    streamTurn([], undefined);
  }, [streamTurn]);

  const sendMessage = useCallback((text: string) => {
    if (isStreaming || !text.trim()) return;
    streamTurn(messages, text.trim());
  }, [isStreaming, messages, streamTurn]);

  const finalize = useCallback(async () => {
    setIsFinalizing(true);
    setError(null);

    try {
      const res = await fetch('/api/partner/consult', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          history: messages,
          documents,
          finalize: true,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Finalization failed' }));
        throw new Error((errData as { error?: string }).error || `HTTP ${res.status}`);
      }

      const data = await res.json() as PartnerRecommendation;
      if (!mountedRef.current) return;
      setRecommendation(data);
    } catch (err) {
      if (!mountedRef.current) return;
      const msg = err instanceof Error ? err.message : 'Finalization failed';
      setError(msg);
    } finally {
      if (mountedRef.current) setIsFinalizing(false);
    }
  }, [messages, documents]);

  return {
    messages,
    isStreaming,
    streamingText,
    recommendation,
    isFinalizing,
    error,
    sendMessage,
    startConversation,
    finalize,
    documents,
    addDocument,
    readyToFinalize,
  };
}
