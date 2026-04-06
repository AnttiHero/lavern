/**
 * ConversationalChat — LLM-driven interview chat thread.
 *
 * Renders a true conversational thread: assistant messages with interviewer
 * avatar on the left, user messages on the right. Streams thinking dots
 * while waiting for the LLM response.
 *
 * Replaces BriefingChat when an interviewer persona is selected.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import type { InterviewMessage } from '../hooks/useLLMInterview.js';
import { colors, fonts, radii, spacing } from '../../staffing/styles/tokens.js';
import { useVoiceInput } from '../../partner/hooks/useVoiceInput.js';

// ── Component ─────────────────────────────────────────────────────────

interface Props {
  messages: InterviewMessage[];
  isStreaming: boolean;
  turnCount: number;
  maxTurns: number;
  error: string | null;
  onSendAnswer: (text: string) => Promise<void>;
  onFinalize: () => void;
  interviewerAvatar?: string;
  interviewerName?: string;
}

export function ConversationalChat({
  messages,
  isStreaming,
  turnCount,
  maxTurns,
  error,
  onSendAnswer,
  onFinalize,
  interviewerAvatar,
  interviewerName,
}: Props) {
  const [input, setInput] = useState('');
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sendTextRef = useRef<((text: string) => Promise<void>) | null>(null);
  const {
    isSupported: voiceSupported,
    isListening: voiceListening,
    finalTranscript: voiceFinalTranscript,
    startListening: voiceStart,
    stopListening: voiceStop,
    clearTranscript: voiceClear,
  } = useVoiceInput();

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when streaming stops
  useEffect(() => {
    if (!isStreaming) {
      inputRef.current?.focus();
    }
  }, [isStreaming]);

  const handleSend = useCallback(async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || isStreaming) return;
    if (!overrideText) setInput('');
    await onSendAnswer(text);
  }, [input, isStreaming, onSendAnswer]);

  // Keep a stable ref to handleSend so voice effects don't re-create on every input change
  useEffect(() => {
    sendTextRef.current = (text: string) => handleSend(text);
  }, [handleSend]);

  // Voice: fill input + auto-send 1.5s after final transcript arrives
  useEffect(() => {
    if (!voiceFinalTranscript || !voiceEnabled) return;
    const text = voiceFinalTranscript.trim();
    if (!text) return;
    setInput(text);
    const timer = setTimeout(() => {
      sendTextRef.current?.(text);
      voiceClear();
      setInput('');
    }, 1500);
    return () => clearTimeout(timer);
  }, [voiceFinalTranscript, voiceEnabled, voiceClear]);

  // Voice: restart listening after the assistant finishes responding
  // Only fires when isStreaming transitions (false) or voiceEnabled toggles — not on every message chunk
  const lastMsgRole = messages[messages.length - 1]?.role;
  const lastMsgHasContent = !!(messages[messages.length - 1]?.content);
  useEffect(() => {
    if (!voiceEnabled || isStreaming || voiceListening) return;
    if (lastMsgRole === 'assistant' && lastMsgHasContent) {
      voiceStart();
    }
  }, [voiceEnabled, isStreaming, voiceListening, lastMsgRole, lastMsgHasContent, voiceStart]);

  const handleVoiceToggle = useCallback(() => {
    if (!voiceEnabled) {
      setVoiceEnabled(true);
      voiceStart();
    } else {
      setVoiceEnabled(false);
      voiceStop();
      voiceClear();
      setInput('');
    }
  }, [voiceEnabled, voiceStart, voiceStop, voiceClear]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }, [handleSend]);

  const canFinalize = turnCount >= 2; // At least 2 answers before finalize
  const nearEnd = turnCount >= maxTurns - 2;

  return (
    <div style={styles.container}>
      {/* Messages thread */}
      <div style={styles.thread}>
        {/* Loading state — waiting for first message from startInterview */}
        {messages.length === 0 && !error && (
          <div
            style={{
              ...styles.messageRow,
              justifyContent: 'flex-start',
              animation: 'convFadeIn 0.3s ease both',
            }}
          >
            <div style={styles.avatarCol}>
              {interviewerAvatar ? (
                <div
                  style={styles.avatar}
                  // TRUST BOUNDARY: interviewerAvatar is a static SVG string from interviewers.ts —
                  // if this ever changes to user-supplied data, sanitize with DOMPurify first.
                  dangerouslySetInnerHTML={{ __html: interviewerAvatar }}
                />
              ) : (
                <div style={styles.avatarFallback}>M</div>
              )}
            </div>
            <div style={{ ...styles.bubble, ...styles.assistantBubble }}>
              <div style={styles.thinkingDots}>
                <span style={{ ...styles.dot, animationDelay: '0s' }} />
                <span style={{ ...styles.dot, animationDelay: '0.2s' }} />
                <span style={{ ...styles.dot, animationDelay: '0.4s' }} />
              </div>
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              ...styles.messageRow,
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
              animation: 'convFadeIn 0.3s ease both',
            }}
          >
            {msg.role === 'assistant' && (
              <div style={styles.avatarCol}>
                {interviewerAvatar ? (
                  <div
                    style={styles.avatar}
                    // TRUST BOUNDARY: interviewerAvatar is a static SVG string from interviewers.ts —
                  // if this ever changes to user-supplied data, sanitize with DOMPurify first.
                  dangerouslySetInnerHTML={{ __html: interviewerAvatar }}
                  />
                ) : (
                  <div style={styles.avatarFallback}>M</div>
                )}
              </div>
            )}

            <div style={{
              ...styles.bubble,
              ...(msg.role === 'user' ? styles.userBubble : styles.assistantBubble),
            }}>
              {msg.role === 'assistant' && msg.content === '' && isStreaming ? (
                // Thinking dots
                <div style={styles.thinkingDots}>
                  <span style={{ ...styles.dot, animationDelay: '0s' }} />
                  <span style={{ ...styles.dot, animationDelay: '0.2s' }} />
                  <span style={{ ...styles.dot, animationDelay: '0.4s' }} />
                </div>
              ) : (
                <span style={msg.role === 'user' ? styles.userText : styles.assistantText}>
                  {msg.content}
                </span>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Error banner */}
      {error && (
        <div style={styles.errorBanner}>
          Connection issue: {error}
        </div>
      )}

      {/* Input area */}
      <div style={styles.inputArea}>
        <div style={styles.inputRow}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            enterKeyHint="send"
            placeholder={
              isStreaming
                ? `${interviewerName ?? 'Interviewer'} is typing\u2026`
                : voiceEnabled && voiceListening
                  ? 'Listening\u2026'
                  : 'Type your answer\u2026'
            }
            disabled={isStreaming}
            rows={2}
            style={{
              ...styles.textarea,
              opacity: isStreaming ? 0.5 : 1,
              borderColor: voiceListening ? 'rgba(180,60,40,0.5)' : undefined,
            }}
          />
          {voiceSupported && (
            <button
              onClick={handleVoiceToggle}
              title={voiceEnabled ? 'Turn off voice mode' : 'Turn on voice mode'}
              style={{
                ...styles.micBtn,
                backgroundColor: voiceEnabled ? (voiceListening ? 'rgba(180,60,40,0.12)' : 'rgba(26,26,26,0.06)') : 'transparent',
                borderColor: voiceEnabled ? (voiceListening ? 'rgba(180,60,40,0.4)' : colors.border) : colors.border,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={voiceListening ? '#b43c28' : voiceEnabled ? colors.text : colors.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="2" width="6" height="12" rx="3"/>
                <path d="M19 10a7 7 0 0 1-14 0"/>
                <line x1="12" y1="19" x2="12" y2="22"/>
                <line x1="8" y1="22" x2="16" y2="22"/>
              </svg>
            </button>
          )}
          <button
            onClick={() => void handleSend()}
            disabled={isStreaming || !input.trim()}
            style={{
              ...styles.sendBtn,
              opacity: isStreaming || !input.trim() ? 0.4 : 1,
            }}
          >
            Send
          </button>
        </div>

        <div style={styles.footer}>
          <span style={styles.turnCounter}>
            Question {turnCount + 1} of {maxTurns}
          </span>

          {canFinalize && (
            <button
              onClick={onFinalize}
              disabled={isStreaming}
              style={{
                ...styles.finalizeBtn,
                ...(nearEnd ? styles.finalizeBtnHighlight : {}),
                opacity: isStreaming ? 0.5 : 1,
              }}
            >
              Generate Briefing {'\u2192'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.md,
  },

  // Thread
  thread: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.md,
    minHeight: 200,
  },
  messageRow: {
    display: 'flex',
    gap: 10,
    alignItems: 'flex-start',
  },

  // Avatar
  avatarCol: {
    flexShrink: 0,
    width: 32,
  },
  avatar: {
    width: 32,
    height: 32,
  },
  avatarFallback: {
    width: 32,
    height: 32,
    borderRadius: '50%',
    backgroundColor: colors.bgPanel,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: fonts.serif,
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: 300,
  },

  // Bubbles
  bubble: {
    maxWidth: '80%',
    padding: '10px 14px',
    borderRadius: radii.md,
    lineHeight: 1.55,
  },
  assistantBubble: {
    backgroundColor: 'rgba(196, 93, 62, 0.04)',
    borderLeft: `3px solid ${colors.accent}`,
  },
  userBubble: {
    backgroundColor: colors.text,
    borderRadius: radii.md,
  },
  assistantText: {
    fontSize: 13,
    fontFamily: fonts.sans,
    color: colors.text,
  },
  userText: {
    fontSize: 13,
    fontFamily: fonts.sans,
    color: '#fff',
  },

  // Thinking dots
  thinkingDots: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    padding: '2px 0',
  },
  dot: {
    display: 'inline-block',
    width: 6,
    height: 6,
    borderRadius: '50%',
    backgroundColor: colors.accent,
    animation: 'convThinkDot 1.4s ease-in-out infinite',
  },

  // Error
  errorBanner: {
    fontSize: 11,
    fontFamily: fonts.sans,
    color: colors.danger,
    padding: '6px 12px',
    backgroundColor: 'rgba(196, 93, 62, 0.06)',
    borderRadius: radii.sm,
    borderLeft: `3px solid ${colors.danger}`,
  },

  // Input area
  inputArea: {
    marginTop: spacing.sm,
  },
  inputRow: {
    display: 'flex',
    gap: spacing.sm,
    alignItems: 'flex-end',
  },
  textarea: {
    flex: 1,
    padding: '10px 14px',
    borderRadius: radii.md,
    border: `1px solid ${colors.border}`,
    backgroundColor: colors.bgCard,
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.text,
    resize: 'none' as const,
    lineHeight: 1.5,
    transition: 'border-color 0.15s ease',
  },
  sendBtn: {
    padding: '10px 20px',
    borderRadius: radii.sm,
    border: `2px solid ${colors.text}`,
    backgroundColor: colors.text,
    color: '#fff',
    fontFamily: fonts.sans,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'opacity 0.15s ease',
    whiteSpace: 'nowrap' as const,
  },
  micBtn: {
    width: 40,
    height: 40,
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

  // Footer
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  turnCounter: {
    fontSize: 10,
    fontFamily: fonts.sans,
    fontWeight: 500,
    color: colors.textDim,
    letterSpacing: 0.3,
    textTransform: 'uppercase' as const,
  },
  finalizeBtn: {
    padding: '8px 20px',
    borderRadius: radii.sm,
    border: `2px solid ${colors.text}`,
    backgroundColor: 'transparent',
    color: colors.text,
    fontFamily: fonts.sans,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background-color 0.2s ease, color 0.2s ease',
  },
  finalizeBtnHighlight: {
    backgroundColor: colors.text,
    color: '#fff',
  },
};
