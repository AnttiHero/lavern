/**
 * WorkingView — The Team Chat Room.
 *
 * v18: Redesigned for engagement — all agent activity now visible in the
 *      conversation feed (tool_used, agent_start, agent_stop shown as
 *      speech bubble ActivityCards). Reassurance messages injected during
 *      silent periods. Sidebar upgraded to Claude Code-style checklist.
 *
 * Layout: WorkingHeader → SlimHeartbeatBand → (ChecklistSidebar | ConversationFeed)
 */

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWorkingState } from './hooks/useWorkingState.js';
import { useTeamRoster } from './hooks/useTeamRoster.js';
import { useReassuranceInjector } from './hooks/useReassuranceInjector.js';
import { useDebateThreads } from './hooks/useDebateThreads.js';
import { useResponsive } from '../hooks/useMediaQuery.js';
import { useTabLock } from '../hooks/useTabLock.js';
import { WorkingHeader } from './components/WorkingHeader.js';
import { HeartbeatBand } from './components/HeartbeatBand.js';
import { ProgressSidebar } from './components/ProgressSidebar.js';
import { InsightFeed } from './components/InsightFeed.js';
import { SessionOverlay } from './components/SessionOverlay.js';
import { StuckStateRescue } from './components/StuckStateRescue.js';
import { GateDialog } from '../components/GateDialog.js';
import { VerificationFeed } from '../verification/VerificationFeed.js';
import { colors, fonts, radii, spacing } from '../staffing/styles/tokens.js';
import { injectWorkingKeyframes } from './styles/animations.js';
import { DemoNarration } from '../components/DemoNarration.js';
import { useBillingStatus } from '../my-page/hooks/useBillingStatus.js';
import { useVoiceInput } from '../partner/hooks/useVoiceInput.js';

const PacManGame = lazy(() => import('./components/PacManGame.js').then(m => ({ default: m.PacManGame })));
const SketchPad = lazy(() => import('./components/SketchPad.js').then(m => ({ default: m.SketchPad })));
type SketchStroke = import('./components/SketchPad.js').Stroke;

interface WorkingViewProps {
  onComplete: () => void;
  onBack: () => void;
  onSkip: () => void;
}

