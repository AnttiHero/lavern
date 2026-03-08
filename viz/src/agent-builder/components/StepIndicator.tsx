/**
 * StepIndicator — Three-dot step progress for the agent builder wizard.
 *
 * Each step dot is clickable and shows current/completed/pending state.
 * Warm editorial design — matches existing token palette.
 */

import { colors, fonts } from '../../staffing/styles/tokens.js';
import type { BuilderStep } from '../hooks/useAgentBuilder.js';

interface Props {
  current: BuilderStep;
  onGoTo: (step: BuilderStep) => void;
}

const STEPS: Array<{ step: BuilderStep; label: string }> = [
  { step: 1, label: 'Identity' },
  { step: 2, label: 'Face' },
  { step: 3, label: 'Stats' },
];

export function StepIndicator({ current, onGoTo }: Props) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      justifyContent: 'center',
    }}>
      {STEPS.map(({ step, label }, i) => {
        const isActive = step === current;
        const isCompleted = step < current;

        return (
          <div key={step} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => onGoTo(step)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 10px',
                border: 'none',
                borderRadius: 999,
                backgroundColor: isActive
                  ? colors.text
                  : isCompleted
                    ? colors.bgPanel
                    : 'transparent',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              {/* Step number dot */}
              <div style={{
                width: 20,
                height: 20,
                borderRadius: '50%',
                border: `1.5px solid ${isActive ? '#fff' : isCompleted ? colors.text : colors.border}`,
                backgroundColor: isCompleted ? colors.text : 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 10,
                fontFamily: fonts.sans,
                fontWeight: 600,
                color: isActive ? '#fff' : isCompleted ? '#fff' : colors.textMuted,
                transition: 'all 0.2s ease',
              }}>
                {isCompleted ? '\u2713' : step}
              </div>

              <span style={{
                fontSize: 11,
                fontFamily: fonts.sans,
                fontWeight: isActive ? 600 : 400,
                color: isActive ? '#fff' : isCompleted ? colors.text : colors.textMuted,
                letterSpacing: 0.5,
                transition: 'color 0.2s ease',
              }}>
                {label}
              </span>
            </button>

            {/* Connector line */}
            {i < STEPS.length - 1 && (
              <div style={{
                width: 32,
                height: 1,
                backgroundColor: step < current ? colors.text : colors.border,
                transition: 'background-color 0.3s ease',
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}
