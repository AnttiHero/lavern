/**
 * IntakeProgress — Adaptive horizontal stepper.
 *
 * Supports both Quick (Drop → Review → Terms → Done)
 * and Guided (Step 1–5 → Review → Terms → Done) modes.
 */

import { colors, fonts } from '../../staffing/styles/tokens.js';

export type IntakePhase =
  | 'mode-select'
  | 'guided-1' | 'guided-2' | 'guided-3' | 'guided-4' | 'guided-5'
  | 'quick-drop' | 'quick-confirm'
  | 'client-info'  // legacy compat
  | 'review' | 'terms' | 'accepted';

export type IntakeMode = 'quick' | 'guided' | null;

const GUIDED_STEPS: { phase: IntakePhase; label: string }[] = [
  { phase: 'guided-1', label: 'Client' },
  { phase: 'guided-2', label: 'Matter' },
  { phase: 'guided-3', label: 'Type' },
  { phase: 'guided-4', label: 'Region' },
  { phase: 'guided-5', label: 'Budget' },
  { phase: 'review', label: 'Review' },
  { phase: 'terms', label: 'Terms' },
  { phase: 'accepted', label: 'Done' },
];

const QUICK_STEPS: { phase: IntakePhase; label: string }[] = [
  { phase: 'quick-drop', label: 'Drop' },
  { phase: 'quick-confirm', label: 'Confirm' },
  { phase: 'review', label: 'Review' },
  { phase: 'terms', label: 'Terms' },
  { phase: 'accepted', label: 'Done' },
];

function getPhaseIndex(phase: IntakePhase, steps: { phase: IntakePhase }[]): number {
  const idx = steps.findIndex(s => s.phase === phase);
  return idx >= 0 ? idx : 0;
}

interface Props {
  currentPhase: IntakePhase;
  mode: IntakeMode;
}

export function IntakeProgress({ currentPhase, mode }: Props) {
  if (!mode) return null; // Don't show during mode-select

  const steps = mode === 'quick' ? QUICK_STEPS : GUIDED_STEPS;
  const currentIdx = getPhaseIndex(currentPhase, steps);

  return (
    <div style={styles.container}>
      {steps.map((step, i) => {
        const isCompleted = i < currentIdx;
        const isActive = i === currentIdx;
        const dotColor = isCompleted ? colors.success : isActive ? colors.accent : colors.border;
        const labelColor = isCompleted ? colors.success : isActive ? colors.text : colors.textDim;

        return (
          <div key={step.phase} style={styles.stepGroup}>
            {i > 0 && (
              <div style={{
                ...styles.line,
                backgroundColor: i <= currentIdx ? colors.success : colors.border,
              }} />
            )}
            <div style={{ ...styles.dot, backgroundColor: dotColor }}>
              {isCompleted && <span style={styles.check}>{'\u2713'}</span>}
            </div>
            <span style={{
              ...styles.label,
              color: labelColor,
              fontWeight: isActive ? 600 : 400,
            }}>
              {step.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px 0' },
  stepGroup: { display: 'flex', alignItems: 'center' },
  line: { width: 28, height: 1, flexShrink: 0, transition: 'background-color 0.3s ease' },
  dot: { width: 16, height: 16, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'background-color 0.3s ease' },
  check: { color: '#fff', fontSize: 8, fontWeight: 700 },
  label: { fontSize: 10, fontFamily: fonts.sans, marginLeft: 4, whiteSpace: 'nowrap', transition: 'color 0.3s ease' },
};
