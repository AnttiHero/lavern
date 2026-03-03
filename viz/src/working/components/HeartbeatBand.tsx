/**
 * HeartbeatBand — The anti-anxiety zone.
 *
 * A persistent horizontal band below the header that is always visible,
 * always animating. The user NEVER stares at a frozen screen.
 *
 * v17: Workflow-aware — reads the workflow ID from sessionStorage and
 *      shows the correct pipeline steps via WORKFLOW_STEP_MAP.
 *
 * Layout:
 *   Top row:  ActivityRing | NarrativeStatus | AgentPresenceOrbs
 *   Bottom:   Inline phase progress (from PhaseStrip) + RunningStats
 */

import { useMemo, useState } from 'react';
import type { WorkflowStep } from '../../types/events.js';
import type { AgentProfile } from '../../staffing/hooks/useAgentProfiles.js';
import type { AgentStatus, ActiveThinkingAgent } from '../hooks/useWorkingState.js';
import { useNarrativeStatus } from '../hooks/useNarrativeStatus.js';
import { ActivityRing } from './ActivityRing.js';
import { AgentPresenceOrbs } from './AgentPresenceOrbs.js';
import { NarrativeStatus } from './NarrativeStatus.js';
import { RunningStats } from './RunningStats.js';
import { WORKFLOW_STEPS, WORKFLOW_STEP_MAP, STEP_LABELS } from '../../types/events.js';
import { colors, fonts } from '../../staffing/styles/tokens.js';

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

/** Rotating color palette for phase dots — deterministic by step index. */
const STEP_COLOR_PALETTE = [
  '#2E7D9C', '#4A7C50', '#B8860B', '#C45D3E',
  '#7B5EA7', '#9C7B3E', '#8B6914', '#2E7D9C',
];

function getStepColor(index: number): string {
  return STEP_COLOR_PALETTE[index % STEP_COLOR_PALETTE.length];
}

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
  // Resolve the correct pipeline for this workflow
  const [workflowId] = useState<string>(() => {
    try {
      const configStr = sessionStorage.getItem('shem-briefing-config');
      if (configStr) {
        const config = JSON.parse(configStr);
        return config.workflowId ?? '';
      }
    } catch { /* ignore */ }
    return '';
  });

  const pipelineSteps = useMemo(() => {
    // 1. Try the known workflow map
    if (workflowId && WORKFLOW_STEP_MAP[workflowId]) {
      return WORKFLOW_STEP_MAP[workflowId];
    }
    // 2. If current step is not in legacy pipeline, build from events
    if (currentStep && !WORKFLOW_STEPS.includes(currentStep)) {
      // Build a dynamic pipeline from completed steps + current
      const seen = new Set<WorkflowStep>();
      const ordered: WorkflowStep[] = [];
      for (const s of completedSteps) {
        if (!seen.has(s)) { seen.add(s); ordered.push(s); }
      }
      if (!seen.has(currentStep)) {
        seen.add(currentStep);
        ordered.push(currentStep);
      }
      if (!seen.has('delivered')) ordered.push('delivered');
      return ordered;
    }
    // 3. Fallback to legacy
    return WORKFLOW_STEPS;
  }, [workflowId, currentStep, completedSteps]);

  const totalSteps = pipelineSteps.filter(s => s !== 'delivered').length;
  const progress = totalSteps > 0 ? Math.min(completedSteps.length / totalSteps, 1) : 0;

  const narrativeMessage = useNarrativeStatus({
    currentStep,
    activeThinkingAgents,
    lastEventTimestamp,
    findingCount,
    teamSize: team.length,
  });

  const insightCount = findingCount;

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
          {pipelineSteps.map((step, idx) => {
            const isCompleted = completedSteps.includes(step);
            const isCurrent = step === currentStep;
            const stepColor = getStepColor(idx);

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
                    {STEP_LABELS[step] ?? step.replace(/_/g, ' ')}
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
