/**
 * PartnerView -- Voice-first consultation with the managing partner.
 *
 * A large central orb represents Catherine M. Blackwell's presence.
 * Push-to-talk (spacebar or tap the orb) is the primary interaction.
 * A tiny text input at the bottom serves as a fallback.
 *
 * Voice Mode: Deepgram STT + ElevenLabs TTS with browser-native fallback.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { colors } from '../staffing/styles/tokens.js';
import { usePartnerConsult, type PartnerRecommendation } from './hooks/usePartnerConsult.js';
import { useVoiceInput } from './hooks/useVoiceInput.js';
import { useVoiceOutput } from './hooks/useVoiceOutput.js';
import { VoiceOrb } from './components/VoiceOrb.js';

interface Props {
  onSessionCreated: (sessionId: string) => void;
  onManualFlow: () => void;
  onBack: () => void;
}

const GOLD = '#96875f';

const WORKFLOW_LABELS: Record<string, string> = {
  counsel: 'Expert Counsel',
  review: 'Contract Review',
  adversarial: 'Adversarial Analysis',
  roundtable: 'Expert Roundtable',
  'legal-design': 'Legal Design',
  'full-bench': 'Full Bench',
};

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
  const [lastUserMessage, setLastUserMessage] = useState<string | null>(null);
  const hasStarted = useRef(false);
  const autoSubmitTimer = useRef<ReturnType<typeof setTimeout>>();
  const userFadeTimer = useRef<ReturnType<typeof setTimeout>>();
  const lastMessageCount = useRef(0);
  const inputFocusedRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Start conversation on mount
  useEffect(() => {
    if (!hasStarted.current) {
      hasStarted.current = true;
      startConversation();
    }
  }, [startConversation]);

  // Auto-finalize
  useEffect(() => {
    if (readyToFinalize && !recommendation && !isFinalizing) {
      const t = setTimeout(() => finalize(), 1500);
      return () => clearTimeout(t);
    }
  }, [readyToFinalize, recommendation, isFinalizing, finalize]);

  // Speak new assistant messages
  useEffect(() => {
    if (!isStreaming && messages.length > lastMessageCount.current) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg?.role === 'assistant' && voiceOutput.isEnabled) {
        voiceOutput.speak(lastMsg.content);
      }
      lastMessageCount.current = messages.length;
    }
  }, [isStreaming, messages, voiceOutput]);

  // Populate input with voice transcript
  useEffect(() => {
    if (voiceInput.finalTranscript) {
      setInput(voiceInput.finalTranscript);
    }
  }, [voiceInput.finalTranscript]);

  // Auto-submit after voice stops
  useEffect(() => {
    if (!voiceInput.isListening && voiceInput.finalTranscript && !isStreaming) {
      autoSubmitTimer.current = setTimeout(() => {
        const text = voiceInput.finalTranscript.trim();
        if (text) {
          setLastUserMessage(text);
          sendMessage(text);
          setInput('');
          voiceInput.clearTranscript();
          // Fade user message after 4s
          clearTimeout(userFadeTimer.current);
          userFadeTimer.current = setTimeout(() => setLastUserMessage(null), 4000);
        }
      }, 1000);
      return () => clearTimeout(autoSubmitTimer.current);
    }
  }, [voiceInput.isListening, voiceInput.finalTranscript, isStreaming, sendMessage, voiceInput]);

  // Spacebar push-to-talk
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return;
      if (inputFocusedRef.current) return;
      if (recommendation || isStreaming || isFinalizing) return;
      if (!voiceInput.isSupported) return;
      e.preventDefault();
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
    setLastUserMessage(input.trim());
    sendMessage(input);
    setInput('');
    voiceInput.clearTranscript();
    clearTimeout(userFadeTimer.current);
    userFadeTimer.current = setTimeout(() => setLastUserMessage(null), 4000);
  }, [input, isStreaming, sendMessage, voiceInput]);

  const handleMicPress = useCallback(() => {
    if (!voiceInput.isSupported || isStreaming) return;
    voiceOutput.stop();
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
    voiceOutput.stop();

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
          request: { type: rec.requestType, requestText: rec.briefingMemo },
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

  // Latest assistant message
  const latestAssistant = [...messages].reverse().find(m => m.role === 'assistant');

  // Status hint text
  let statusText = '';
  if (voiceInput.isListening) {
    const transcript = (voiceInput.finalTranscript + (voiceInput.interimTranscript ? ` ${voiceInput.interimTranscript}` : '')).trim();
    statusText = transcript || 'Listening...';
  } else if (isStreaming && !streamingText) {
    statusText = 'Catherine is thinking...';
  } else if (isFinalizing) {
    statusText = 'Preparing your recommendation...';
  } else if (!recommendation && !isStreaming && messages.length > 0) {
    statusText = voiceInput.isSupported ? 'Hold spacebar or tap to speak' : '';
  }

  return (
    <div style={S.container}>
      <img
        src={`${import.meta.env.BASE_URL}photo-1640280882429-204f63d777e7.avif`}
        alt=""
        style={S.bgImage}
      />
      <div style={S.bgOverlay} />

      {/* Header */}
      <div style={S.header}>
        <button onClick={onBack} style={S.backBtn}>
          {'\u2190'} Back
        </button>
        <button onClick={onManualFlow} style={S.manualBtn}>
          Configure manually
        </button>
      </div>

      {/* Main content */}
      <div style={S.main}>
        {/* Catherine's identity */}
        <div style={S.identity}>
          <div style={S.name}>Catherine M. Blackwell</div>
          <div style={S.title}>Managing Partner</div>
          <button
            onClick={() => voiceOutput.setEnabled(!voiceOutput.isEnabled)}
            style={{ ...S.voiceToggle, opacity: voiceOutput.isEnabled ? 0.7 : 0.25 }}
            title={voiceOutput.isEnabled ? 'Voice on' : 'Voice off'}
            aria-label={voiceOutput.isEnabled ? 'Disable voice output' : 'Enable voice output'}
          >
            <SpeakerIcon muted={!voiceOutput.isEnabled} />
          </button>
        </div>

        {/* The Orb */}
        <VoiceOrb
          audioLevel={voiceInput.audioLevel}
          isListening={voiceInput.isListening}
          isSpeaking={voiceOutput.isSpeaking}
          isStreaming={isStreaming}
          disabled={!!recommendation}
          onMouseDown={handleMicPress}
          onMouseUp={handleMicRelease}
          onTouchStart={handleMicPress}
          onTouchEnd={handleMicRelease}
        />

        {/* Status hint */}
        <div style={{
          ...S.statusHint,
          ...(voiceInput.isListening ? { fontStyle: 'italic', color: GOLD } : {}),
        }}>
          {statusText}
        </div>

        {/* Catherine's text */}
        {(isStreaming && streamingText) ? (
          <div style={S.catherineText} key="streaming">
            {streamingText}
            <span style={{ animation: 'blink 1s step-end infinite', opacity: 0.4 }}>|</span>
          </div>
        ) : latestAssistant && !recommendation ? (
          <div style={S.catherineText} key={`msg-${messages.length}`}>
            {latestAssistant.content}
          </div>
        ) : null}

        {/* User echo */}
        {lastUserMessage && (
          <div style={S.userEcho} key={`user-${lastUserMessage.slice(0, 20)}`}>
            {lastUserMessage}
          </div>
        )}

        {/* Recommendation */}
        {recommendation && (
          <RecommendationCard
            rec={recommendation}
            onProceed={() => handleProceed(recommendation)}
            onManual={onManualFlow}
            isCreating={isCreatingSession}
            error={sessionError}
          />
        )}

        {/* Errors */}
        {error && !isFinalizing && <div style={S.errorMsg}>{error}</div>}
        {voiceInput.error && <div style={S.errorMsg}>{voiceInput.error}</div>}

        {/* Text fallback */}
        {!recommendation && (
          <form onSubmit={handleSubmit} style={S.textFallback}>
            <input
              ref={inputRef}
              type="text"
              value={voiceInput.isListening ? '' : input}
              onChange={e => {
                setInput(e.target.value);
                clearTimeout(autoSubmitTimer.current);
              }}
              onFocus={() => { inputFocusedRef.current = true; }}
              onBlur={() => { inputFocusedRef.current = false; }}
              placeholder="or type instead..."
              disabled={isStreaming || voiceInput.isListening}
              style={S.textInput}
            />
          </form>
        )}
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
    <div style={S.recCard}>
      <div style={S.recHeader}>Engagement Recommendation</div>
      <div style={S.recGrid}>
        <div style={S.recItem}>
          <div style={S.recLabel}>Workflow</div>
          <div style={S.recValue}>{WORKFLOW_LABELS[rec.workflowId] ?? rec.workflowId}</div>
        </div>
        <div style={S.recItem}>
          <div style={S.recLabel}>Team Size</div>
          <div style={S.recValue}>{rec.teamRoles.length} specialists</div>
        </div>
        <div style={S.recItem}>
          <div style={S.recLabel}>Estimated Cost</div>
          <div style={S.recValue}>${rec.budgetUsd.toFixed(0)}</div>
        </div>
        <div style={S.recItem}>
          <div style={S.recLabel}>Intensity</div>
          <div style={S.recValue} className="capitalize">{rec.intensity}</div>
        </div>
      </div>
      <div style={S.recReasoning}>{rec.reasoning}</div>
      <div style={S.recActions}>
        <button
          onClick={onProceed}
          disabled={isCreating}
          style={{ ...S.proceedBtn, opacity: isCreating ? 0.6 : 1 }}
        >
          {isCreating ? 'Creating session...' : 'Proceed \u2192'}
        </button>
        <button onClick={onManual} style={S.configureBtn}>
          Configure manually
        </button>
      </div>
      {error && <div style={S.errorMsg}>{error}</div>}
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────

