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
import { usePartnerDemo, type DemoCaseId } from './hooks/usePartnerDemo.js';
import { useVoiceInput } from './hooks/useVoiceInput.js';
import { useVoiceOutput } from './hooks/useVoiceOutput.js';
import { VoiceOrb } from './components/VoiceOrb.js';
import { SparkleEffect } from './components/SparkleEffect.js';
import { DemoNarration } from '../components/DemoNarration.js';
import { TopUpDialog } from '../components/TopUpDialog.js';

interface Props {
  onSessionCreated: (sessionId: string) => void;
  onManualFlow: () => void;
  onBack: () => void;
  isDemo?: boolean;
}

const GOLD = '#B8960B';

// ── Demo case picker data ───────────────────────────────────────────

interface DemoCase {
  id: DemoCaseId;
  title: string;
  subtitle: string;
  description: string;
  team: number;
  cost: string;
  billableHours: number;
  lawFirmCost: string;
}

const DEMO_CASES: DemoCase[] = [
  {
    id: 'heartconnect',
    title: 'Terms of Service',
    subtitle: 'HeartConnect',
    description: 'A dating platform needs consumer-safe terms before scaling to the EU. GDPR consent, age verification, user safety.',
    team: 7,
    cost: '$12',
    billableHours: 12,
    lawFirmCost: '$4,800',
  },
  {
    id: 'healthprivacy',
    title: 'Privacy Policy',
    subtitle: 'MediVault',
    description: 'Health tech company storing patient records needs a HIPAA and GDPR-compliant privacy policy for Series B due diligence.',
    team: 6,
    cost: '$15',
    billableHours: 15,
    lawFirmCost: '$6,000',
  },
  {
    id: 'devcontract',
    title: 'Developer Agreement',
    subtitle: 'CodeCraft',
    description: 'A startup hiring freelance developers needs airtight IP assignment and contractor terms after a prior ownership dispute.',
    team: 6,
    cost: '$10',
    billableHours: 10,
    lawFirmCost: '$4,000',
  },
];

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

