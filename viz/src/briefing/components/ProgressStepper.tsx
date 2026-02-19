/**
 * ProgressStepper — 4-step horizontal indicator.
 *
 * Internal phases: documents → interviewer → questions → followups → instructions → brief
 * Visual steps: Documents → Interviewer → Questions → Brief
 *
 * Phases 'questions' and 'followups' map to stepper step "Questions".
 * Phases 'instructions' and 'brief' map to stepper step "Brief".
 */

import { colors, fonts } from '../../staffing/styles/tokens.js';

export type BriefingPhase =
  | 'documents'
  | 'interviewer'
  | 'questions'
  | 'followups'
  | 'instructions'
  | 'brief'
  // Legacy alias
  | 'memo';

interface StepDef {
  id: string;
  label: string;
  phases: BriefingPhase[];
}

const STEPS: StepDef[] = [
  { id: 'documents', label: 'Documents', phases: ['documents'] },
  { id: 'interviewer', label: 'Interviewer', phases: ['interviewer'] },
  { id: 'questions', label: 'Questions', phases: ['questions', 'followups'] },
  { id: 'brief', label: 'Brief', phases: ['instructions', 'brief', 'memo'] },
];

function phaseToStepIndex(phase: BriefingPhase): number {
  for (let i = 0; i < STEPS.length; i++) {
    if (STEPS[i].phases.includes(phase)) return i;
  }
  return 0;
}

interface Props {
  currentPhase: BriefingPhase;
}

export function ProgressStepper({ currentPhase }: Props) {
  const currentIdx = phaseToStepIndex(currentPhase);

  return (
    <div style={styles.container}>
      {STEPS.map((step, i) => {
        const isCompleted = i < currentIdx;
        const isActive = i === currentIdx;
        const dotColor = isCompleted
          ? colors.success
          : isActive
            ? colors.accent
            : colors.border;
        const labelColor = isCompleted
          ? colors.success
          : isActive
            ? colors.text
            : colors.textDim;

        return (
          <div key={step.id} style={styles.stepGroup}>
            {/* Connecting line before (except first) */}
            {i > 0 && (
              <div
                style={{
                  ...styles.line,
                  backgroundColor: i <= currentIdx ? colors.success : colors.border,
                }}
              />
            )}

            {/* Dot */}
            <div
              style={{
                ...styles.dot,
                backgroundColor: dotColor,
              }}
            >
              {isCompleted && (
                <span style={styles.check}>{'\u2713'}</span>
              )}
            </div>

            {/* Label */}
            <span
              style={{
                ...styles.label,
                color: labelColor,
                fontWeight: isActive ? 600 : 400,
              }}
            >
              {step.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 0,
    padding: '16px 0',
  },
  stepGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 0,
    position: 'relative',
  },
  line: {
    width: 48,
    height: 1,
    flexShrink: 0,
    transition: 'background-color 0.3s ease',
  },
  dot: {
    width: 20,
    height: 20,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    transition: 'background-color 0.3s ease',
  },
  check: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 700,
  },
  label: {
    fontSize: 11,
    fontFamily: fonts.sans,
    marginLeft: 6,
    whiteSpace: 'nowrap',
    transition: 'color 0.3s ease',
  },
};
