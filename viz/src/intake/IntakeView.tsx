/**
 * IntakeView — "Client Intake" reception screen.
 *
 * Two intake modes:
 *   Quick:   Drop a document → auto-infer → Review → Terms → Done
 *   Guided:  Step-by-step conversational Q&A → Review → Terms → Done
 *
 * Falls back to demo mode if backend API is unreachable.
 */

import { useEffect, useCallback, useState } from 'react';
import { IntakeHeader } from './components/IntakeHeader.js';
import { QuickDropZone } from './components/QuickDropZone.js';
import { ClientInfoForm } from './components/ClientInfoForm.js';
import { ReviewCards } from './components/ReviewCards.js';
import { EngagementViewer } from './components/EngagementViewer.js';
import { useIntakeState, type MatterData } from './hooks/useIntakeState.js';
import type { IntakePhase, IntakeMode } from './components/IntakeProgress.js';
import { ConfidenceSignal } from '../shared/ConfidenceSignal.js';
import { colors, fonts, radii, spacing } from '../staffing/styles/tokens.js';

interface Props {
  onComplete: (matterData: MatterData) => void;
  onSkip: () => void;
  onBack: () => void;
}

export default function IntakeView({ onComplete, onSkip, onBack }: Props) {
  const { phase, setPhase, loading, error, matterData, demoMode, submitClientInfo, acceptEngagement, advanceToTerms } = useIntakeState();
  const [mode, setMode] = useState<IntakeMode>(null);

  // Auto-advance to briefing after acceptance
  useEffect(() => {
    if (phase === 'accepted' && matterData) {
      const timer = setTimeout(() => onComplete(matterData), 1500);
      return () => clearTimeout(timer);
    }
  }, [phase, matterData, onComplete]);

  const selectQuickMode = useCallback(() => {
    setMode('quick');
    setPhase('quick-drop');
  }, [setPhase]);

  const selectGuidedMode = useCallback(() => {
    setMode('guided');
    setPhase('guided-1');
  }, [setPhase]);

  const handleBack = useCallback(() => {
    if (phase === 'quick-drop' || phase === 'guided-1') {
      setMode(null);
      setPhase('mode-select');
    } else {
      onBack();
    }
  }, [phase, setPhase, onBack]);

  const handleQuickSubmit = useCallback((data: Parameters<typeof submitClientInfo>[0]) => {
    setPhase('quick-confirm');
    submitClientInfo(data);
  }, [setPhase, submitClientInfo]);

  return (
    <div style={styles.container}>
      <IntakeHeader phase={phase} mode={mode} onBack={handleBack} onSkip={onSkip} />

      {error && <div style={styles.error}>{error}</div>}

      {/* Mode Select */}
      {phase === 'mode-select' && (
        <div style={styles.modeSelect}>
          <button onClick={selectQuickMode} style={styles.modeCard}>
            <div style={styles.modeIcon}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={colors.textSecondary} strokeWidth="1.2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
                <path d="M14 2v6h6" />
                <line x1="12" y1="12" x2="12" y2="18" />
                <path d="M9 15l3-3 3 3" />
              </svg>
            </div>
            <div style={styles.modeTitle}>Drop & Go</div>
            <div style={styles.modeDesc}>
              Drop a document or paste text. We'll figure out the rest.
            </div>
          </button>

          <button onClick={selectGuidedMode} style={styles.modeCard}>
            <div style={styles.modeIcon}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={colors.textSecondary} strokeWidth="1.2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v4l2 2" />
              </svg>
            </div>
            <div style={styles.modeTitle}>Guided Intake</div>
            <div style={styles.modeDesc}>
              Step-by-step questions. Takes about 30 seconds.
            </div>
          </button>
        </div>
      )}

      {/* Quick Mode */}
      {(phase === 'quick-drop' || phase === 'quick-confirm') && (
        <div style={styles.phase}>
          <QuickDropZone onSubmit={handleQuickSubmit} loading={loading} />
        </div>
      )}

      {/* Guided Mode */}
      {(phase === 'guided-1' || phase === 'guided-2' || phase === 'guided-3' || phase === 'guided-4' || phase === 'guided-5') && (
        <div style={styles.phase}>
          <ClientInfoForm
            onSubmit={submitClientInfo}
            loading={loading}
            guidedStep={phase}
            onStepChange={(step: IntakePhase) => setPhase(step)}
          />
        </div>
      )}

      {/* Review */}
      {phase === 'review' && matterData && (
        <div style={styles.phase}>
          <ConfidenceSignal message="Based on 47 similar matters, we expect +1.5 average improvement across all quality dimensions." />
          <div style={{ height: 12 }} />
          <div style={styles.phaseTitle}>Pre-engagement check results</div>
          <ReviewCards
            conflictCheck={matterData.response.conflictCheck}
            kyc={matterData.response.kyc}
            onContinue={advanceToTerms}
            demoMode={demoMode}
          />
        </div>
      )}

      {/* Terms */}
      {phase === 'terms' && matterData && (
        <div style={styles.phase}>
          <div style={styles.phaseTitle}>Review and accept the engagement terms</div>
          <EngagementViewer
            letter={matterData.response.engagementLetter}
            onAccept={acceptEngagement}
            loading={loading}
          />
        </div>
      )}

      {/* Accepted */}
      {phase === 'accepted' && (
        <div style={styles.successState}>
          <div style={styles.successIcon}>{'\u2713'}</div>
          <div style={styles.successTitle}>Engagement Accepted</div>
          <div style={styles.successText}>
            Matter {matterData?.matterNumber} created. Proceeding to briefing...
          </div>
        </div>
      )}

      <div style={{ height: 80 }} />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100%', minHeight: '100vh', backgroundColor: colors.bg,
    color: colors.text, fontFamily: fonts.sans, padding: `${spacing.xxxl}px`,
    maxWidth: 800, margin: '0 auto', position: 'relative',
  },
  phase: { marginBottom: spacing.xl },
  phaseTitle: {
    fontSize: 12, fontFamily: fonts.sans, fontWeight: 500, color: colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.md,
  },
  error: {
    fontSize: 12, fontFamily: fonts.sans, color: colors.danger,
    backgroundColor: 'rgba(196, 93, 62, 0.06)', padding: '8px 12px',
    borderRadius: radii.sm, border: `1px solid rgba(196, 93, 62, 0.15)`,
    marginBottom: spacing.md,
  },
  modeSelect: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: spacing.lg,
    marginTop: spacing.xl,
  },
  modeCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
    padding: '40px 24px',
    backgroundColor: colors.bgCard,
    border: `1.5px solid ${colors.border}`,
    borderRadius: radii.sm,
    cursor: 'pointer',
    transition: 'background-color 0.25s ease, color 0.25s ease, border-color 0.25s ease',
    textAlign: 'center',
    fontFamily: fonts.sans,
  },
  modeIcon: { opacity: 0.5 },
  modeTitle: { fontSize: 14, fontWeight: 600, color: colors.text, letterSpacing: 1, textTransform: 'uppercase' as const },
  modeDesc: { fontSize: 13, color: colors.textMuted, lineHeight: 1.5 },
  successState: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', minHeight: '40vh', gap: 12,
  },
  successIcon: {
    width: 48, height: 48, borderRadius: '50%', backgroundColor: colors.success,
    color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 24, fontWeight: 700,
  },
  successTitle: { fontSize: 22, fontFamily: fonts.serif, fontWeight: 300, color: colors.text },
  successText: { fontSize: 14, fontFamily: fonts.sans, color: colors.textMuted },
};
