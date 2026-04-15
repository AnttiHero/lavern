/**
 * ConversationTab — Post-delivery Q&A with the team.
 *
 * After the analysis lands, the user can ask questions about findings,
 * request alternative clause drafts, drill into specific issues, or
 * ask for follow-up analyses. The backend responds in-character as the
 * team lead who ran the analysis, with full session context.
 *
 * Messages stream via SSE from POST /api/sessions/:id/conversation.
 * State is lifted to DeliveryView so conversation persists across tab switches.
 */

import { useRef, useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { colors, fonts, spacing, radii } from '../../staffing/styles/tokens.js';
import { useVoiceInput } from '../../partner/hooks/useVoiceInput.js';

// ── Minimal markdown renderer ──────────────────────────────────────────
// Ask the Team responses include **bold**, *italic*, `code`, headings,
// and bullet lists. Render them as React nodes instead of dumping raw
// markdown into a <div>.

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  // Process **bold**, *italic*, `code` — in that order, non-overlapping.
  // Tokenize into segments so we don't double-process.
  const nodes: ReactNode[] = [];
  const regex = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`)/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      nodes.push(text.slice(lastIdx, match.index));
    }
    const key = `${keyPrefix}-${i++}`;
    if (match[2] !== undefined) {
      nodes.push(<strong key={key}>{match[2]}</strong>);
    } else if (match[3] !== undefined) {
      nodes.push(<em key={key}>{match[3]}</em>);
    } else if (match[4] !== undefined) {
      nodes.push(<code key={key} style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.92em', backgroundColor: 'rgba(0,0,0,0.05)', padding: '1px 4px', borderRadius: 3 }}>{match[4]}</code>);
    }
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < text.length) nodes.push(text.slice(lastIdx));
  return nodes;
}

function renderMarkdown(src: string): ReactNode {
  const lines = src.split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  let paraBuf: string[] = [];
  let listBuf: string[] = [];

  const flushPara = () => {
    if (paraBuf.length) {
      const text = paraBuf.join(' ');
      blocks.push(
        <p key={`p-${blocks.length}`} style={{ margin: '0 0 8px 0' }}>
          {renderInline(text, `p-${blocks.length}`)}
        </p>,
      );
      paraBuf = [];
    }
  };
  const flushList = () => {
    if (listBuf.length) {
      const items = listBuf;
      blocks.push(
        <ul key={`ul-${blocks.length}`} style={{ margin: '0 0 8px 0', paddingLeft: 20 }}>
          {items.map((it, k) => (
            <li key={k} style={{ marginBottom: 2 }}>{renderInline(it, `li-${blocks.length}-${k}`)}</li>
          ))}
        </ul>,
      );
      listBuf = [];
    }
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === '') {
      flushPara();
      flushList();
      i++;
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushPara();
      flushList();
      const level = heading[1].length;
      const content = heading[2];
      const size = level <= 2 ? 15 : level === 3 ? 14 : 13;
      blocks.push(
        <div
          key={`h-${blocks.length}`}
          style={{ fontWeight: 600, fontSize: size, margin: '10px 0 6px 0', lineHeight: 1.35 }}
        >
          {renderInline(content, `h-${blocks.length}`)}
        </div>,
      );
      i++;
      continue;
    }

    const bullet = trimmed.match(/^[-*]\s+(.*)$/);
    if (bullet) {
      flushPara();
      listBuf.push(bullet[1]);
      i++;
      continue;
    }

    const numbered = trimmed.match(/^\d+\.\s+(.*)$/);
    if (numbered) {
      flushPara();
      listBuf.push(numbered[1]);
      i++;
      continue;
    }

    flushList();
    paraBuf.push(trimmed);
    i++;
  }
  flushPara();
  flushList();

  return <>{blocks}</>;
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface Props {
  sessionId: string;
  messages: ConversationMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ConversationMessage[]>>;
  input: string;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  streaming: boolean;
  setStreaming: React.Dispatch<React.SetStateAction<boolean>>;
}

export function ConversationTab({
  sessionId, messages, setMessages, input, setInput, streaming, setStreaming,
}: Props) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Stable ref for messages to avoid recreating sendMessage on every streaming chunk
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const {
    isSupported: voiceSupported,
    isListening: voiceListening,
    finalTranscript: voiceFinalTranscript,
    startListening: voiceStart,
    stopListening: voiceStop,
    clearTranscript: voiceClear,
  } = useVoiceInput();
  const [micActive, setMicActive] = useState(false);
  const sendTextRef = useRef<((text: string) => void) | null>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Abort any in-flight request on unmount
  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  const sendMessage = useCallback(async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || streaming) return;

    const userMessage: ConversationMessage = { role: 'user', content: text };
    const history = [...messagesRef.current];

    setMessages(prev => [...prev, userMessage]);
    if (!overrideText) setInput(''); // Clear immediately for responsiveness — restored on error below
    setStreaming(true);

    // Add empty assistant message that we'll stream into
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    // Create abort controller for this request
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`/api/sessions/${sessionId}/conversation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ message: text, history }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }));
        setMessages(prev => {
          const updated = [...prev];
          if (updated.length > 0) {
            updated[updated.length - 1] = { role: 'assistant', content: `Error: ${err.error || 'Something went wrong.'}` };
          }
          return updated;
        });
        setInput(text); // Restore user input so they can retry
        setStreaming(false);
        return;
      }

      // Backend returns JSON { content: "..." } now (was SSE). Simpler and more
      // reliable than the old reply.hijack() + raw write pattern.
      const data = await res.json().catch(() => null) as { content?: string; error?: string } | null;
      const answer = data?.content ?? '';
      if (answer) {
        setMessages(prev => {
          const updated = [...prev];
          if (updated.length === 0) return updated;
          updated[updated.length - 1] = { role: 'assistant', content: answer };
          return updated;
        });
      } else {
        setMessages(prev => {
          const updated = [...prev];
          if (updated.length > 0) {
            updated[updated.length - 1] = {
              role: 'assistant',
              content: data?.error ? `Error: ${data.error}` : 'No response received from the server.',
            };
          }
          return updated;
        });
      }
    } catch (err) {
      // Don't update state if aborted (component unmounting)
      if (controller.signal.aborted) return;
      setMessages(prev => {
        const updated = [...prev];
        if (updated.length > 0) {
          updated[updated.length - 1] = {
            role: 'assistant',
            content: `Connection error: ${err instanceof Error ? err.message : 'Unable to reach the server.'}`,
          };
        }
        return updated;
      });
      setInput(text); // Restore user input so they can retry
    } finally {
      if (!controller.signal.aborted) {
        setStreaming(false);
        inputRef.current?.focus();
      }
      abortRef.current = null;
    }
  }, [input, streaming, sessionId, setMessages, setInput, setStreaming]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  }, [sendMessage]);

  // Keep stable ref to sendMessage for voice effect (must be after sendMessage declaration)
  useEffect(() => {
    sendTextRef.current = (text: string) => { void sendMessage(text); };
  }, [sendMessage]);

  // Voice: when finalTranscript arrives, clear input and auto-send
  useEffect(() => {
    if (!voiceFinalTranscript || !micActive) return;
    const text = voiceFinalTranscript.trim();
    if (!text) return;
    setInput('');
    setMicActive(false);
    voiceStop();
    voiceClear();
    sendTextRef.current?.(text);
  }, [voiceFinalTranscript, micActive, voiceStop, voiceClear]);

  const handleMicToggle = useCallback(() => {
    if (micActive) {
      setMicActive(false);
      voiceStop();
      voiceClear();
    } else {
      setMicActive(true);
      voiceClear();
      voiceStart();
    }
  }, [micActive, voiceStart, voiceStop, voiceClear]);

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerDot} />
        <div>
          <div style={styles.headerTitle}>Ask the Team</div>
          <div style={styles.headerSub}>
            Questions about findings, alternative clauses, follow-up analyses
          </div>
        </div>
      </div>

      {/* Messages */}
      <div style={styles.messageArea} aria-live="polite" aria-label="Conversation messages">
        {messages.length === 0 && (
          <div style={styles.emptyState}>
            <div style={styles.emptyTitle}>What would you like to know?</div>
            <div style={styles.emptyHints}>
              {[
                { text: 'Summarize the key risks', prompt: 'Summarize the key risks in plain language' },
                { text: 'Draft an alternative clause', prompt: 'Draft an alternative clause for the most critical finding' },
                { text: 'What to fix first?', prompt: 'What should we prioritize fixing first?' },
              ].map(({ text, prompt }) => (
                <button
                  key={text}
                  style={{ ...styles.hint, ...(streaming ? { opacity: 0.4, cursor: 'not-allowed' } : {}) }}
                  disabled={streaming}
                  onClick={() => { setInput(prompt); inputRef.current?.focus(); }}
                  onMouseEnter={e => { if (!streaming) { e.currentTarget.style.borderColor = colors.textMuted; e.currentTarget.style.color = colors.text; } }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = colors.border; e.currentTarget.style.color = colors.textSecondary; }}
                >
                  {text}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={`${msg.role}-${i}-${msg.content.length}`}
            style={msg.role === 'user' ? styles.userRow : styles.assistantRow}
          >
            <div style={msg.role === 'user' ? styles.userBubble : styles.assistantBubble}>
              {msg.role === 'assistant' && msg.content === '' && streaming ? (
                <span style={styles.thinking}>Thinking<span style={styles.thinkingDots}>...</span></span>
              ) : msg.role === 'assistant' ? (
                <div style={styles.messageText}>{renderMarkdown(msg.content)}</div>
              ) : (
                <div style={styles.messageText}>{msg.content}</div>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={styles.inputRow}>
        <input
          ref={inputRef}
          type="text"
          aria-label="Ask a question about the analysis"
          placeholder={micActive && voiceListening ? 'Listening\u2026' : 'Ask a question about the analysis\u2026'}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          style={{
            ...styles.input,
            borderColor: voiceListening ? 'rgba(180,60,40,0.4)' : undefined,
          }}
          disabled={streaming}
          autoFocus
          onFocus={e => { e.currentTarget.style.borderColor = colors.accent; }}
          onBlur={e => { e.currentTarget.style.borderColor = colors.border; }}
        />
        {voiceSupported && (
          <button
            onClick={handleMicToggle}
            disabled={streaming}
            title={micActive ? 'Stop listening' : 'Ask by voice'}
            style={{
              ...styles.micBtn,
              backgroundColor: micActive ? (voiceListening ? 'rgba(180,60,40,0.1)' : 'rgba(26,26,26,0.04)') : 'transparent',
              borderColor: micActive ? 'rgba(180,60,40,0.35)' : colors.border,
              opacity: streaming ? 0.3 : 1,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={voiceListening ? '#b43c28' : colors.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="2" width="6" height="12" rx="3"/>
              <path d="M19 10a7 7 0 0 1-14 0"/>
              <line x1="12" y1="19" x2="12" y2="22"/>
              <line x1="8" y1="22" x2="16" y2="22"/>
            </svg>
          </button>
        )}
        <button
          onClick={() => void sendMessage()}
          disabled={streaming || input.trim().length === 0}
          style={{
            ...styles.sendBtn,
            opacity: streaming || input.trim().length === 0 ? 0.4 : 1,
            cursor: streaming || input.trim().length === 0 ? 'not-allowed' : 'pointer',
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: 'calc(100vh - 260px)',
    minHeight: 360,
    maxHeight: 'calc(100vh - 180px)',
  },

  header: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.md,
    paddingBottom: spacing.lg,
    borderBottom: `1px solid ${colors.border}`,
    marginBottom: spacing.lg,
  },
  headerDot: {
    width: 10,
    height: 10,
    borderRadius: '50%',
    backgroundColor: colors.accent,
    flexShrink: 0,
  },
  headerTitle: {
    fontFamily: fonts.serif,
    fontSize: 18,
    fontWeight: 400,
    color: colors.text,
    letterSpacing: -0.3,
  },
  headerSub: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },

  messageArea: {
    flex: 1,
    overflowY: 'auto' as const,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.lg,
    paddingBottom: spacing.lg,
  },

  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    gap: spacing.xl,
    paddingTop: spacing.xxxl,
  },
  emptyTitle: {
    fontFamily: fonts.serif,
    fontSize: 20,
    fontWeight: 300,
    color: colors.textMuted,
    letterSpacing: -0.3,
  },
  emptyHints: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: spacing.sm,
    justifyContent: 'center',
    maxWidth: 500,
  },
  hint: {
    padding: '8px 16px',
    borderRadius: radii.pill,
    border: `1px solid ${colors.border}`,
    backgroundColor: 'transparent',
    color: colors.textSecondary,
    fontFamily: fonts.sans,
    fontSize: 12,
    cursor: 'pointer',
    transition: 'border-color 0.15s ease, color 0.15s ease',
  },

  userRow: {
    display: 'flex',
    justifyContent: 'flex-end',
  },
  assistantRow: {
    display: 'flex',
    justifyContent: 'flex-start',
  },
  userBubble: {
    maxWidth: '75%',
    padding: '10px 16px',
    borderRadius: `${radii.md}px ${radii.md}px 2px ${radii.md}px`,
    backgroundColor: colors.text,
    color: '#fff',
  },
  assistantBubble: {
    maxWidth: '85%',
    padding: '10px 16px',
    borderRadius: `${radii.md}px ${radii.md}px ${radii.md}px 2px`,
    backgroundColor: colors.bgPanel,
    color: colors.text,
    border: `1px solid ${colors.border}`,
  },
  messageText: {
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
  },
  thinking: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  thinkingDots: {
    animation: 'thinkingPulse 1.4s ease-in-out infinite',
  },

  inputRow: {
    display: 'flex',
    gap: spacing.sm,
    paddingTop: spacing.lg,
    borderTop: `1px solid ${colors.border}`,
  },
  input: {
    flex: 1,
    padding: '12px 16px',
    fontSize: 13,
    fontFamily: fonts.sans,
    color: colors.text,
    backgroundColor: colors.bgInput,
    border: `1.5px solid ${colors.border}`,
    borderRadius: radii.sm,
    boxSizing: 'border-box' as const,
    transition: 'border-color 0.2s ease',
  },
  sendBtn: {
    padding: '12px 24px',
    fontSize: 12,
    fontWeight: 600,
    fontFamily: fonts.sans,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    color: '#fff',
    backgroundColor: colors.text,
    border: `2px solid ${colors.text}`,
    borderRadius: radii.sm,
    cursor: 'pointer',
    transition: 'opacity 0.2s ease',
    flexShrink: 0,
  },
  micBtn: {
    width: 42,
    height: 42,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '50%',
    border: `1.5px solid ${colors.border}`,
    backgroundColor: 'transparent',
    cursor: 'pointer',
    transition: 'background-color 0.2s ease, border-color 0.2s ease',
  },
};