const S: Record<string, React.CSSProperties> = {
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
    border: '1px solid rgba(26, 26, 26, 0.2)',
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
  main: {
    position: 'relative',
    zIndex: 10,
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: 600,
    width: '100%',
    margin: '0 auto',
    padding: '0 24px 32px',
    gap: 20,
    overflowY: 'auto',
  },
  identity: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
  },
  name: {
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: 22,
    fontWeight: 700,
    color: '#1a1a1a',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  title: {
    fontFamily: "'Inter', sans-serif",
    fontSize: 10,
    fontWeight: 600,
    color: '#4a4a4a',
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
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
    marginTop: 4,
  },
  statusHint: {
    fontFamily: "'Inter', sans-serif",
    fontSize: 12,
    color: '#6b6b67',
    textAlign: 'center',
    minHeight: 18,
    letterSpacing: 0.3,
    transition: 'color 0.2s',
  },
  catherineText: {
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: 20,
    fontWeight: 500,
    fontStyle: 'italic',
    lineHeight: 1.65,
    color: '#1a1a1a',
    textAlign: 'center',
    maxWidth: 520,
    animation: 'partnerTextFadeIn 0.6s ease both',
  },
  userEcho: {
    fontFamily: "'Inter', sans-serif",
    fontSize: 13,
    color: '#1a1a1a',
    textAlign: 'center',
    animation: 'partnerUserFade 4s ease-out forwards',
  },
  textFallback: {
    marginTop: 12,
    display: 'flex',
    justifyContent: 'center',
    opacity: 0.25,
    transition: 'opacity 0.3s',
  },
  textInput: {
    fontFamily: "'Inter', sans-serif",
    fontSize: 12,
    color: colors.text,
    backgroundColor: 'transparent',
    border: 'none',
    borderBottom: '1px solid rgba(26,26,26,0.12)',
    padding: '8px 12px',
    width: 240,
    textAlign: 'center',
    outline: 'none',
    letterSpacing: 0.3,
  },
  recCard: {
    padding: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    backdropFilter: 'blur(12px)',
    borderRadius: 12,
    border: `1px solid rgba(150, 135, 95, 0.2)`,
    animation: 'lobbyFadeUp 0.5s ease both',
    width: '100%',
    maxWidth: 480,
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
  recItem: { padding: '8px 0' },
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
    backgroundColor: '#2a2a2a',
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
  errorMsg: {
    fontFamily: "'Inter', sans-serif",
    fontSize: 12,
    color: '#9a6b00',
    opacity: 0.8,
    marginTop: 8,
    textAlign: 'center',
  },
};
