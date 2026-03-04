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

import { useRef, useCallback, useEffect } from 'react';
import { colors, fonts, spacing, radii } from '../../staffing/styles/tokens.js';

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

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Abort any in-flight request on unmount
  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;

    const userMessage: ConversationMessage = { role: 'user', content: text };
    const history = [...messages];

    setMessages(prev => [...prev, userMessage]);
    setInput('');
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
          updated[updated.length - 1] = { role: 'assistant', content: `Error: ${err.error || 'Something went wrong.'}` };
          return updated;
        });
        setStreaming(false);
        return;
      }

      // Read SSE stream
      const reader = res.body?.getReader();
      if (!reader) {
        setStreaming(false);
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Parse SSE lines
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? ''; // Keep incomplete line in buffer

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const jsonStr = line.slice(6);
            try {
              const event = JSON.parse(jsonStr) as { type: string; content?: string };

              if (event.type === 'text' && event.content) {
                setMessages(prev => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  updated[updated.length - 1] = { ...last, content: last.content + event.content };
                  return updated;
                });
              }

              if (event.type === 'error' && event.content) {
                setMessages(prev => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  updated[updated.length - 1] = { ...last, content: last.content + `\n\nError: ${event.content}` };
                  return updated;
                });
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (err) {
      // Don't update state if aborted (component unmounting)
      if (controller.signal.aborted) return;
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: 'assistant',
          content: `Connection error: ${err instanceof Error ? err.message : 'Unable to reach the server.'}`,
        };
        return updated;
      });
    } finally {
      if (!controller.signal.aborted) {
        setStreaming(false);
        inputRef.current?.focus();
      }
      abortRef.current = null;
    }
  }, [input, streaming, messages, sessionId, setMessages, setInput, setStreaming]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }, [sendMessage]);

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
      <div style={styles.messageArea}>
        {messages.length === 0 && (
          <div style={styles.emptyState}>
            <div style={styles.emptyTitle}>What would you like to know?</div>
            <div style={styles.emptyHints}>
              <button
                style={styles.hint}
                onClick={() => setInput('Summarize the key risks in plain language')}
                onMouseEnter={e => { e.currentTarget.style.borderColor = colors.textMuted; e.currentTarget.style.color = colors.text; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = colors.border; e.currentTarget.style.color = colors.textSecondary; }}
              >
                Summarize the key risks
              </button>
              <button
                style={styles.hint}
                onClick={() => setInput('Draft an alternative clause for the most critical finding')}
                onMouseEnter={e => { e.currentTarget.style.borderColor = colors.textMuted; e.currentTarget.style.color = colors.text; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = colors.border; e.currentTarget.style.color = colors.textSecondary; }}
              >
                Draft an alternative clause
              </button>
              <button
                style={styles.hint}
                onClick={() => setInput('What should we prioritize fixing first?')}
                onMouseEnter={e => { e.currentTarget.style.borderColor = colors.textMuted; e.currentTarget.style.color = colors.text; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = colors.border; e.currentTarget.style.color = colors.textSecondary; }}
              >
                What to fix first?
              </button>
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            style={msg.role === 'user' ? styles.userRow : styles.assistantRow}
          >
            <div style={msg.role === 'user' ? styles.userBubble : styles.assistantBubble}>
              {msg.role === 'assistant' && msg.content === '' && streaming ? (
                <span style={styles.thinking}>Thinking<span style={styles.thinkingDots}>...</span></span>
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
          placeholder="Ask a question about the analysis..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          style={styles.input}
          disabled={streaming}
          autoFocus
          onFocus={e => { e.currentTarget.style.borderColor = colors.accent; }}
          onBlur={e => { e.currentTarget.style.borderColor = colors.border; }}
        />
        <button
          onClick={sendMessage}
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
    minHeight: 400,
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
    outline: 'none',
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
};
