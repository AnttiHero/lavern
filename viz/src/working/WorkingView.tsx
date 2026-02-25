/**
 * WorkingView — Live agent dashboard.
 *
 * v16: Replaced TeamPanel + ThinkingStream with HeartbeatBand + InsightFeed.
 *
 * Layout: WorkingHeader → HeartbeatBand → InsightFeed (full width)
 * Data: WebSocket events processed by useWorkingState into stream cards,
 *       filtered by useInsightFilter to remove noise (tool_used, agent_start/stop).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useWorkingState } from './hooks/useWorkingState.js';
import { useTeamRoster } from './hooks/useTeamRoster.js';
import { useInsightFilter } from './hooks/useInsightFilter.js';
import { useDebateThreads } from './hooks/useDebateThreads.js';
import { WorkingHeader } from './components/WorkingHeader.js';
import { HeartbeatBand } from './components/HeartbeatBand.js';
import { InsightFeed } from './components/InsightFeed.js';
import { SessionOverlay } from './components/SessionOverlay.js';
import { GateDialog } from '../components/GateDialog.js';
import { colors } from '../staffing/styles/tokens.js';
import { injectWorkingKeyframes } from './styles/animations.js';

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
};
