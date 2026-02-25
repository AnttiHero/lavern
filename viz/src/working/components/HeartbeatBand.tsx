/**
 * HeartbeatBand — The anti-anxiety zone.
 *
 * A persistent horizontal band below the header that is always visible,
 * always animating. The user NEVER stares at a frozen screen.
 *
 * Layout:
 *   Top row:  ActivityRing | NarrativeStatus | AgentPresenceOrbs
 *   Bottom:   Inline phase progress (from PhaseStrip) + RunningStats
 */

import { useMemo } from 'react';
import type { WorkflowStep } from '../../types/events.js';
import type { AgentProfile } from '../../staffing/hooks/useAgentProfiles.js';
import type { AgentStatus, ActiveThinkingAgent } from '../hooks/useWorkingState.js';
import { useNarrativeStatus } from '../hooks/useNarrativeStatus.js';
import { ActivityRing } from './ActivityRing.js';
import { AgentPresenceOrbs } from './AgentPresenceOrbs.js';
import { NarrativeStatus } from './NarrativeStatus.js';
import { RunningStats } from './RunningStats.js';
import { WORKFLOW_STEPS, STEP_LABELS } from '../../types/events.js';
import { colors, fonts, radii } from '../../staffing/styles/tokens.js';

interface HeartbeatBandProps {
  currentStep: WorkflowStep;
  completedSteps: WorkflowStep[];
  activeThinkingAgents: Map<string, ActiveThinkingAgent>;
  agentStatuses: Map<string, AgentStatus>;
  team: AgentProfile[];
  cost: { accumulated: number; budget: number } | undefined;
  certaintyPct: number | undefined;
  findingCount: number;
  sessionStartTime: string | null;
  lastEventTimestamp: string | null;
}

const STEP_COLORS: Record<WorkflowStep, string> = {
  intake: '#2E7D9C',
  parallel_analysis: '#4A7C50',
  debate_1: '#B8860B',
  ethics_gate: '#C45D3E',
  transformation: '#4A7C50',
  parallel_verification: '#7B5EA7',
  debate_2: '#B8860B',
  meaning_gate: '#7B5EA7',
  synthesis: '#9C7B3E',
  final_gate: '#8B6914',
  delivered: '#4A7C50',
};

export function HeartbeatBand({
  currentStep,
  completedSteps,
  activeThinkingAgents,
  agentStatuses,
  team,
  cost,
  certaintyPct,
  findingCount,
  sessionStartTime,
  lastEventTimestamp,
}: HeartbeatBandProps) {
  const totalSteps = WORKFLOW_STEPS.length - 1; // exclude 'delivered'
  const progress = Math.min(completedSteps.length / totalSteps, 1);

  const narrativeMessage = useNarrativeStatus({
    currentStep,
    activeThinkingAgents,
    lastEventTimestamp,
    findingCount,
    teamSize: team.length,
  });

  const insightCount = findingCount; // findings are the primary insight metric

  return (
    <div style={styles.band}>
      {/* Top row: Ring | Narrative | Orbs */}
      <div style={styles.topRow}>
        <ActivityRing
          progress={progress}
          activeCount={activeThinkingAgents.size}
        />

        <NarrativeStatus message={narrativeMessage} />

        <AgentPresenceOrbs
          team={team}
          agentStatuses={agentStatuses}
          activeThinkingAgents={activeThinkingAgents}
        />
      </div>

      {/* Bottom row: Phase progress + Stats */}
      <div style={styles.bottomRow}>
        {/* Inline phase progress */}
        <div style={styles.phaseRow}>
          {WORKFLOW_STEPS.map((step) => {
            const isCompleted = completedSteps.includes(step);
            const isCurrent = step === currentStep;
            const stepColor = STEP_COLORS[step];

            if (step === 'delivered' && currentStep !== 'delivered') return null;

            return (
              <div key={step} style={styles.phaseItem}>
                <div
                  style={{
                    width: isCurrent ? 8 : 6,
                    height: isCurrent ? 8 : 6,
                    borderRadius: '50%',
                    backgroundColor: isCompleted
                      ? colors.success
                      : isCurrent
                        ? stepColor
                        : colors.border,
                    transition: 'all 0.3s ease',
                    flexShrink: 0,
                  }}
                />
                {(isCurrent || isCompleted) && (
                  <span
                    style={{
                      fontSize: 10,
                      fontFamily: fonts.sans,
                      color: isCurrent ? stepColor : colors.textDim,
                      fontWeight: isCurrent ? 600 : 400,
                      whiteSpace: 'nowrap' as const,
                    }}
                  >
                    {STEP_LABELS[step]}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Running stats */}
        <RunningStats
          sessionStartTime={sessionStartTime}
          insightCount={insightCount}
          cost={cost}
          certaintyPct={certaintyPct}
        />
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  band: {
    flexShrink: 0,
    backgroundColor: colors.bgCard,
    borderBottom: `1px solid ${colors.border}`,
    padding: '14px 20px 10px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 12,
  },
  topRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
  },
  bottomRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  phaseRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    overflow: 'hidden',
  },
  phaseItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 3,
  },
};
