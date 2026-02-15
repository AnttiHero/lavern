/**
 * PhaseStrip — Horizontal workflow phase indicator.
 *
 * Shows the current phase prominently, completed phases as faded chips,
 * and upcoming phases as muted dots.
 */

import type { WorkflowStep } from '../../types/events.js';
import { WORKFLOW_STEPS, STEP_LABELS } from '../../types/events.js';
import { PHASE_DESCRIPTIONS } from '../data/phase-descriptions.js';
import { colors, fonts, radii } from '../../staffing/styles/tokens.js';

interface PhaseStripProps {
  currentStep: WorkflowStep;
  completedSteps: WorkflowStep[];
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

export function PhaseStrip({ currentStep, completedSteps }: PhaseStripProps) {
  const completedCount = completedSteps.length;
  const phaseInfo = PHASE_DESCRIPTIONS[currentStep];

  return (
    <div style={styles.outerContainer}>
      <div style={styles.container}>
        <div style={styles.phases}>
          {WORKFLOW_STEPS.map((step) => {
            const isCompleted = completedSteps.includes(step);
            const isCurrent = step === currentStep;
            const color = STEP_COLORS[step];

            if (isCurrent) {
              return (
                <div key={step} style={styles.currentPhase}>
                  <div style={{ ...styles.currentDot, backgroundColor: color }} />
                  <span style={{ ...styles.currentLabel, color }}>
                    {STEP_LABELS[step]}
                  </span>
                </div>
              );
            }

            if (isCompleted) {
              return (
                <div key={step} style={styles.completedChip}>
                  <span style={styles.checkmark}>{'\u2713'}</span>
                  <span style={styles.completedLabel}>{STEP_LABELS[step]}</span>
                </div>
              );
            }

            // Upcoming: just a dot
            return (
              <div
                key={step}
                style={styles.upcomingDot}
                title={STEP_LABELS[step]}
              />
            );
          })}
        </div>

        <span style={styles.progress}>
          {completedCount} / {WORKFLOW_STEPS.length - 1}
        </span>
      </div>

      {/* Phase description — proactive communication */}
      {phaseInfo && currentStep !== 'delivered' && (
        <div style={styles.descriptionBar}>
          <span style={styles.descriptionText}>{phaseInfo.description}</span>
          {phaseInfo.estimatedMinutes > 0 && (
            <span style={styles.estimatedTime}>
              ~{phaseInfo.estimatedMinutes} min
            </span>
          )}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  outerContainer: {
    flexShrink: 0,
  },
  container: {
    width: '100%',
    height: 46,
    backgroundColor: colors.bgCard,
    borderBottom: `1px solid ${colors.border}`,
    display: 'flex',
    alignItems: 'center',
    padding: '0 20px',
    gap: 12,
    flexShrink: 0,
  },
  descriptionBar: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 20px',
    backgroundColor: colors.bgPanel,
    borderBottom: `1px solid ${colors.border}`,
  },
  descriptionText: {
    fontSize: 11,
    fontFamily: fonts.sans,
    fontWeight: 400,
    color: colors.textDim,
    fontStyle: 'italic',
  },
  estimatedTime: {
    fontSize: 10,
    fontFamily: fonts.mono,
    fontWeight: 500,
    color: colors.textMuted,
  },
  phases: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    overflow: 'hidden',
  },
  currentPhase: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 12px',
    backgroundColor: colors.bgPanel,
    borderRadius: radii.sm,
    flexShrink: 0,
  },
  currentDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    flexShrink: 0,
  },
  currentLabel: {
    fontSize: 13,
    fontFamily: fonts.sans,
    fontWeight: 600,
    whiteSpace: 'nowrap' as const,
  },
  completedChip: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '3px 8px',
    borderRadius: radii.pill,
    backgroundColor: 'transparent',
    flexShrink: 0,
  },
  checkmark: {
    fontSize: 10,
    color: colors.success,
    fontWeight: 700,
  },
  completedLabel: {
    fontSize: 11,
    fontFamily: fonts.sans,
    fontWeight: 400,
    color: colors.textDim,
    whiteSpace: 'nowrap' as const,
  },
  upcomingDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    backgroundColor: colors.border,
    flexShrink: 0,
  },
  progress: {
    fontSize: 11,
    color: colors.textMuted,
    fontFamily: fonts.sans,
    fontWeight: 500,
    whiteSpace: 'nowrap' as const,
    flexShrink: 0,
  },
};
