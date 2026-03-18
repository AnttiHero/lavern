/**
 * IntakeHeader — Title + progress stepper + skip/back buttons.
 */

import { IntakeProgress, type IntakePhase, type IntakeMode } from './IntakeProgress.js';
import { colors, fonts, radii } from '../../staffing/styles/tokens.js';
import { LavernIlluminated } from '../../components/LavernIlluminated.js';

interface Props {
  phase: IntakePhase;
  mode: IntakeMode;
  onBack: () => void;
  onSkip: () => void;
}

export function IntakeHeader({ phase, mode, onBack, onSkip }: Props) {
  return (
    <div style={styles.container}>
      <button
        onClick={onBack}
        style={styles.backButton}
        onMouseEnter={e => { const b = e.currentTarget; b.style.backgroundColor = colors.text; b.style.color = '#fff'; }}
        onMouseLeave={e => { const b = e.currentTarget; b.style.backgroundColor = 'transparent'; b.style.color = colors.text; }}
      >{'\u2190'} Back</button>
      <button
        onClick={onSkip}
        style={styles.skipButton}
        onMouseEnter={e => { const b = e.currentTarget; b.style.backgroundColor = colors.text; b.style.color = '#fff'; b.style.borderColor = colors.text; }}
        onMouseLeave={e => { const b = e.currentTarget; b.style.backgroundColor = 'transparent'; b.style.color = colors.textMuted; b.style.borderColor = colors.border; }}
      >Skip {'\u2192'}</button>
      <div style={styles.logoType}><LavernIlluminated color={colors.textMuted} /></div>
      <h1 style={styles.title}>
        {phase === 'mode-select' ? <>Lavern <span style={{ fontStyle: 'italic' }}>Intake</span></> : <>Lavern <span style={{ fontStyle: 'italic' }}>Intake</span></>}
      </h1>
      {phase === 'mode-select' && (
        <p style={styles.subtitle}>How would you like to get started?</p>
      )}
      <IntakeProgress currentPhase={phase} mode={mode} />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { textAlign: 'center', marginBottom: 24, position: 'relative' },
  backButton: {
    position: 'absolute', left: 0, top: 0, padding: '6px 14px', borderRadius: radii.sm,
    border: `1.5px solid ${colors.text}`, backgroundColor: 'transparent',
    color: colors.text, fontFamily: fonts.sans, fontSize: 11, fontWeight: 600,
    letterSpacing: 1, textTransform: 'uppercase' as const, cursor: 'pointer',
    transition: 'background-color 0.25s ease, color 0.25s ease, border-color 0.25s ease',
  },
  skipButton: {
    position: 'absolute', right: 0, top: 0, padding: '6px 14px', borderRadius: radii.sm,
    border: `1.5px solid ${colors.border}`, backgroundColor: 'transparent',
    color: colors.textMuted, fontFamily: fonts.sans, fontSize: 11, fontWeight: 600,
    letterSpacing: 1, textTransform: 'uppercase' as const, cursor: 'pointer',
    transition: 'background-color 0.25s ease, color 0.25s ease, border-color 0.25s ease',
  },
  logoType: {
    fontSize: 10, fontWeight: 600, fontFamily: fonts.sans,
    color: colors.textMuted, letterSpacing: 4, textTransform: 'uppercase' as const,
    marginBottom: 4,
  },
  title: { fontSize: 32, fontFamily: fonts.serif, fontWeight: 300, color: colors.text, margin: 0, lineHeight: 1.2 },
  subtitle: { fontSize: 13, fontFamily: fonts.sans, color: colors.textMuted, marginTop: 8 },
};
