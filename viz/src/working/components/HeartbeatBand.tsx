/**
 * HeartbeatBand — Slim progress + stats strip.
 *
 * v18: Slimmed from 2-row layout to single compact row.
 * ActivityRing, NarrativeStatus, and AgentPresenceOrbs removed —
 * narrative messages now flow in the conversation feed via
 * ReassuranceCard, and activity is visible through ActivityCard.
 *
 * Layout: [Phase dots] · [Current phase label] | [Stats]
 */

import { useMemo, useState } from 'react';
import type { WorkflowStep } from '../../types/events.js';
import { RunningStats } from './RunningStats.js';
import { WORKFLOW_STEPS, WORKFLOW_STEP_MAP, STEP_LABELS } from '../../types/events.js';
import { colors, fonts } from '../../staffing/styles/tokens.js';

interface HeartbeatBandProps {
  currentStep: WorkflowStep;
  completedSteps: WorkflowStep[];
  cost: { accumulated: number; budget: number } | undefined;
  certaintyPct: number | undefined;
  findingCount: number;
  sessionStartTime: string | null;
  lastEventTimestamp: string | null;
  billableHours?: number;
}

/** Rotating color palette for phase dots. */
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
  cost,
  certaintyPct,
  findingCount,
  sessionStartTime,
  lastEventTimestamp,
  billableHours,
}: HeartbeatBandProps) {
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
    if (workflowId && WORKFLOW_STEP_MAP[workflowId]) {
      return WORKFLOW_STEP_MAP[workflowId];
    }
    if (currentStep && !WORKFLOW_STEPS.includes(currentStep)) {
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
    return WORKFLOW_STEPS;
  }, [workflowId, currentStep, completedSteps]);

  return (
    <nav style={styles.band} aria-label="Workflow phases">
      {/* Phase progress dots + current label */}
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
                  ...(isCurrent ? { animation: 'activeThinkingPulse 2s ease-in-out infinite' } : {}),
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
        insightCount={findingCount}
        cost={cost}
        certaintyPct={certaintyPct}
        billableHours={billableHours}
      />
    </nav>
  );
}

const styles: Record<string, React.CSSProperties> = {
  band: {
    flexShrink: 0,
    backgroundColor: colors.bgCard,
    borderBottom: `1px solid ${colors.border}`,
    padding: '8px 20px',
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