export default function PartnerView({ onSessionCreated, onManualFlow, onBack, isDemo = false }: Props) {
  const [selectedCase, setSelectedCase] = useState<DemoCaseId | null>(null);

  // Both hooks called unconditionally (React rules)
  const consult = usePartnerConsult();
  const demo = usePartnerDemo(isDemo && !!selectedCase);

  const voiceInput = useVoiceInput();
  const voiceOutput = useVoiceOutput();

  const [input, setInput] = useState('');
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [showTopUp, setShowTopUp] = useState(false);
  const [lastUserMessage, setLastUserMessage] = useState<string | null>(null);
  const hasStarted = useRef(false);
  const autoSubmitTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const userFadeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastMessageCount = useRef(0);
  const inputFocusedRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Select data source based on mode
  const messages = isDemo ? demo.messages : consult.messages;
  const isStreaming = isDemo ? demo.isStreaming : consult.isStreaming;
  const streamingText = isDemo ? demo.streamingText : consult.streamingText;
  const recommendation = isDemo ? demo.recommendation : consult.recommendation;
  const isFinalizing = isDemo ? demo.isFinalizing : consult.isFinalizing;
  const showSparkle = isDemo ? demo.showSparkle : false;
  const error = isDemo ? null : consult.error;
  const demoLastUserMessage = isDemo ? demo.lastUserMessage : null;

  // Cleanup pending timers on unmount to prevent setState on unmounted component
  useEffect(() => {
    return () => {
      clearTimeout(autoSubmitTimer.current);
      clearTimeout(userFadeTimer.current);
    };
  }, []);

  // Start conversation on mount (real mode only)
  useEffect(() => {
    if (isDemo) return;
    if (!hasStarted.current) {
      hasStarted.current = true;
      consult.startConversation();
    }
  }, [isDemo, consult.startConversation]);

  // Auto-finalize (real mode only)
  useEffect(() => {
    if (isDemo) return;
    if (consult.readyToFinalize && !consult.recommendation && !consult.isFinalizing) {
      const t = setTimeout(() => consult.finalize(), 1500);
      return () => clearTimeout(t);
    }
  }, [isDemo, consult.readyToFinalize, consult.recommendation, consult.isFinalizing, consult.finalize]);

  // Speak new assistant messages (real mode only)
  useEffect(() => {
    if (isDemo) return;
    if (!isStreaming && messages.length > lastMessageCount.current) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg?.role === 'assistant' && voiceOutput.isEnabled) {
        voiceOutput.speak(lastMsg.content);
      }
      lastMessageCount.current = messages.length;
    }
  }, [isDemo, isStreaming, messages, voiceOutput]);

  // Populate input with voice transcript (real mode only)
  useEffect(() => {
    if (isDemo) return;
    if (voiceInput.finalTranscript) {
      setInput(voiceInput.finalTranscript);
    }
  }, [isDemo, voiceInput.finalTranscript]);

  // Auto-submit after voice stops (real mode only)
  useEffect(() => {
    if (isDemo) return;
    if (!voiceInput.isListening && voiceInput.finalTranscript && !isStreaming) {
      autoSubmitTimer.current = setTimeout(() => {
        const text = voiceInput.finalTranscript.trim();
        if (text) {
          setLastUserMessage(text);
          consult.sendMessage(text);
          setInput('');
          voiceInput.clearTranscript();
          clearTimeout(userFadeTimer.current);
          userFadeTimer.current = setTimeout(() => setLastUserMessage(null), 4000);
        }
      }, 1000);
      return () => clearTimeout(autoSubmitTimer.current);
    }
  }, [isDemo, voiceInput.isListening, voiceInput.finalTranscript, isStreaming, consult.sendMessage, voiceInput]);

  // Spacebar: advance demo or push-to-talk (real mode)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return;
      if (inputFocusedRef.current) return;
      e.preventDefault();

      if (isDemo) {
        // In demo, spacebar advances the script
        if (demo.waitingForUser) demo.advance();
        return;
      }

      if (recommendation || isStreaming || isFinalizing) return;
      if (!voiceInput.isSupported) return;
      voiceOutput.stop();
      voiceInput.startListening();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      if (inputFocusedRef.current) return;
      if (isDemo) return;
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
  }, [isDemo, demo.waitingForUser, demo.advance, voiceInput, voiceOutput, recommendation, isStreaming, isFinalizing]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (isDemo) return;
    if (!input.trim() || isStreaming) return;
    clearTimeout(autoSubmitTimer.current);
    setLastUserMessage(input.trim());
    consult.sendMessage(input);
    setInput('');
    voiceInput.clearTranscript();
    clearTimeout(userFadeTimer.current);
    userFadeTimer.current = setTimeout(() => setLastUserMessage(null), 4000);
  }, [isDemo, input, isStreaming, consult.sendMessage, voiceInput]);

  const handleMicPress = useCallback(() => {
    if (isDemo) {
      // Orb tap also advances the demo
      if (demo.waitingForUser) demo.advance();
      return;
    }
    if (!voiceInput.isSupported || isStreaming) return;
    voiceOutput.stop();
    clearTimeout(autoSubmitTimer.current);
    voiceInput.startListening();
  }, [isDemo, demo.waitingForUser, demo.advance, voiceInput, voiceOutput, isStreaming]);

  const handleMicRelease = useCallback(() => {
    if (isDemo) return;
    if (voiceInput.isListening) {
      voiceInput.stopListening();
    }
  }, [isDemo, voiceInput]);

  const handleCaseSelect = useCallback((caseId: DemoCaseId) => {
    sessionStorage.setItem('shem-demo-case', caseId);
    setSelectedCase(caseId);
  }, []);

  const handleProceed = useCallback(async (rec: PartnerRecommendation) => {
    // Demo mode: set demo session ID and navigate to working view
    if (isDemo) {
      const caseId = sessionStorage.getItem('shem-demo-case') || 'heartconnect';
      sessionStorage.setItem('shem-session-id', `demo-session-${caseId}-${Date.now()}`);
      window.location.hash = '#/working';
      return;
    }

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
          setShowTopUp(true);
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
  }, [isDemo, onSessionCreated, voiceOutput]);

  const handleDownloadMemo = useCallback((rec: PartnerRecommendation) => {
    const workflowLabel = WORKFLOW_LABELS[rec.workflowId] ?? rec.workflowId;
    const md = [
      '# Initial Consultation Memo',
      '',
      `**Prepared by:** Catherine M. Blackwell, Managing Partner Agent`,
      '',
      '---',
      '',
      rec.briefingMemo,
      '',
      '---',
      '',
      `**Recommended:** ${workflowLabel} | ${rec.teamRoles.length} specialists | $${rec.budgetUsd}`,
      '',
    ].join('\n');

    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'consultation-memo.md';
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  // Latest assistant message
  const latestAssistant = [...messages].reverse().find(m => m.role === 'assistant');

  // Orb audio/listening: in demo mode, use fake values
  const orbAudioLevel = isDemo ? demo.fakeAudioLevel : voiceInput.audioLevel;
  const orbIsListening = isDemo ? demo.fakeIsListening : voiceInput.isListening;
  const orbIsSpeaking = isDemo ? demo.fakeSpeaking : voiceOutput.isSpeaking;

  // The user message to show (demo has its own)
  const displayedUserMessage = isDemo ? demoLastUserMessage : lastUserMessage;

  // Status hint text
  let statusText = '';
  if (isDemo) {
    if (demo.fakeIsListening) statusText = 'Listening...';
    else if (isStreaming && !streamingText) statusText = 'Catherine is thinking...';
    else if (isFinalizing) statusText = 'Preparing your memo...';
    else if (demo.waitingForUser) statusText = '';
  } else {
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
  }

  // Demo mode: show case picker before conversation starts
  if (isDemo && !selectedCase) {
    return (
      <div style={S.container}>
        <img
          src={`${import.meta.env.BASE_URL}photo-1640280882429-204f63d777e7.avif`}
          alt=""
          style={S.bgImage}
        />
        <div style={S.bgOverlay} />

        <div style={S.header}>
          <button onClick={onBack} style={S.backBtn}>
            {'\u2190'} Back
          </button>
        </div>

        <div style={S.pickerMain}>
          <div style={S.pickerTitle}>Select a Demo Case</div>
          <div style={S.pickerSubtitle}>
            See our agents work. Pick a case, brief your partner, and watch the firm deliver.
          </div>
          <div style={S.pickerGrid}>
            {DEMO_CASES.map((c, i) => (
              <button
                key={c.id}
                onClick={() => handleCaseSelect(c.id)}
                style={{
                  ...S.caseCard,
                  animation: `caseCardEntrance 0.8s cubic-bezier(0.34, 1.4, 0.64, 1) ${0.2 + i * 0.15}s both`,
                }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.transform = 'translateY(-12px) scale(1.035)';
                  el.style.boxShadow = '0 28px 80px rgba(0,0,0,0.16), 0 0 0 1px rgba(150,135,95,0.35), 0 0 60px rgba(150,135,95,0.08)';
                  const accent = el.querySelector('[data-accent]') as HTMLElement;
                  if (accent) accent.style.transform = 'scaleX(1)';
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.transform = 'translateY(0) scale(1)';
                  el.style.boxShadow = '0 8px 40px rgba(0,0,0,0.07), 0 0 0 1px rgba(150,135,95,0.08)';
                  const accent = el.querySelector('[data-accent]') as HTMLElement;
                  if (accent) accent.style.transform = 'scaleX(0.3)';
                }}
              >
                <div data-accent style={S.caseAccent} />
                <div style={S.caseSubtitle}>{c.subtitle}</div>
                <div style={S.caseTitle}>{c.title}</div>
                <div style={S.caseDescription}>{c.description}</div>
                <div style={S.casePricing}>
                  <div style={S.casePricingLawFirm}>
                    <span style={S.casePricingLabel}>~{c.billableHours} billable hours</span>
                    <span style={S.casePricingStrike}>{c.lawFirmCost}</span>
                  </div>
                  <div style={S.casePricingLavern}>
                    <span style={S.casePricingWsLabel}>{c.team} specialist agents</span>
                    <span style={S.casePricingValue}>{c.cost}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={S.container}>
      <img
        src={`${import.meta.env.BASE_URL}photo-1640280882429-204f63d777e7.avif`}
        alt=""
        style={S.bgImage}
      />
      <div style={S.bgOverlay} />

      {/* Demo narration banner */}
      {isDemo && <DemoNarration step={1} />}

      {/* Header */}
      <div style={S.header}>
        <button onClick={onBack} style={S.backBtn}>
          {'\u2190'} Back
        </button>
        {!isDemo && (
          <button onClick={onManualFlow} style={S.manualBtn}>
            Configure manually
          </button>
        )}
      </div>

      {/* Main content */}
      <div style={S.main}>
        {/* Catherine's identity */}
        <div style={S.identity}>
          <div style={S.name}>Catherine M. Blackwell</div>
          <div style={S.title}>Managing Partner Agent</div>
          {!isDemo && (
            <button
              onClick={() => voiceOutput.setEnabled(!voiceOutput.isEnabled)}
              style={{ ...S.voiceToggle, opacity: voiceOutput.isEnabled ? 0.7 : 0.25 }}
              title={voiceOutput.isEnabled ? 'Voice on' : 'Voice off'}
              aria-label={voiceOutput.isEnabled ? 'Disable voice output' : 'Enable voice output'}
            >
              <SpeakerIcon muted={!voiceOutput.isEnabled} />
            </button>
          )}
        </div>

        {/* The Orb */}
        <VoiceOrb
          audioLevel={orbAudioLevel}
          isListening={orbIsListening}
          isSpeaking={orbIsSpeaking}
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
          ...(orbIsListening ? { fontStyle: 'italic', color: GOLD } : {}),
        }}>
          {statusText}
        </div>

        {/* Press to Speak button (demo mode) */}
        {isDemo && demo.waitingForUser && !recommendation && (
          <button
            onClick={demo.advance}
            style={S.speakBtn}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(150, 135, 95, 0.15)';
              (e.currentTarget as HTMLElement).style.borderColor = GOLD;
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(150, 135, 95, 0.06)';
              (e.currentTarget as HTMLElement).style.borderColor = 'rgba(150, 135, 95, 0.3)';
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
            <span>Press to Speak</span>
          </button>
        )}

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
        {displayedUserMessage && (
          <div style={S.userEcho} key={`user-${displayedUserMessage.slice(0, 20)}`}>
            {displayedUserMessage}
          </div>
        )}

        {/* Memo Card */}
        {recommendation && (
          <div style={{ position: 'relative', width: '100%', maxWidth: 480 }}>
            <SparkleEffect active={showSparkle} />
            <MemoCard
              rec={recommendation}
              onProceed={() => handleProceed(recommendation)}
              onDownload={() => handleDownloadMemo(recommendation)}
              onManual={isDemo ? undefined : onManualFlow}
              isCreating={isCreatingSession}
              error={sessionError}
              isDemo={isDemo}
            />
          </div>
        )}

        {/* Errors */}
        {error && !isFinalizing && <div style={S.errorMsg}>{error}</div>}
        {!isDemo && voiceInput.error && <div style={S.errorMsg}>{voiceInput.error}</div>}

        {/* Text fallback (hidden in demo mode) */}
        {!recommendation && !isDemo && (
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

      {showTopUp && <TopUpDialog onDismiss={() => setShowTopUp(false)} />}
    </div>
  );
}

// ── Memo Card ─────────────────────────────────────────────────────────────

function MemoCard({
  rec,
  onProceed,
  onDownload,
  onManual,
  isCreating,
  error,
  isDemo,
}: {
  rec: PartnerRecommendation;
  onProceed: () => void;
  onDownload: () => void;
  onManual?: () => void;
  isCreating: boolean;
  error: string | null;
  isDemo: boolean;
}) {
  const workflowLabel = WORKFLOW_LABELS[rec.workflowId] ?? rec.workflowId;
  const paragraphs = rec.briefingMemo.split('\n\n').filter(Boolean);

  return (
    <div style={S.memoCard}>
      {/* Header */}
      <div style={S.memoTitle}>Initial Consultation Memo</div>
      <div style={S.memoPrepared}>Prepared by Catherine M. Blackwell</div>

      {/* Gold divider */}
      <div style={S.memoDivider} />

      {/* Briefing paragraphs */}
      <div style={S.memoBody}>
        {paragraphs.map((p, i) => (
          <p key={i} style={S.memoParagraph}>{p}</p>
        ))}
      </div>

      {/* Summary line */}
      <div style={S.memoSummary}>
        Recommended: {workflowLabel} | {rec.teamRoles.length} specialists | ${rec.budgetUsd}
      </div>

      {/* Actions */}
      <div style={S.memoActions}>
        <button
          onClick={onProceed}
          disabled={isCreating}
          style={{ ...S.proceedBtn, opacity: isCreating ? 0.6 : 1 }}
        >
          {isCreating ? 'Creating session...' : isDemo ? 'Watch the Team Work \u2192' : 'Proceed to Engagement \u2192'}
        </button>
        <button onClick={onDownload} style={S.downloadBtn}>
          Download Memo
        </button>
        {onManual && (
          <button onClick={onManual} style={S.configureBtn}>
            Configure Manually
          </button>
        )}
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
  speakBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: '14px 36px',
    borderRadius: 40,
    border: '2px solid rgba(150, 135, 95, 0.3)',
    backgroundColor: 'rgba(150, 135, 95, 0.06)',
    color: '#1a1a1a',
    fontFamily: "'Inter', sans-serif",
    fontSize: 14,
    fontWeight: 600,
    letterSpacing: 1,
    cursor: 'pointer',
    transition: 'all 0.25s ease',
    animation: 'partnerTextFadeIn 0.6s ease both, partnerSpeakPulse 2.5s ease-in-out 1s infinite',
    marginTop: 8,
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
  // ── Memo Card styles ─────────────────────────────────────────────────
  memoCard: {
    padding: '32px 28px',
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
    backdropFilter: 'blur(12px)',
    borderRadius: 12,
    border: `1px solid rgba(150, 135, 95, 0.2)`,
    animation: 'lobbyFadeUp 0.5s ease both',
    width: '100%',
  },
  memoTitle: {
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: 24,
    fontWeight: 600,
    color: '#1a1a1a',
    textAlign: 'center',
    letterSpacing: 0.3,
    marginBottom: 6,
  },
  memoPrepared: {
    fontFamily: "'Inter', sans-serif",
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
    color: '#4a4a4a',
    opacity: 0.5,
    textAlign: 'center',
    marginBottom: 20,
  },
  memoDivider: {
    width: 60,
    height: 1,
    margin: '0 auto 24px',
    background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)`,
  },
  memoBody: {
    marginBottom: 20,
  },
  memoParagraph: {
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: 16,
    fontWeight: 400,
    lineHeight: 1.75,
    color: '#1a1a1a',
    margin: '0 0 14px',
  },
  memoSummary: {
    fontFamily: "'Inter', sans-serif",
    fontSize: 11,
    fontWeight: 500,
    letterSpacing: 0.5,
    color: '#4a4a4a',
    opacity: 0.5,
    textAlign: 'center',
    paddingTop: 16,
    borderTop: '1px solid rgba(26, 26, 26, 0.06)',
    marginBottom: 20,
  },
  memoActions: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    flexWrap: 'wrap',
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
  downloadBtn: {
    fontFamily: "'Inter', sans-serif",
    fontSize: 11,
    fontWeight: 500,
    letterSpacing: 1,
    color: '#4a4a4a',
    opacity: 0.55,
    background: 'none',
    border: '1px solid rgba(26, 26, 26, 0.15)',
    borderRadius: 4,
    cursor: 'pointer',
    padding: '8px 16px',
    transition: 'opacity 0.2s',
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
  // ── Case picker styles ────────────────────────────────────────────
  pickerMain: {
    position: 'relative',
    zIndex: 10,
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'safe center',
    maxWidth: 1000,
    width: '100%',
    margin: '0 auto',
    padding: '16px 32px 32px',
    gap: 12,
    overflowY: 'auto',
  },
  pickerTitle: {
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: 48,
    fontWeight: 600,
    color: '#1a1a1a',
    letterSpacing: 0.5,
    textAlign: 'center',
    animation: 'casePickerTitle 0.8s cubic-bezier(0.4, 0, 0.2, 1) both',
  },
  pickerSubtitle: {
    fontFamily: "'Inter', sans-serif",
    fontSize: 14,
    fontWeight: 400,
    color: '#4a4a4a',
    opacity: 0.6,
    textAlign: 'center',
    maxWidth: 500,
    lineHeight: 1.7,
    fontStyle: 'italic',
    marginBottom: 8,
    animation: 'partnerTextFadeIn 1s ease 0.3s both',
  },
  pickerGrid: {
    display: 'flex',
    gap: 24,
    flexWrap: 'wrap',
    justifyContent: 'center',
    width: '100%',
  },
  caseCard: {
    width: 280,
    minWidth: 260,
    padding: '0 0 24px',
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    backdropFilter: 'blur(24px)',
    borderRadius: 20,
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'all 0.45s cubic-bezier(0.34, 1.4, 0.64, 1)',
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
    boxShadow: '0 8px 40px rgba(0,0,0,0.07), 0 0 0 1px rgba(150,135,95,0.08)',
    overflow: 'hidden',
  },
  caseAccent: {
    height: 3,
    background: `linear-gradient(90deg, ${GOLD}, rgba(184,155,80,0.6), transparent)`,
    marginBottom: 28,
    transformOrigin: 'left',
    transform: 'scaleX(0.3)',
    transition: 'transform 0.5s cubic-bezier(0.34, 1.4, 0.64, 1)',
  } as React.CSSProperties,
  caseSubtitle: {
    fontFamily: "'Inter', sans-serif",
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: 3,
    textTransform: 'uppercase' as const,
    color: GOLD,
    marginBottom: 8,
    padding: '0 26px',
  },
  caseTitle: {
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: 28,
    fontWeight: 700,
    color: '#1a1a1a',
    marginBottom: 14,
    lineHeight: 1.1,
    padding: '0 26px',
  },
  caseDescription: {
    fontFamily: "'Inter', sans-serif",
    fontSize: 12,
    fontWeight: 400,
    color: '#555',
    lineHeight: 1.7,
    marginBottom: 20,
    flex: 1,
    padding: '0 26px',
  },
  casePricing: {
    margin: '0 16px',
    padding: '14px 12px',
    background: 'linear-gradient(135deg, rgba(150,135,95,0.06), rgba(150,135,95,0.02))',
    borderRadius: 12,
    border: '1px solid rgba(150,135,95,0.08)',
  } as React.CSSProperties,
  casePricingLawFirm: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  } as React.CSSProperties,
  casePricingLabel: {
    fontFamily: "'Inter', sans-serif",
    fontSize: 10,
    fontWeight: 500,
    color: '#aaa',
    letterSpacing: 0.3,
  } as React.CSSProperties,
  casePricingStrike: {
    fontFamily: "'Inter', sans-serif",
    fontSize: 14,
    fontWeight: 500,
    color: '#bbb',
    textDecoration: 'line-through',
  } as React.CSSProperties,
  casePricingLavern: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  } as React.CSSProperties,
  casePricingWsLabel: {
    fontFamily: "'Inter', sans-serif",
    fontSize: 10,
    fontWeight: 600,
    color: GOLD,
    letterSpacing: 0.3,
  } as React.CSSProperties,
  casePricingValue: {
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: 32,
    fontWeight: 700,
    color: '#1a1a1a',
    letterSpacing: -0.5,
  } as React.CSSProperties,
};
