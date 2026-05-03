/**
 * AgentBuilderView — NBA2K-style custom agent creator.
 *
 * Three-step wizard with a 60/40 split layout:
 *   Left (60%):  Wizard steps (Identity → Face → Stats)
 *   Right (40%): Persistent live card preview
 *
 * On "Forge", a full-screen card reveal animation plays.
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
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
import { AgentBuilderHub } from './components/AgentBuilderHub.js';
import { colors, fonts, radii } from '../staffing/styles/tokens.js';
import type { AgentProfile } from '../types/agent-profile.js';

interface Props {
  onBack: () => void;
  editAgentId?: string;
}

export default function AgentBuilderView({ onBack, editAgentId }: Props) {
  const builder = useAgentBuilder();
  const { agents, addAgent, updateAgent, isAtCap, maxAgents } = useCustomAgents();
  const { play } = useSoundEffects();

  const [showReveal, setShowReveal] = useState(false);
  const [revealProfile, setRevealProfile] = useState<AgentProfile | null>(null);
  // Tracks whether the reveal was entered from the clone shortcut (so we can
  // offer a "Customise" button that returns the user to the wizard).
  const [revealFromClone, setRevealFromClone] = useState(false);
  // OVR / tier / rate snapshot for the reveal — computed at open time so
  // we don't depend on builder state having flushed (especially important
  // for the reveal-first clone flow).
  const [revealOvr, setRevealOvr] = useState<number | null>(null);
  const [revealTier, setRevealTier] = useState<AgentProfile['costTier'] | null>(null);
  const [revealRate, setRevealRate] = useState<number | null>(null);
  const isEditing = !!editAgentId;
  // Hub is the default entry point for new agents. Edit mode skips straight
  // to the wizard. "Build from scratch" or "Clone" from the hub also switches
  // us into wizard view.
  const [mode, setMode] = useState<'hub' | 'wizard'>(isEditing ? 'wizard' : 'hub');

  // Pre-fill builder from saved agent when editing
  useEffect(() => {
    if (!editAgentId) return;
    const agent = agents.find(a => a.id === editAgentId);
    if (agent) {
      builder.loadFromProfile(agent.profile);
    }
  }, [editAgentId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Hub handlers ───────────────────────────────────────────────────────

  const handleBuildFromScratch = useCallback(() => {
    builder.reset();
    setMode('wizard');
    play('flip');
  }, [builder, play]);

  const handleCloneComplete = useCallback((data: Parameters<typeof builder.loadFromCloneData>[0]) => {
    builder.loadFromCloneData(data);
    // Jump straight to the card reveal — it's the payoff moment. The user
    // can save as-is or hit "Customise" to drop into the 3-step wizard.
    const { profile, ovr, costTier, billingRate } = builder.buildProfileFromCloneData(data);
    setRevealProfile(profile);
    setRevealOvr(ovr);
    setRevealTier(costTier);
    setRevealRate(billingRate);
    setRevealFromClone(true);
    setShowReveal(true);
    play('confirm');
  }, [builder, play]);

  const handleFirmCloneComplete = useCallback((profiles: AgentProfile[], firmName: string) => {
    // Bulk-save every profile returned from the firm clone. Each addAgent
    // call generates its own `role` id, so we don't reuse the empty placeholder.
    for (const profile of profiles) {
      addAgent(profile, { kind: 'firm', firmName });
    }
    play('confirm');
    // Stash a flash-message hint that the Team view (or My Page) can show.
    try {
      sessionStorage.setItem('shem-firm-clone-flash', JSON.stringify({
        firmName,
        count: profiles.length,
        at: Date.now(),
      }));
    } catch { /* ignore quota */ }
    // Navigate to team so the user sees the new roster immediately.
    window.location.hash = '#/team';
  }, [addAgent, play]);

  const handleCustomiseFromReveal = useCallback(() => {
    // From the reveal: close and drop the user into the wizard with the
    // already-loaded state. Clear reveal state so a later Forge doesn't
    // carry the clone flag over.
    setShowReveal(false);
    setRevealFromClone(false);
    setMode('wizard');
    play('flip');
  }, [play]);

  // Build a preview profile for the live card
  const previewProfile = useMemo(() => builder.buildProfile(), [builder]);

  // ── Navigation ─────────────────────────────────────────────────────────

  const handleNext = useCallback(() => {
    if (builder.step === 3) {
      // Step 3 → Forge! Show the reveal
      const profile = builder.buildProfile();
      setRevealProfile(profile);
      setRevealOvr(builder.ovr);
      setRevealTier(builder.costTier);
      setRevealRate(builder.billingRate);
      setRevealFromClone(false);
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
    if (isEditing && editAgentId) {
      updateAgent(editAgentId, revealProfile);
    } else {
      // Track provenance: clone-from-profile = self-clone, otherwise = from-scratch
      addAgent(revealProfile, { kind: revealFromClone ? 'self' : 'scratch' });
    }
    play('confirm');
    setShowReveal(false);
    // Navigate to team to see the agent
    window.location.hash = '#/team';
  }, [revealProfile, addAgent, updateAgent, play, isEditing, editAgentId, revealFromClone]);

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

  const nextLabel = builder.step === 3 ? (isEditing ? 'Update Agent' : 'Forge Agent') : 'Next';
  const nextDisabled = builder.step === 3 ? !builder.isValid : (builder.step === 1 && !builder.isValid);

  // Reveal overlay element — rendered in both hub and wizard modes so the
  // clone-straight-to-reveal flow works from the hub.
  const revealEl = (
    <AnimatePresence>
      {showReveal && revealProfile && (
        <CardRevealOverlay
          profile={revealProfile}
          ovr={revealOvr ?? builder.ovr}
          costTier={revealTier ?? builder.costTier}
          billingRate={revealRate ?? builder.billingRate}
          onSave={handleSave}
          onBuildAnother={handleBuildAnother}
          onClose={handleCloseReveal}
          onCustomise={revealFromClone ? handleCustomiseFromReveal : undefined}
          saveLabel={revealFromClone ? 'Save agent' : undefined}
        />
      )}
    </AnimatePresence>
  );

  // Show hub first for new-agent creation; edit mode and after-selection go to wizard
  if (mode === 'hub' && !isEditing) {
    return (
      <>
      <div style={{
        width: '100%',
        minHeight: '100vh',
        backgroundColor: colors.bg,
        display: 'flex',
        flexDirection: 'column',
      }}>
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
          <div style={{ width: 60 }} />
        </div>
        <AgentBuilderHub
          onBuildFromScratch={handleBuildFromScratch}
          onCloneComplete={handleCloneComplete}
          onFirmCloneComplete={handleFirmCloneComplete}
        />
      </div>
      {revealEl}
      </>
    );
  }

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
            {isEditing ? 'Edit Agent' : 'Agent Builder'}
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

      {revealEl}
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
