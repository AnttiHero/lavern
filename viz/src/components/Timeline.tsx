/**
 * Timeline — Workflow progress bar showing the 10-step pipeline.
 *
 * Warm editorial design — Inter font, white background, muted step colors.
 * Displays which steps are completed, current, and upcoming.
 */

import type { WorkflowStep } from '../types/events.js';
import { WORKFLOW_STEPS, STEP_LABELS } from '../types/events.js';
import { colors, fonts, radii } from '../staffing/styles/tokens.js';

interface TimelineProps {
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

export function Timeline({ currentStep, completedSteps }: TimelineProps) {
  return (
    <div style={styles.container}>
      <div style={styles.track}>
        {WORKFLOW_STEPS.map((step, i) => {
          const isCompleted = completedSteps.includes(step);
          const isCurrent = step === currentStep;
          const color = STEP_COLORS[step];

          return (
            <div key={step} style={styles.stepWrapper}>
              {/* Connector line */}
              {i > 0 && (
                <div
                  style={{
                    ...styles.connector,
                    backgroundColor: isCompleted ? color : colors.border,
                  }}
                />
              )}

              {/* Step dot */}
              <div
                style={{
                  ...styles.dot,
                  backgroundColor: isCompleted ? color : isCurrent ? color : colors.bgPanel,
                  border: isCurrent ? `2px solid ${color}` : `2px solid ${isCompleted ? color : colors.border}`,
                  boxShadow: isCurrent ? `0 0 0 3px rgba(${hexToRgb(color)}, 0.15)` : 'none',
                  transform: isCurrent ? 'scale(1.3)' : 'scale(1)',
                }}
                title={STEP_LABELS[step]}
              />

              {/* Label (only for current and gate steps) */}
              {(isCurrent || step.includes('gate') || step === 'delivered') && (
                <div
                  style={{
                    ...styles.label,
                    color: isCurrent ? color : colors.textDim,
                    fontWeight: isCurrent ? 600 : 400,
                  }}
                >
                  {STEP_LABELS[step]}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Progress fraction */}
      <div style={styles.progress}>
        {completedSteps.length} / {WORKFLOW_STEPS.length - 1}
      </div>
    </div>
  );
}

/** Convert hex color to r,g,b string for rgba() */
function hexToRgb(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100%',
    padding: '10px 20px',
    backgroundColor: colors.bgCard,
    borderTop: `1px solid ${colors.border}`,
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  track: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    position: 'relative' as const,
  },
  stepWrapper: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    position: 'relative' as const,
    flex: 1,
  },
  connector: {
    position: 'absolute' as const,
    top: 8,
    left: '-50%',
    right: '50%',
    height: 2,
    zIndex: 0,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: '50%',
    zIndex: 1,
    transition: 'background-color 0.3s ease, color 0.3s ease, border-color 0.3s ease',
    cursor: 'pointer',
  },
  label: {
    fontSize: 9,
    fontFamily: fonts.sans,
    marginTop: 4,
    whiteSpace: 'nowrap' as const,
    textAlign: 'center' as const,
    fontWeight: 400,
  },
  progress: {
    fontSize: 11,
    color: colors.textMuted,
    fontFamily: fonts.sans,
    fontWeight: 500,
    whiteSpace: 'nowrap' as const,
  },
};
