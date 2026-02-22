/**
 * WorkingView — Live agent dashboard.
 *
 * Replaces the old Phaser 3 office with a warm editorial "thinking stream"
 * that lets clients follow their agents' deliberation in real time.
 *
 * Layout: WorkingHeader → PhaseStrip → (TeamPanel | ThinkingStream)
 * Data: WebSocket events processed by useWorkingState into stream cards.
 */

import { useCallback, useMemo, useState } from 'react';
import { useWorkingState } from './hooks/useWorkingState.js';
import { useTeamRoster } from './hooks/useTeamRoster.js';
import { useStreamFilter } from './hooks/useStreamFilter.js';
import { WorkingHeader } from './components/WorkingHeader.js';
import { PhaseStrip } from './components/PhaseStrip.js';
import { TeamPanel } from './components/TeamPanel.js';
import { ThinkingStream } from './components/ThinkingStream.js';
import { SessionOverlay } from './components/SessionOverlay.js';
import { GateDialog } from '../components/GateDialog.js';
import { colors } from '../staffing/styles/tokens.js';

interface WorkingViewProps {
  onComplete: () => void;
  onBack: () => void;
  onSkip: () => void;
}

export default function WorkingView({ onComplete, onBack, onSkip }: WorkingViewProps) {
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
  } = useWorkingState(onComplete);

  const {
    filteredCards,
    filterByAgent,
    setFilterByAgent,
    searchText,
    setSearchText,
  } = useStreamFilter(state.streamCards);

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

      <PhaseStrip
        currentStep={state.currentStep}
        completedSteps={state.completedSteps}
      />

      <div style={styles.main}>
        <TeamPanel
          team={team}
          agentStatuses={state.agentStatuses}
          filterByAgent={filterByAgent}
          onFilterAgent={setFilterByAgent}
          activeAgentCount={state.activeAgentCount}
          totalEventCount={state.events.length}
        />

        <ThinkingStream
          cards={filteredCards}
          team={team}
          searchText={searchText}
          onSearchChange={setSearchText}
          onGateClick={() => { /* gate dialog is shown via state.pendingGate */ }}
          isConnected={state.connectionStatus === 'connected'}
        />
      </div>

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
  main: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
  },
};