export default function WorkingView({ onComplete, onBack, onSkip }: WorkingViewProps) {
  // Inject CSS keyframes for animations
  useEffect(() => { injectWorkingKeyframes(); }, []);

  // v18: Read provider from engagement config (persisted to sessionStorage by StrategyView)
  const sessionProvider = useMemo<'anthropic' | 'mistral' | undefined>(() => {
    try {
      const raw = sessionStorage.getItem('shem-briefing-config');
      if (raw) {
        const cfg = JSON.parse(raw);
        if (cfg.provider === 'mistral') return 'mistral';
      }
    } catch { /* ignore */ }
    return undefined;
  }, []);

  // First render: load team from sessionStorage with no event roles
  const { team: initialTeam } = useTeamRoster();
  const initialRoles = useMemo(() => initialTeam.map(t => t.role), [initialTeam]);

  const {
    state,
    connectToSession,
    connectToReplay,
    disconnect,
    dismissGate,
    pause,
    resume,
    setSpeed,
  } = useWorkingState(onComplete, initialRoles);

  const { isLocked } = useTabLock(state.sessionId);

  // Extract all roles from SSE events to dynamically expand the team
  const eventRoles = useMemo(() => {
    const roles: string[] = [];
    for (const role of state.agentStatuses.keys()) {
      if (role) roles.push(role);
    }
    return roles;
  }, [state.agentStatuses]);

  // Team with dynamic expansion from event roles
  const { team } = useTeamRoster(eventRoles);

  // Thread debates from flat stream
  const { debateThreads, threadedStream } = useDebateThreads(state.streamCards);

  // Inject reassurance messages during silent periods
  const feedItems = useReassuranceInjector(threadedStream, state.currentStep);

  const handleGateDecision = useCallback(
    (_decision: 'approve' | 'reject' | 'modify', _notes?: string) => {
      dismissGate();
    },
    [dismissGate]
  );

  const [halting, setHalting] = useState(false);
  const [haltError, setHaltError] = useState<string | null>(null);
  const handleHalt = useCallback(async () => {
    if (!state.sessionId || halting) return;
    setHalting(true);
    setHaltError(null);
    try {
      const res = await fetch(`/api/sessions/${state.sessionId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reason: 'Emergency stop by user' }),
      });
      if (!res.ok) {
        setHaltError(`Stop failed (${res.status}). Try refreshing the page.`);
      }
    } catch (e) {
      console.error('[HALT] Failed to halt session:', e);
      setHaltError('Could not reach server. Check your connection.');
    } finally {
      setHalting(false);
    }
  }, [state.sessionId, halting]);

  // Compute running certainty from verification stream cards
  const runningCertainty = useMemo(() => {
    const verifications = state.streamCards.filter(
      (c): c is Extract<typeof c, { kind: 'verification' }> => c.kind === 'verification',
    );
    if (verifications.length === 0) return undefined;
    const avg = verifications.reduce((sum, v) => sum + v.confidence, 0) / verifications.length;
    return Math.round(avg * 100);
  }, [state.streamCards]);

  // Total finding count for HeartbeatBand
  const totalFindings = useMemo(() => {
    let count = 0;
    for (const c of state.findingCounts.values()) count += c;
    return count;
  }, [state.findingCounts]);

  const showSessionOverlay =
    !state.sessionId && state.connectionStatus === 'disconnected';

  // ── Stuck-state rescue ────────────────────────────────────────────────
  //
  // If no new events have arrived in IDLE_THRESHOLD_MS AND the session is
  // not already delivered / gated / expired, surface a rescue card with
  // explicit "keep waiting" / "stop and try again" actions.
  //
  // This covers the three real stall modes we see in the wild:
  //   1. Document assembly stalls (long single LLM call, no intermediate events)
  //   2. Individual agent hangs (a tool call never returns)
  //   3. Upstream Claude API slowdowns
  const IDLE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
  const [stuckDismissedAt, setStuckDismissedAt] = useState<string | null>(null);
  const [stuckTick, setStuckTick] = useState(0);
  // Re-evaluate staleness once per minute so the card surfaces even when no
  // events arrive (the only event that would otherwise trigger re-render).
  useEffect(() => {
    const t = setInterval(() => setStuckTick(v => v + 1), 60_000);
    return () => clearInterval(t);
  }, []);
  const idleMinutes = useMemo(() => {
    // Suppress until we have a live session
    if (!state.sessionId) return 0;
    // No rescue during gates (the user IS the blocker) or terminal states
    if (state.pendingGate) return 0;
    if (state.currentStep === 'delivered' || state.currentStep === 'complete') return 0;
    if (state.sessionExpired || state.sessionFailed) return 0;
    // No events yet — use session open time from the first connection signal.
    // lastEventTimestamp is null until first event; treat as "not stuck yet".
    if (!state.lastEventTimestamp) return 0;
    const last = new Date(state.lastEventTimestamp).getTime();
    if (!Number.isFinite(last)) return 0;
    const idleMs = Date.now() - last;
    if (idleMs < IDLE_THRESHOLD_MS) return 0;
    // Respect user dismissal — don't re-surface until a NEW event arrives
    // (which changes lastEventTimestamp past the dismissal timestamp).
    if (stuckDismissedAt && state.lastEventTimestamp <= stuckDismissedAt) return 0;
    return Math.floor(idleMs / 60_000);
    // stuckTick forces re-evaluation on the interval above
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.sessionId, state.pendingGate, state.currentStep, state.sessionExpired,
      state.sessionFailed, state.lastEventTimestamp, stuckDismissedAt, stuckTick]);
  const showStuckRescue = idleMinutes > 0;
  const handleStuckDismiss = useCallback(() => {
    setStuckDismissedAt(state.lastEventTimestamp);
  }, [state.lastEventTimestamp]);

  const [showPacMan, setShowPacMan] = useState(false);
  // Sketchpad easter-egg state. Strokes are preserved across tuck-aways
  // (kept here in the parent so the canvas survives close → reopen).
  const [showSketch, setShowSketch] = useState(false);
  const sketchStrokesRef = useRef<SketchStroke[]>([]);
  const { isMobile, isTablet } = useResponsive();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // ── Voice inject ──────────────────────────────────────────────────────
  const [micOpen, setMicOpen] = useState(false);
  const [injectStatus, setInjectStatus] = useState<'idle' | 'injecting' | 'done'>('idle');
  const {
    isSupported: voiceSupported,
    isListening: voiceListening,
    finalTranscript: voiceFinalTranscript,
    startListening: voiceStart,
    stopListening: voiceStop,
    clearTranscript: voiceClear,
  } = useVoiceInput();
  const injectDoneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMicToggle = useCallback(() => {
    if (micOpen) {
      setMicOpen(false);
      voiceStop();
      voiceClear();
      setInjectStatus('idle');
    } else {
      setMicOpen(true);
      setInjectStatus('idle');
      voiceClear();
      voiceStart();
    }
  }, [micOpen, voiceStart, voiceStop, voiceClear]);

  // When voice captures a transcript, inject it into the session
  useEffect(() => {
    if (!voiceFinalTranscript || !micOpen || injectStatus !== 'idle') return;
    const message = voiceFinalTranscript.trim();
    if (!message || !state.sessionId) return;

    setInjectStatus('injecting');
    voiceStop();

    fetch(`/api/sessions/${state.sessionId}/inject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ message }),
    }).then(() => {
      setInjectStatus('done');
      voiceClear();
      injectDoneTimerRef.current = setTimeout(() => {
        setMicOpen(false);
        setInjectStatus('idle');
      }, 1800);
    }).catch(() => {
      setInjectStatus('idle');
      voiceClear();
    });
  }, [voiceFinalTranscript, micOpen, injectStatus, state.sessionId, voiceStop, voiceClear]);

  useEffect(() => {
    return () => {
      if (injectDoneTimerRef.current) clearTimeout(injectDoneTimerRef.current);
    };
  }, []);

  // Check if verification pipeline events are present
  const hasVerificationEvents = useMemo(() =>
    state.streamCards.some(c =>
      c.kind === 'verification_pass_started' ||
      c.kind === 'verification_pass_completed' ||
      c.kind === 'verification_finding' ||
      c.kind === 'verification_report'
    ),
    [state.streamCards]
  );

  const isDemo = state.sessionId?.startsWith('demo-session-') ?? false;
  const { status: billing } = useBillingStatus(!isDemo);

  // Auto-approve human gates in demo mode (3s pause so viewer sees the gate)
  useEffect(() => {
    if (!isDemo || !state.pendingGate) return;
    const t = setTimeout(() => handleGateDecision('approve'), 3000);
    return () => clearTimeout(t);
  }, [isDemo, state.pendingGate, handleGateDecision]);

  return (
    <div style={styles.root}>
      {isDemo && <DemoNarration step={2} />}
      {isLocked && (
        <div style={styles.tabLockedOverlay}>
          <div style={styles.tabLockedCard}>
            <span style={{ fontFamily: fonts.serif, fontSize: 28, fontWeight: 300 }}>M</span>
            <p style={{ fontFamily: fonts.sans, fontSize: 13, color: colors.textSecondary, marginTop: 12 }}>
              This session is open in another tab.
            </p>
            <p style={{ fontFamily: fonts.sans, fontSize: 11, color: colors.textDim, marginTop: 4 }}>
              Close the other tab to continue here.
            </p>
          </div>
        </div>
      )}

      <WorkingHeader
        connectionStatus={state.connectionStatus}
        sessionId={state.sessionId}
        cost={state.cost}
        isReplay={state.isReplay}
        replayPaused={state.replayPaused}
        replaySpeed={state.replaySpeed}
        onPause={pause}
        onResume={resume}
        onSetSpeed={setSpeed}
        onDisconnect={disconnect}
        onHalt={handleHalt}
        onConnectSession={connectToSession}
        onBack={onBack}
        onSkip={onSkip}
        certaintyPct={runningCertainty}
        provider={sessionProvider}
      />

      <HeartbeatBand
        currentStep={state.currentStep}
        completedSteps={state.completedSteps}
        cost={state.cost}
        certaintyPct={runningCertainty}
        findingCount={totalFindings}
        sessionStartTime={state.events[0]?.timestamp ?? null}
        lastEventTimestamp={state.lastEventTimestamp}
        billableHours={billing?.billableHours.balance}
      />

      {/* Connection Lost banner — visible when WS drops during an active session */}
      {state.connectionStatus === 'disconnected' && state.sessionId && (
        <div style={styles.connectionLost} role="alert">
          <span style={styles.connectionLostDot} />
          Connection lost {'\u2014'} attempting to reconnect{'\u2026'}
        </div>
      )}

      {/* Halt error banner */}
      {haltError && (
        <div style={{ ...styles.connectionLost, backgroundColor: 'rgba(180, 60, 40, 0.12)', borderColor: 'rgba(180, 60, 40, 0.3)' }} role="alert">
          {haltError}
        </div>
      )}

      {/* Session expired overlay */}
      {state.sessionExpired && (
        <div style={styles.expiredOverlay}>
          <div style={styles.expiredCard}>
            <span style={{ fontFamily: fonts.serif, fontSize: 36, fontWeight: 300, color: colors.text, opacity: 0.5 }}>M</span>
            <h2 style={{ fontFamily: fonts.serif, fontSize: 20, fontWeight: 300, color: colors.text, marginTop: 16 }}>
              Session Expired
            </h2>
            <p style={{ fontFamily: fonts.sans, fontSize: 13, color: colors.textSecondary, marginTop: 8, lineHeight: 1.5 }}>
              This session is no longer available on the server.
              Sessions are kept for 4 hours after creation.
            </p>
            <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
              <button
                onClick={onBack}
                style={{
                  padding: '10px 28px',
                  borderRadius: radii.sm,
                  border: `2px solid ${colors.text}`,
                  backgroundColor: colors.text,
                  color: '#fff',
                  fontFamily: fonts.sans,
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: 1.2,
                  textTransform: 'uppercase' as const,
                  cursor: 'pointer',
                  transition: 'background-color 0.25s ease, color 0.25s ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = colors.text; }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = colors.text; e.currentTarget.style.color = '#fff'; }}
              >
                Start New Session
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Session error recovery overlay — shown when session fails mid-work */}
      {state.sessionFailed && state.currentStep === 'delivered' && !state.sessionExpired && (
        <div style={styles.expiredOverlay}>
          <div style={styles.expiredCard}>
            <span style={{ fontFamily: fonts.serif, fontSize: 36, fontWeight: 300, color: colors.danger, opacity: 0.7 }}>!</span>
            <h2 style={{ fontFamily: fonts.serif, fontSize: 20, fontWeight: 300, color: colors.text, marginTop: 16 }}>
              Session Interrupted
            </h2>
            <p style={{ fontFamily: fonts.sans, fontSize: 13, color: colors.textSecondary, marginTop: 8, lineHeight: 1.5 }}>
              The engagement encountered an error and could not complete.
              {state.cost ? ` Approximately $${state.cost.accumulated.toFixed(2)} was consumed.` : ''}
            </p>
            <p style={{ fontFamily: fonts.sans, fontSize: 12, color: colors.textDim, marginTop: 8, lineHeight: 1.5 }}>
              Any partial analysis may still be available.
            </p>
            <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
              <button
                onClick={onBack}
                style={{
                  padding: '10px 28px',
                  borderRadius: radii.sm,
                  border: `2px solid ${colors.text}`,
                  backgroundColor: 'transparent',
                  color: colors.text,
                  fontFamily: fonts.sans,
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: 1.2,
                  textTransform: 'uppercase' as const,
                  cursor: 'pointer',
                  transition: 'background-color 0.25s ease, color 0.25s ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = colors.text; e.currentTarget.style.color = '#fff'; }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = colors.text; }}
              >
                Start New Session
              </button>
              <button
                onClick={onComplete}
                style={{
                  padding: '10px 28px',
                  borderRadius: radii.sm,
                  border: `2px solid ${colors.text}`,
                  backgroundColor: colors.text,
                  color: '#fff',
                  fontFamily: fonts.sans,
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: 1.2,
                  textTransform: 'uppercase' as const,
                  cursor: 'pointer',
                  transition: 'background-color 0.25s ease, color 0.25s ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = colors.text; }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = colors.text; e.currentTarget.style.color = '#fff'; }}
              >
                View Partial Results {'\u2192'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile sidebar toggle */}
      {isMobile && (
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          style={styles.sidebarToggle}
          aria-expanded={sidebarOpen}
          aria-controls="progress-sidebar"
        >
          {sidebarOpen ? '\u25B2 Hide checklist' : '\u25BC Show checklist'}
        </button>
      )}

      {/* Main content: sidebar + feed */}
      <div style={{
        ...styles.mainContent,
        ...(isMobile ? { flexDirection: 'column' as const } : {}),
      }} id="main-content">
        {(!isMobile || sidebarOpen) && (
          <ProgressSidebar
            currentStep={state.currentStep}
            completedSteps={state.completedSteps}
            streamCards={state.streamCards}
            activeThinkingAgents={state.activeThinkingAgents}
            team={team}
            isMobile={isMobile}
            isTablet={isTablet}
          />
        )}

        <div style={styles.feedColumn}>
          {/* Verification pipeline display — shown when verification events are streaming */}
          {hasVerificationEvents && (
            <div style={{ overflow: 'auto', flex: '0 0 auto', maxHeight: '50vh' }}>
              <VerificationFeed streamCards={state.streamCards} />
            </div>
          )}

          {showStuckRescue && (
            <StuckStateRescue
              idleMinutes={idleMinutes}
              onDismiss={handleStuckDismiss}
              onHalt={handleHalt}
              halting={halting}
            />
          )}

          <InsightFeed
            cards={feedItems}
            team={team}
            onGateClick={() => { /* gate dialog is shown via state.pendingGate */ }}
            isConnected={state.connectionStatus === 'connected'}
            debateThreads={debateThreads}
            activeThinkingAgents={state.activeThinkingAgents}
          />
        </div>
      </div>

      {/* "View Results" button — shown when session reaches delivered state
          as a failsafe in case auto-navigation doesn't fire */}
      {state.currentStep === 'delivered' && (
        <div style={styles.deliveredBanner}>
          <span style={styles.deliveredText}>Your results are ready</span>
          <button
            onClick={onComplete}
            style={styles.deliveredBtn}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = colors.text; }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = colors.text; e.currentTarget.style.color = '#fff'; }}
          >
            View Results {'\u2192'}
          </button>
        </div>
      )}

      {/* Session list overlay when disconnected */}
      {showSessionOverlay && (
        <SessionOverlay
          onConnectSession={(id) => {
            connectToSession(id);
          }}
          onConnectReplay={(id) => {
            connectToReplay(id);
          }}
          onBeginEngagement={onBack}
        />
      )}

      {/* Gate dialog modal */}
      {state.pendingGate && state.sessionId && (
        <GateDialog
          gateType={state.pendingGate.gateType}
          summary={state.pendingGate.summary}
          details={state.pendingGate.details}
          sessionId={state.sessionId}
          isDemo={isDemo}
          onDecision={handleGateDecision}
          onDismiss={dismissGate}
        />
      )}

      {/* Voice inject FAB — only shown during an active session */}
      {state.sessionId && voiceSupported && (
        <>
          {micOpen && (
            <div style={styles.voiceOverlay}>
              {injectStatus === 'idle' && voiceListening && (
                <>
                  <div style={styles.voiceListeningDot} />
                  <span style={styles.voiceLabel}>Listening…</span>
                </>
              )}
              {injectStatus === 'idle' && !voiceListening && (
                <span style={styles.voiceLabel}>Tap mic to listen</span>
              )}
              {injectStatus === 'injecting' && (
                <span style={styles.voiceLabel}>Sending…</span>
              )}
              {injectStatus === 'done' && (
                <span style={{ ...styles.voiceLabel, color: colors.accent }}>Sent ✓</span>
              )}
            </div>
          )}
          <button
            onClick={handleMicToggle}
            style={{
              ...styles.micFab,
              bottom: spacing.md + 44,
              backgroundColor: micOpen ? 'rgba(180,60,40,0.1)' : 'transparent',
              borderColor: micOpen ? 'rgba(180,60,40,0.35)' : 'transparent',
            }}
            title={micOpen ? 'Stop voice input' : 'Speak to the agents'}
            aria-label={micOpen ? 'Stop voice input' : 'Speak to the agents'}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={micOpen ? '#b43c28' : colors.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="2" width="6" height="12" rx="3"/>
              <path d="M19 10a7 7 0 0 1-14 0"/>
              <line x1="12" y1="19" x2="12" y2="22"/>
              <line x1="8" y1="22" x2="16" y2="22"/>
            </svg>
          </button>
        </>
      )}

      {/* Pac-Man trigger */}
      <button
        onClick={() => setShowPacMan(true)}
        style={styles.ghostBtn}
        title="Play Pac-Man while you wait"
        aria-label="Play Pac-Man while you wait"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M10 2C6 2 3 5 3 9v7c0 0 1.5-2 2.5-2s1.5 2 2.5 2 1.5-2 2.5-2 1.5 2 2.5 2 1.5-2 2.5-2V9c0-4-3-7-7-7z" fill={colors.textMuted} opacity={0.5}/>
          <circle cx="7.5" cy="8" r="2" fill="#fff"/>
          <circle cx="12.5" cy="8" r="2" fill="#fff"/>
          <circle cx="8" cy="8" r="1" fill="#222"/>
          <circle cx="13" cy="8" r="1" fill="#222"/>
        </svg>
      </button>

      {/* Sketchpad trigger — sits above Pac-Man (and above the mic FAB
          when voice is supported, so it doesn't collide with it). */}
      <button
        onClick={() => setShowSketch(true)}
        style={{ ...styles.ghostBtn, bottom: spacing.md + 88 }}
        title="Open the sketchpad"
        aria-label="Open the sketchpad"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity={0.6}>
          <path d="M12 19l7-7 3 3-7 7-3-3z"/>
          <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>
          <path d="M2 2l7.586 7.586"/>
          <circle cx="11" cy="11" r="2"/>
        </svg>
      </button>

      {/* Pac-Man game overlay */}
      {showPacMan && (
        <Suspense fallback={null}>
          <PacManGame onClose={() => setShowPacMan(false)} />
        </Suspense>
      )}

      {/* Sketchpad overlay — strokes are preserved across tuck-aways
          via sketchStrokesRef in the parent. Closing just hides; the
          canvas re-opens with the same strokes. */}
      {showSketch && (
        <Suspense fallback={null}>
          <SketchPad
            initialStrokes={sketchStrokesRef.current}
            onStrokesChange={(s) => { sketchStrokesRef.current = s; }}
            onClose={() => setShowSketch(false)}
          />
        </Suspense>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    width: '100%',
    height: '100vh',
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
    backgroundColor: colors.bg,
    position: 'relative' as const,
  },
  mainContent: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
    minHeight: 0,
  },
  feedColumn: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
    minWidth: 0,
  },
  sidebarToggle: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '6px 12px',
    borderTop: 'none',
    borderLeft: 'none',
    borderRight: 'none',
    borderBottom: `1px solid ${colors.border}`,
    backgroundColor: colors.bgPanel,
    fontSize: 10,
    fontFamily: fonts.sans,
    fontWeight: 600,
    color: colors.textMuted,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
    cursor: 'pointer',
    width: '100%',
    flexShrink: 0,
  },
  connectionLost: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 20px',
    backgroundColor: 'rgba(184, 134, 11, 0.08)',
    borderBottom: `1px solid rgba(184, 134, 11, 0.2)`,
    fontSize: 11,
    fontFamily: fonts.sans,
    fontWeight: 500,
    color: '#B8860B',
    letterSpacing: 0.3,
  },
  connectionLostDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    backgroundColor: '#B8860B',
    animation: 'activeThinkingPulse 2s ease-in-out infinite',
    flexShrink: 0,
  },
  deliveredBanner: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: '12px 24px',
    backgroundColor: colors.bgCard,
    borderBottom: `1.5px solid ${colors.accent}`,
  },
  deliveredText: {
    fontSize: 13,
    fontFamily: fonts.serif,
    fontWeight: 400,
    color: colors.text,
    letterSpacing: 0.2,
  },
  deliveredBtn: {
    padding: '14px 44px',
    borderRadius: 100,
    border: `2px solid ${colors.text}`,
    backgroundColor: colors.text,
    color: '#fff',
    fontFamily: fonts.sans,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 3,
    textTransform: 'uppercase' as const,
    cursor: 'pointer',
    transition: 'background-color 0.25s ease, color 0.25s ease',
  },
  ghostBtn: {
    position: 'absolute' as const,
    bottom: spacing.md,
    right: spacing.md,
    width: 36,
    height: 36,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'none',
    border: `1px solid transparent`,
    borderRadius: radii.sm,
    cursor: 'pointer',
    opacity: 0.35,
    transition: 'opacity 0.3s ease, border-color 0.3s ease',
    zIndex: 100,
  },
  micFab: {
    position: 'absolute' as const,
    right: spacing.md,
    width: 36,
    height: 36,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: `1px solid transparent`,
    borderRadius: '50%',
    cursor: 'pointer',
    opacity: 0.7,
    transition: 'background-color 0.2s ease, border-color 0.2s ease, opacity 0.2s ease',
    zIndex: 100,
  },
  voiceOverlay: {
    position: 'absolute' as const,
    bottom: spacing.md + 88,
    right: spacing.md,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.sm,
    padding: '6px 12px',
    zIndex: 100,
    pointerEvents: 'none' as const,
  },
  voiceListeningDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    backgroundColor: '#b43c28',
    animation: 'activeThinkingPulse 1.2s ease-in-out infinite',
    flexShrink: 0,
  },
  voiceLabel: {
    fontFamily: fonts.sans,
    fontSize: 11,
    fontWeight: 500,
    color: colors.textSecondary,
    letterSpacing: 0.2,
    whiteSpace: 'nowrap' as const,
  },
  expiredOverlay: {
    position: 'absolute',
    inset: 0,
    zIndex: 9998,
    backgroundColor: 'rgba(250, 249, 246, 0.95)',
    backdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  expiredCard: {
    textAlign: 'center' as const,
    padding: '48px 56px',
    borderRadius: radii.md,
    border: `1.5px solid ${colors.border}`,
    backgroundColor: colors.bgCard,
    maxWidth: 400,
  },
  tabLockedOverlay: {
    position: 'absolute',
    inset: 0,
    zIndex: 9999,
    backgroundColor: 'rgba(250, 249, 246, 0.92)',
    backdropFilter: 'blur(6px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLockedCard: {
    textAlign: 'center',
    padding: '40px 48px',
    borderRadius: radii.md,
    border: `1.5px solid ${colors.border}`,
    backgroundColor: colors.bgCard,
  },
};
