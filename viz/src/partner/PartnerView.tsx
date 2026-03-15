/**
 * PartnerView — Conversational intake with the managing partner.
 *
 * A minimal chat interface on warm background. The managing
 * partner (Catherine M. Blackwell) conducts a 2-3 turn conversation, then
 * produces a recommendation card. User confirms → session starts.
 *
 * Voice Mode: Deepgram STT + ElevenLabs TTS with browser-native fallback.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { colors } from '../staffing/styles/tokens.js';
import { cn } from '../utils/cn.js';
import { usePartnerConsult, type PartnerRecommendation } from './hooks/usePartnerConsult.js';
import { useVoiceInput } from './hooks/useVoiceInput.js';
import { useVoiceOutput } from './hooks/useVoiceOutput.js';
import { VoiceOrb } from './components/VoiceOrb.js';
import { YOLO_CONFIGS } from '../landing/yolo-config.js';

interface Props {
  onSessionCreated: (sessionId: string) => void;
  onManualFlow: () => void;
  onBack: () => void;
}

// ── Workflow display names ──────────────────────────────────────────────

const WORKFLOW_LABELS: Record<string, string> = {
  counsel: 'Expert Counsel',
  review: 'Contract Review',
  adversarial: 'Adversarial Analysis',
  roundtable: 'Expert Roundtable',
  'legal-design': 'Legal Design',
  'full-bench': 'Full Bench',
};

// ── SVG Icons ───────────────────────────────────────────────────────────

function MicIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="1" width="6" height="11" rx="3" />
      <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

function SpeakerIcon({ size = 14, muted = false }: { size?: number; muted?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      {muted ? (
        <>
          <line x1="23" y1="9" x2="17" y2="15" />
          <line x1="17" y1="9" x2="23" y2="15" />
        </>
      ) : (
        <>
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
        </>
      )}
    </svg>
  );
}

// ── The View ────────────────────────────────────────────────────────────

export default function PartnerView({ onSessionCreated, onManualFlow, onBack }: Props) {
  const {
    messages,
    isStreaming,
    streamingText,
    recommendation,
    isFinalizing,
    error,
    sendMessage,
    startConversation,
    finalize,
    readyToFinalize,
  } = usePartnerConsult();

  const voiceInput = useVoiceInput();
  const voiceOutput = useVoiceOutput();

  const [input, setInput] = useState('');
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasStarted = useRef(false);
  const autoSubmitTimer = useRef<ReturnType<typeof setTimeout>>();
  const lastMessageCount = useRef(0);
  const inputFocusedRef = useRef(false);

  // Start the conversation on mount
  useEffect(() => {
    if (!hasStarted.current) {
      hasStarted.current = true;
      startConversation();
    }
  }, [startConversation]);

  // Auto-scroll to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText, recommendation]);

  // Auto-finalize when partner signals readiness
  useEffect(() => {
    if (readyToFinalize && !recommendation && !isFinalizing) {
      const t = setTimeout(() => finalize(), 1500);
      return () => clearTimeout(t);
    }
  }, [readyToFinalize, recommendation, isFinalizing, finalize]);

  // ── Voice output: speak new assistant messages ─────────────────────
  useEffect(() => {
    if (!isStreaming && messages.length > lastMessageCount.current) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg?.role === 'assistant' && voiceOutput.isEnabled) {
        voiceOutput.speak(lastMsg.content);
      }
      lastMessageCount.current = messages.length;
    }
  }, [isStreaming, messages, voiceOutput]);

  // ── Voice input: populate input with transcript ────────────────────
  useEffect(() => {
    if (voiceInput.finalTranscript) {
      setInput(voiceInput.finalTranscript);
    }
  }, [voiceInput.finalTranscript]);

  // ── Auto-submit after voice input stops ────────────────────────────
  useEffect(() => {
    if (!voiceInput.isListening && voiceInput.finalTranscript && !isStreaming) {
      // Auto-submit after 1 second
      autoSubmitTimer.current = setTimeout(() => {
        const text = voiceInput.finalTranscript.trim();
        if (text) {
          sendMessage(text);
          setInput('');
          voiceInput.clearTranscript();
        }
      }, 1000);
      return () => clearTimeout(autoSubmitTimer.current);
    }
  }, [voiceInput.isListening, voiceInput.finalTranscript, isStreaming, sendMessage, voiceInput]);

  // ── Spacebar push-to-talk ──────────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return;
      if (inputFocusedRef.current) return; // Don't hijack typing
      if (recommendation || isStreaming || isFinalizing) return;
      if (!voiceInput.isSupported) return;

      e.preventDefault();
      // Stop TTS if playing to prevent echo
      voiceOutput.stop();
      voiceInput.startListening();
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      if (inputFocusedRef.current) return;
      if (voiceInput.isListening) {
        e.preventDefault();
        voiceInput.stopListening();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
    };
  }, [voiceInput, voiceOutput, recommendation, isStreaming, isFinalizing]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;
    clearTimeout(autoSubmitTimer.current);
    sendMessage(input);
    setInput('');
    voiceInput.clearTranscript();
  }, [input, isStreaming, sendMessage, voiceInput]);

  const handleMicPress = useCallback(() => {
    if (!voiceInput.isSupported || isStreaming) return;
    // Stop TTS to prevent echo
    voiceOutput.stop();
    // Cancel any pending auto-submit
    clearTimeout(autoSubmitTimer.current);
    voiceInput.startListening();
  }, [voiceInput, voiceOutput, isStreaming]);

  const handleMicRelease = useCallback(() => {
    if (voiceInput.isListening) {
      voiceInput.stopListening();
    }
  }, [voiceInput]);

  const handleProceed = useCallback(async (rec: PartnerRecommendation) => {
    setIsCreatingSession(true);
    setSessionError(null);
    voiceOutput.stop(); // Stop any TTS

    const matterId = `partner-${Date.now()}`;

    sessionStorage.setItem('shem-matter-id', matterId);
    sessionStorage.setItem('shem-matter-data', JSON.stringify({
      matterId,
      matterNumber: `MBL-P-${Date.now().toString(36).toUpperCase()}`,
      clientName: 'Partner Consultation',
      matterTitle: rec.briefingMemo.slice(0, 80),
      matterType: rec.requestType,
      jurisdiction: 'General',
      response: {
        conflictCheck: { conflictFound: false },
        kyc: { clientVerified: true, riskLevel: 'low', flags: [] },
        engagementLetter: {
          scope: rec.briefingMemo,
          feeStructure: 'fixed',
          estimatedBudget: { min: rec.budgetUsd, max: rec.budgetUsd, currency: 'USD' },
          accepted: true,
        },
      },
    }));
    sessionStorage.setItem('shem-briefing-memo', `# Partner Consultation Brief\n\n${rec.briefingMemo}`);
    sessionStorage.setItem('shem-briefing-config', JSON.stringify({
      workflowId: rec.workflowId,
      intensity: rec.intensity,
      budgetUsd: rec.budgetUsd,
      yoloMode: true,
    }));
    sessionStorage.setItem('shem-briefing-team', JSON.stringify(rec.teamRoles));

    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          request: {
            type: rec.requestType,
            requestText: rec.briefingMemo,
          },
          team: rec.teamRoles,
          workflow: rec.workflowId,
          options: {
            budget: rec.budgetUsd,
            intensity: rec.intensity,
            yoloMode: true,
            verification: rec.workflowId !== 'counsel',
          },
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Session creation failed' }));
        if (res.status === 402) {
          window.location.hash = '#/pricing?topoff=true';
          return;
        }
        throw new Error((errData as { error?: string }).error || `HTTP ${res.status}`);
      }

      const data = await res.json() as { sessionId: string };
      onSessionCreated(data.sessionId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to create session';
      setSessionError(msg);
    } finally {
      setIsCreatingSession(false);
    }
  }, [onSessionCreated, voiceOutput]);

  // Display text in input: show transcript when listening
  const displayValue = voiceInput.isListening
    ? (voiceInput.finalTranscript + (voiceInput.interimTranscript ? ` ${voiceInput.interimTranscript}` : '')).trim()
    : input;

  const displayPlaceholder = voiceInput.isListening
    ? 'Listening...'
    : isStreaming
      ? 'Partner is speaking...'
      : 'Type your message or hold the mic...';

  return (
    <div style={styles.container}>
      {/* ── Background ──────────────────────────────────── */}
      <img
        src={`${import.meta.env.BASE_URL}photo-1640280882429-204f63d777e7.avif`}
        alt=""
        style={styles.bgImage}
      />
      <div style={styles.bgOverlay} />

      {/* ── Header ─────────────────────────────────────────────── */}
      <div style={styles.header}>
        <button onClick={onBack} style={styles.backBtn}>
          {'\u2190'} Back
        </button>
        <button onClick={onManualFlow} style={styles.manualBtn}>
          Configure manually
        </button>
      </div>

      {/* ── Chat area ──────────────────────────────────────────── */}
      <div style={styles.chatWrapper}>
        <div style={styles.chatCard}>
        <div style={styles.chatArea}>
          {/* Partner identity */}
          <div style={styles.partnerHeader}>
            <div style={{
              ...styles.avatar,
              ...(voiceOutput.isSpeaking ? { animation: 'voiceSpeakingPulse 2s ease-in-out infinite' } : {}),
            }}>
              CB
            </div>
            <div style={{ flex: 1 }}>
              <div style={styles.partnerName}>Catherine M. Blackwell</div>
              <div style={styles.partnerTitle}>Managing Partner</div>
            </div>
            {/* Voice output toggle */}
            <button
              onClick={() => voiceOutput.setEnabled(!voiceOutput.isEnabled)}
              style={{
                ...styles.voiceToggle,
                opacity: voiceOutput.isEnabled ? 0.7 : 0.25,
              }}
              title={voiceOutput.isEnabled ? 'Voice on — click to mute' : 'Voice off — click to enable'}
              aria-label={voiceOutput.isEnabled ? 'Disable voice output' : 'Enable voice output'}
            >
              <SpeakerIcon muted={!voiceOutput.isEnabled} />
            </button>
          </div>

          {/* Messages */}
          {messages.map((msg, i) => (
            <div
              key={i}
              style={msg.role === 'assistant' ? styles.assistantBubble : styles.userBubble}
            >
              {msg.content}
            </div>
          ))}

          {/* Streaming text */}
          {isStreaming && streamingText && (
            <div style={styles.assistantBubble}>
              {streamingText}
              <span style={styles.cursor}>|</span>
            </div>
          )}

          {/* Loading indicator */}
          {isStreaming && !streamingText && (
            <div style={styles.assistantBubble}>
              <span style={styles.typing}>
                <span style={styles.dot} />
                <span style={{ ...styles.dot, animationDelay: '0.2s' }} />
                <span style={{ ...styles.dot, animationDelay: '0.4s' }} />
              </span>
            </div>
          )}

          {/* Finalizing indicator */}
          {isFinalizing && (
            <div style={styles.finalizingCard}>
              <div style={styles.finalizingText}>
                Preparing your engagement recommendation...
              </div>
            </div>
          )}

          {/* Recommendation card */}
          {recommendation && (
            <RecommendationCard
              rec={recommendation}
              onProceed={() => handleProceed(recommendation)}
              onManual={onManualFlow}
              isCreating={isCreatingSession}
              error={sessionError}
            />
          )}

          {/* Error */}
          {error && !isFinalizing && (
            <div style={styles.errorMsg}>{error}</div>
          )}
          {voiceInput.error && (
            <div style={styles.errorMsg}>{voiceInput.error}</div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* ── Input bar with mic ──────────────────────────────────── */}
        {!recommendation && (
          <div style={styles.inputBar}>
            {/* Mic button */}
            {voiceInput.isSupported && (
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <VoiceOrb audioLevel={voiceInput.audioLevel} isListening={voiceInput.isListening} />
                <button
                  onMouseDown={handleMicPress}
                  onMouseUp={handleMicRelease}
                  onMouseLeave={handleMicRelease}
                  onTouchStart={handleMicPress}
                  onTouchEnd={handleMicRelease}
                  disabled={isStreaming}
                  style={{
                    ...styles.micBtn,
                    ...(voiceInput.isListening ? styles.micBtnListening : {}),
                    ...(isStreaming ? { opacity: 0.3 } : {}),
                  }}
                  aria-label={voiceInput.isListening ? 'Release to stop' : 'Hold to speak'}
                  title="Hold to speak (or hold spacebar)"
                >
                  <MicIcon size={18} />
                </button>
              </div>
            )}

            {/* Text input */}
            <form onSubmit={handleSubmit} style={{ flex: 1, display: 'flex', gap: 8 }}>
              <input
                ref={inputRef}
                type="text"
                value={displayValue}
                onChange={e => {
                  setInput(e.target.value);
                  // Cancel auto-submit if user edits
                  clearTimeout(autoSubmitTimer.current);
                }}
                onFocus={() => { inputFocusedRef.current = true; }}
                onBlur={() => { inputFocusedRef.current = false; }}
                placeholder={displayPlaceholder}
                disabled={isStreaming || voiceInput.isListening}
                style={{
                  ...styles.input,
                  ...(voiceInput.isListening ? { fontStyle: 'italic', color: '#6b6b67' } : {}),
                }}
                autoFocus
              />
              <button
                type="submit"
                disabled={isStreaming || !displayValue.trim() || voiceInput.isListening}
                style={{
                  ...styles.sendBtn,
                  opacity: isStreaming || !displayValue.trim() || voiceInput.isListening ? 0.3 : 1,
                }}
              >
                Send
              </button>
            </form>
          </div>
        )}
        </div>{/* chatCard */}
      </div>
    </div>
  );
}

