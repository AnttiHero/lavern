/**
 * AgentBuilderView — NBA2K-style custom agent creator.
 *
 * Three-step wizard with a 60/40 split layout:
 *   Left (60%):  Wizard steps (Identity → Face → Stats)
 *   Right (40%): Persistent live card preview
 *
 * On "Forge", a full-screen card reveal animation plays.
 */

import { useState, useCallback, useMemo } from 'react';
import { AnimatePresence } from 'motion/react';
import { useAgentBuilder } from './hooks/useAgentBuilder.js';
import { useCustomAgents } from './hooks/useCustomAgents.js';
import { useSoundEffects } from '../staffing/hooks/useSoundEffects.js';
import { StepIndicator } from './components/StepIndicator.js';
import { IdentityStep } from './components/IdentityStep.js';
import { FaceBuilderStep } from './components/FaceBuilderStep.js';
import { StatsStep } from './components/StatsStep.js';
import { LiveCardPreview } from './components/LiveCardPreview.js';
import { CardRevealOverlay } from './components/CardRevealOverlay.js';
import { colors, fonts, radii } from '../staffing/styles/tokens.js';
import type { AgentProfile } from '../../../src/types/agent-profile.js';

interface Props {
  onBack: () => void;
}

export default function AgentBuilderView({ onBack }: Props) {
  const builder = useAgentBuilder();
  const { addAgent, isAtCap, maxAgents } = useCustomAgents();
  const { play } = useSoundEffects();

  const [showReveal, setShowReveal] = useState(false);
  const [revealProfile, setRevealProfile] = useState<AgentProfile | null>(null);

  // Build a preview profile for the live card
  const previewProfile = useMemo(() => builder.buildProfile(), [builder]);

  // ── Navigation ─────────────────────────────────────────────────────────

  const handleNext = useCallback(() => {
    if (builder.step === 3) {
      // Step 3 → Forge! Show the reveal
      const profile = builder.buildProfile();
      setRevealProfile(profile);
      setShowReveal(true);
      play('confirm');
    } else {
      builder.nextStep();
      play('flip');
    }
  }, [builder, play]);

  const handlePrev = useCallback(() => {
    builder.prevStep();
    play('flip');
  }, [builder, play]);

  // ── Reveal actions ─────────────────────────────────────────────────────

  const handleSave = useCallback(() => {
    if (!revealProfile) return;
    addAgent(revealProfile);
    play('confirm');
    setShowReveal(false);
    // Navigate to team to see the agent
    window.location.hash = '#/team';
  }, [revealProfile, addAgent, play]);

  const handleBuildAnother = useCallback(() => {
    builder.reset();
    setShowReveal(false);
    setRevealProfile(null);
    play('preset');
  }, [builder, play]);

  const handleCloseReveal = useCallback(() => {
    setShowReveal(false);
    setRevealProfile(null);
  }, []);

  // ── Step content ───────────────────────────────────────────────────────

  const stepContent = (() => {
    switch (builder.step) {
      case 1:
        return (
          <IdentityStep
            state={builder.state}
            onUpdateField={builder.updateField}
            onApplyPreset={(presetId) => {
              builder.applyPreset(presetId);
              play('preset');
            }}
          />
        );
      case 2:
        return (
          <FaceBuilderStep
            state={builder.state}
            avatarExtra={builder.avatarExtra}
            onUpdateField={builder.updateField}
            onUpdateAvatarFeature={builder.updateAvatarFeature}
          />
        );
      case 3:
        return (
          <StatsStep
            state={builder.state}
            ovr={builder.ovr}
            costTier={builder.costTier}
            billingRate={builder.billingRate}
            onUpdateField={builder.updateField}
            onUpdateSkill={builder.updateSkill}
            onUpdatePersonality={builder.updatePersonality}
            onTogglePracticeArea={builder.togglePracticeArea}
          />
        );
    }
  })();

  // ── Button labels ──────────────────────────────────────────────────────

  const nextLabel = builder.step === 3 ? 'Forge Agent' : 'Next';
  const nextDisabled = builder.step === 3 ? !builder.isValid : (builder.step === 1 && !builder.isValid);

  return (
    <>
      <div style={{
        width: '100%',
        minHeight: '100vh',
        backgroundColor: colors.bg,
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Top bar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 32px',
          borderBottom: `1px solid ${colors.border}`,
        }}>
          <button
            onClick={onBack}
            style={{
              fontSize: 13,
              fontFamily: fonts.sans,
              color: colors.textMuted,
              backgroundColor: 'transparent',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {'\u2190'} Back
          </button>

          <div style={{
            fontSize: 15,
            fontFamily: fonts.serif,
            fontWeight: 600,
            color: colors.text,
            letterSpacing: 1,
          }}>
            Agent Builder
          </div>

          <div style={{ width: 60 }} /> {/* Spacer */}
        </div>

        {/* Step indicator */}
        <div style={{
          padding: '16px 32px',
          borderBottom: `1px solid ${colors.border}`,
        }}>
          <StepIndicator current={builder.step} onGoTo={builder.goToStep} />
        </div>

        {/* Main split layout */}
        <div style={{
          flex: 1,
          display: 'flex',
          overflow: 'hidden',
        }}>
          {/* Left side — wizard steps (scrollable) */}
          <div style={{
            flex: '0 0 60%',
            padding: '28px 40px 100px 40px',
            overflowY: 'auto',
            borderRight: `1px solid ${colors.border}`,
          }}>
            {stepContent}
          </div>

          {/* Right side — live card preview (sticky) */}
          <div style={{
            flex: '0 0 40%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '28px 24px',
            backgroundColor: colors.bgPanel,
            position: 'sticky',
            top: 0,
            alignSelf: 'flex-start',
            minHeight: 'calc(100vh - 120px)',
          }}>
            <LiveCardPreview
              profile={previewProfile}
              ovr={builder.ovr}
              costTier={builder.costTier}
            />
          </div>
        </div>

        {/* Bottom nav bar */}
        <div style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          padding: '14px 40px',
          backgroundColor: 'rgba(250, 249, 246, 0.95)',
          backdropFilter: 'blur(12px)',
          borderTop: `1px solid ${colors.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          zIndex: 100,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {builder.step > 1 && (
              <button
                onClick={handlePrev}
                style={secondaryBtnStyle}
              >
                {'\u2190'} Previous
              </button>
            )}

            {isAtCap && (
              <span style={{
                fontSize: 11,
                fontFamily: fonts.sans,
                color: colors.warning,
              }}>
                Roster full ({maxAgents}/{maxAgents})
              </span>
            )}
          </div>

          <button
            onClick={handleNext}
            disabled={nextDisabled || isAtCap}
            style={{
              ...primaryBtnStyle,
              opacity: (nextDisabled || isAtCap) ? 0.4 : 1,
              cursor: (nextDisabled || isAtCap) ? 'not-allowed' : 'pointer',
            }}
          >
            {nextLabel} {builder.step < 3 ? '\u2192' : '\u2728'}
          </button>
        </div>
      </div>

      {/* Reveal overlay */}
      <AnimatePresence>
        {showReveal && revealProfile && (
          <CardRevealOverlay
            profile={revealProfile}
            ovr={builder.ovr}
            costTier={builder.costTier}
            billingRate={builder.billingRate}
            onSave={handleSave}
            onBuildAnother={handleBuildAnother}
            onClose={handleCloseReveal}
          />
        )}
      </AnimatePresence>
    </>
  );
}

const primaryBtnStyle: React.CSSProperties = {
  padding: '10px 28px',
  fontSize: 14,
  fontFamily: fonts.sans,
  fontWeight: 600,
  color: '#fff',
  backgroundColor: colors.text,
  border: 'none',
  borderRadius: radii.md,
  transition: 'opacity 0.2s',
};

const secondaryBtnStyle: React.CSSProperties = {
  padding: '10px 20px',
  fontSize: 13,
  fontFamily: fonts.sans,
  fontWeight: 500,
  color: colors.textSecondary,
  backgroundColor: 'transparent',
  border: `1px solid ${colors.border}`,
  borderRadius: radii.md,
  cursor: 'pointer',
  transition: 'background-color 0.15s',
};
