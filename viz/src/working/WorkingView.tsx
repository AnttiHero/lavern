/**
 * WorkingView — Live agent dashboard.
 *
 * v16: Replaced TeamPanel + ThinkingStream with HeartbeatBand + InsightFeed.
 *
 * Layout: WorkingHeader → HeartbeatBand → InsightFeed (full width)
 * Data: WebSocket events processed by useWorkingState into stream cards,
 *       filtered by useInsightFilter to remove noise (tool_used, agent_start/stop).
 */

import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useWorkingState } from './hooks/useWorkingState.js';
import { useTeamRoster } from './hooks/useTeamRoster.js';
import { useInsightFilter } from './hooks/useInsightFilter.js';
import { useDebateThreads } from './hooks/useDebateThreads.js';
import { WorkingHeader } from './components/WorkingHeader.js';
import { HeartbeatBand } from './components/HeartbeatBand.js';
import { InsightFeed } from './components/InsightFeed.js';
import { SessionOverlay } from './components/SessionOverlay.js';
import { GateDialog } from '../components/GateDialog.js';
import { VerificationFeed } from '../verification/VerificationFeed.js';
import { colors, radii, spacing } from '../staffing/styles/tokens.js';
import { injectWorkingKeyframes } from './styles/animations.js';

const PacManGame = lazy(() => import('./components/PacManGame.js').then(m => ({ default: m.PacManGame })));

interface WorkingViewProps {
  onComplete: () => void;
  onBack: () => void;
  onSkip: () => void;
}

export default function WorkingView({ onComplete, onBack, onSkip }: WorkingViewProps) {
  // Inject CSS keyframes for animations
  useEffect(() => { injectWorkingKeyframes(); }, []);

  const { team } = useTeamRoster();
  const teamRoles = useMemo(() => team.map(t => t.role), [team]);

  const {
    state,
    connectToSession,
    connectToReplay,
    disconnect,
    dismissGate,
    pause,
    resume,
    setSpeed,
  } = useWorkingState(onComplete, teamRoles);

  // Thread debates from flat stream
  const { debateThreads, threadedStream } = useDebateThreads(state.streamCards);

  // Filter to insights only — no tool_used, agent_start, agent_stop
  const insightCards = useInsightFilter(threadedStream);

  const handleGateDecision = useCallback(
    (_decision: 'approve' | 'reject' | 'modify', _notes?: string) => {
      dismissGate();
    },
    [dismissGate]
  );

  const [halting, setHalting] = useState(false);
  const handleHalt = useCallback(async () => {
    if (!state.sessionId || halting) return;
    setHalting(true);
    try {
      await fetch(`/api/sessions/${state.sessionId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reason: 'Emergency stop by user' }),
      });
    } catch (e) {
      console.error('[HALT] Failed to halt session:', e);
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

  const [showPacMan, setShowPacMan] = useState(false);

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

  return (
    <div style={styles.root}>
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
      />

      <HeartbeatBand
        currentStep={state.currentStep}
        completedSteps={state.completedSteps}
        activeThinkingAgents={state.activeThinkingAgents}
        agentStatuses={state.agentStatuses}
        team={team}
        cost={state.cost}
        certaintyPct={runningCertainty}
        findingCount={totalFindings}
        sessionStartTime={state.events[0]?.timestamp ?? null}
        lastEventTimestamp={state.lastEventTimestamp}
      />

      {/* Verification pipeline display — shown when verification events are streaming */}
      {hasVerificationEvents && (
        <div style={{ overflow: 'auto', flex: hasVerificationEvents ? '0 0 auto' : undefined, maxHeight: '50vh' }}>
          <VerificationFeed streamCards={state.streamCards} />
        </div>
      )}

      <InsightFeed
        cards={insightCards}
        team={team}
        onGateClick={() => { /* gate dialog is shown via state.pendingGate */ }}
        isConnected={state.connectionStatus === 'connected'}
        debateThreads={debateThreads}
      />

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
          onDecision={handleGateDecision}
          onDismiss={dismissGate}
        />
      )}

      {/* Pac-Man trigger */}
      <button
        onClick={() => setShowPacMan(true)}
        style={styles.ghostBtn}
        title="Play Pac-Man while you wait"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M10 2C6 2 3 5 3 9v7c0 0 1.5-2 2.5-2s1.5 2 2.5 2 1.5-2 2.5-2 1.5 2 2.5 2 1.5-2 2.5-2V9c0-4-3-7-7-7z" fill={colors.textMuted} opacity={0.5}/>
          <circle cx="7.5" cy="8" r="2" fill="#fff"/>
          <circle cx="12.5" cy="8" r="2" fill="#fff"/>
          <circle cx="8" cy="8" r="1" fill="#222"/>
          <circle cx="13" cy="8" r="1" fill="#222"/>
        </svg>
      </button>

      {/* Pac-Man game overlay */}
      {showPacMan && (
        <Suspense fallback={null}>
          <PacManGame onClose={() => setShowPacMan(false)} />
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
};