// ── Recommendation Card ─────────────────────────────────────────────────

function RecommendationCard({
  rec,
  onProceed,
  onManual,
  isCreating,
  error,
}: {
  rec: PartnerRecommendation;
  onProceed: () => void;
  onManual: () => void;
  isCreating: boolean;
  error: string | null;
}) {
  return (
    <div style={styles.recCard}>
      <div style={styles.recHeader}>Engagement Recommendation</div>
      <div style={styles.recGrid}>
        <div style={styles.recItem}>
          <div style={styles.recLabel}>Workflow</div>
          <div style={styles.recValue}>{WORKFLOW_LABELS[rec.workflowId] ?? rec.workflowId}</div>
        </div>
        <div style={styles.recItem}>
          <div style={styles.recLabel}>Team Size</div>
          <div style={styles.recValue}>{rec.teamRoles.length} specialists</div>
        </div>
        <div style={styles.recItem}>
          <div style={styles.recLabel}>Estimated Cost</div>
          <div style={styles.recValue}>${rec.budgetUsd.toFixed(0)}</div>
        </div>
        <div style={styles.recItem}>
          <div style={styles.recLabel}>Intensity</div>
          <div style={styles.recValue} className="capitalize">{rec.intensity}</div>
        </div>
      </div>
      <div style={styles.recReasoning}>{rec.reasoning}</div>

      <div style={styles.recActions}>
        <button
          onClick={onProceed}
          disabled={isCreating}
          style={{
            ...styles.proceedBtn,
            opacity: isCreating ? 0.6 : 1,
          }}
        >
          {isCreating ? 'Creating session...' : 'Proceed \u2192'}
        </button>
        <button onClick={onManual} style={styles.configureBtn}>
          Configure manually
        </button>
      </div>

      {error && (
        <div style={styles.errorMsg}>{error}</div>
      )}
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'fixed',
    inset: 0,
    width: '100%',
    height: '100dvh',
    backgroundColor: '#f0ede8',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    zIndex: 9999,
  },
  bgImage: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    filter: 'contrast(0.75) brightness(1.12) saturate(0.3)',
    opacity: 0.35,
  },
  bgOverlay: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(245, 243, 239, 0.4)',
    pointerEvents: 'none',
  },
  header: {
    position: 'relative',
    zIndex: 10,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 24px',
  },
  backBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontFamily: "'Inter', sans-serif",
    fontSize: 12,
    fontWeight: 500,
    letterSpacing: 1,
    color: '#4a4a4a',
    padding: '4px 8px',
  },
  manualBtn: {
    background: 'rgba(255,255,255,0.5)',
    border: `1px solid rgba(26, 26, 26, 0.2)`,
    borderRadius: 3,
    cursor: 'pointer',
    fontFamily: "'Inter', sans-serif",
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
    color: '#4a4a4a',
    padding: '6px 14px',
    transition: 'opacity 0.2s',
  },
  chatWrapper: {
    position: 'relative',
    zIndex: 10,
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    maxWidth: 680,
    width: '100%',
    margin: '0 auto',
    padding: '0 20px',
    overflow: 'hidden',
  },
  chatCard: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
    backdropFilter: 'blur(20px)',
    borderRadius: 16,
    border: '1px solid rgba(26, 26, 26, 0.08)',
    padding: '24px 28px 0',
    overflow: 'hidden',
    boxShadow: '0 4px 40px rgba(26, 26, 26, 0.06)',
  },
  chatArea: {
    flex: 1,
    overflowY: 'auto',
    paddingBottom: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  partnerHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    marginBottom: 8,
    paddingBottom: 16,
    borderBottom: '1px solid rgba(26, 26, 26, 0.06)',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: '50%',
    backgroundColor: colors.accent,
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: 18,
    fontWeight: 600,
    flexShrink: 0,
    transition: 'box-shadow 0.3s ease',
  },
  partnerName: {
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: 20,
    fontWeight: 700,
    color: '#1a1a1a',
    letterSpacing: 0.3,
  },
  partnerTitle: {
    fontFamily: "'Inter', sans-serif",
    fontSize: 11,
    fontWeight: 600,
    color: '#4a4a4a',
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
    marginTop: 2,
  },
  voiceToggle: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 6,
    borderRadius: 4,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: colors.text,
    transition: 'opacity 0.2s',
    flexShrink: 0,
  },
  assistantBubble: {
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: 18,
    fontWeight: 500,
    lineHeight: 1.65,
    color: '#1a1a1a',
    fontStyle: 'italic',
    maxWidth: '85%',
    padding: '12px 0',
  },
  userBubble: {
    fontFamily: "'Inter', sans-serif",
    fontSize: 14,
    lineHeight: 1.6,
    color: '#1a1a1a',
    maxWidth: '85%',
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(26, 26, 26, 0.06)',
    borderRadius: 12,
    padding: '10px 16px',
  },
  cursor: {
    animation: 'blink 1s step-end infinite',
    opacity: 0.4,
  },
  typing: {
    display: 'flex',
    gap: 4,
    padding: '4px 0',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    backgroundColor: colors.text,
    opacity: 0.2,
    animation: 'partnerDot 1.4s ease-in-out infinite',
  },
  finalizingCard: {
    padding: '16px 20px',
    backgroundColor: 'rgba(26, 26, 26, 0.03)',
    borderRadius: 12,
    border: '1px solid rgba(26, 26, 26, 0.06)',
  },
  finalizingText: {
    fontFamily: "'Inter', sans-serif",
    fontSize: 13,
    color: colors.text,
    opacity: 0.6,
    fontStyle: 'italic',
  },
  recCard: {
    padding: '24px',
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    backdropFilter: 'blur(12px)',
    borderRadius: 12,
    border: `1px solid rgba(196, 93, 62, 0.15)`,
    animation: 'lobbyFadeUp 0.5s ease both',
  },
  recHeader: {
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: 20,
    fontWeight: 600,
    color: colors.text,
    marginBottom: 16,
    letterSpacing: 0.3,
  },
  recGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 12,
    marginBottom: 16,
  },
  recItem: {
    padding: '8px 0',
  },
  recLabel: {
    fontFamily: "'Inter', sans-serif",
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
    color: colors.text,
    opacity: 0.4,
    marginBottom: 4,
  },
  recValue: {
    fontFamily: "'Inter', sans-serif",
    fontSize: 15,
    fontWeight: 500,
    color: colors.text,
  },
  recReasoning: {
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: 15,
    fontStyle: 'italic',
    lineHeight: 1.6,
    color: colors.text,
    opacity: 0.7,
    marginBottom: 20,
    paddingTop: 12,
    borderTop: '1px solid rgba(26, 26, 26, 0.06)',
  },
  recActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
  },
  proceedBtn: {
    fontFamily: "'Inter', sans-serif",
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
    color: '#fff',
    backgroundColor: colors.accent,
    border: 'none',
    borderRadius: 4,
    padding: '12px 28px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  configureBtn: {
    fontFamily: "'Inter', sans-serif",
    fontSize: 11,
    fontWeight: 500,
    letterSpacing: 1,
    color: colors.text,
    opacity: 0.45,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '4px 8px',
    textDecoration: 'underline',
    textUnderlineOffset: 3,
  },
  inputBar: {
    position: 'relative',
    zIndex: 10,
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '12px 0 20px',
    borderTop: '1px solid rgba(26, 26, 26, 0.08)',
  },
  micBtn: {
    position: 'relative',
    zIndex: 1,
    width: 44,
    height: 44,
    borderRadius: '50%',
    border: `1px solid rgba(26, 26, 26, 0.1)`,
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
    backdropFilter: 'blur(8px)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    transition: 'all 0.2s ease',
    animation: 'voiceMicBreath 3s ease-in-out infinite',
    color: '#4a4a4a',
  },
  micBtnListening: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
    color: '#fff',
    animation: 'voiceListening 1.5s ease-in-out infinite',
  },
  input: {
    flex: 1,
    fontFamily: "'Inter', sans-serif",
    fontSize: 14,
    color: colors.text,
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
    border: '1px solid rgba(26, 26, 26, 0.1)',
    borderRadius: 8,
    padding: '12px 16px',
    outline: 'none',
    backdropFilter: 'blur(8px)',
  },
  sendBtn: {
    fontFamily: "'Inter', sans-serif",
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
    color: '#fff',
    backgroundColor: colors.accent,
    border: 'none',
    borderRadius: 8,
    padding: '12px 20px',
    cursor: 'pointer',
    transition: 'opacity 0.2s',
    flexShrink: 0,
  },
  errorMsg: {
    fontFamily: "'Inter', sans-serif",
    fontSize: 12,
    color: colors.accent,
    opacity: 0.8,
    marginTop: 8,
  },
};
