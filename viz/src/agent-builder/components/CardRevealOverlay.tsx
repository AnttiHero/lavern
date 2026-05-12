/**
 * CardRevealOverlay — Full-screen "pack opening" reveal animation.
 *
 * Sequence:
 *   1. Screen dims to dark overlay
 *   2. Card appears face-down (dark back with marble "L" embossed)
 *   3. 1.5s pause — light rays emanate from card edges
 *   4. 3D flip reveals the full card
 *   5. Flash of light at flip apex
 *   6. OVR number counts up 0 → final
 *   7. Confetti burst
 *   8. "Save to Roster" + "Build Another" buttons
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AgentCard } from '../../staffing/components/AgentCard.js';
import { OverallRating } from './OverallRating.js';
import { colors, fonts, radii, tierColor } from '../../staffing/styles/tokens.js';
import type { AgentProfile } from '../../types/agent-profile.js';
import type { CostTier } from '../../types/agent-profile.js';

interface Props {
  profile: AgentProfile;
  ovr: number;
  costTier: CostTier;
  billingRate: number;
  onSave: () => void;
  onBuildAnother: () => void;
  onClose: () => void;
  /** Optional "Customise" secondary CTA. Shown when set — used by the
   *  Clone flow where users land on the reveal first and may want to
   *  tweak the agent before saving. */
  onCustomise?: () => void;
  /** Override primary button label. */
  saveLabel?: string;
}

type Phase = 'entering' | 'faceDown' | 'glowing' | 'flipping' | 'revealed' | 'complete';

export function CardRevealOverlay({
  profile, ovr, costTier, billingRate,
  onSave, onBuildAnother, onClose, onCustomise, saveLabel,
}: Props) {
  const [phase, setPhase] = useState<Phase>('entering');
  const [showFlash, setShowFlash] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [cardStatsVisible, setCardStatsVisible] = useState(false);
  const audioRef = useRef<AudioContext | null>(null);
  const isRevealed = phase === 'revealed' || phase === 'complete';

  const playRevealSound = useCallback(() => {
    // Sound removed
  }, []);

  // Phase sequencing
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];

    // entering → faceDown (0.6s)
    timers.push(setTimeout(() => setPhase('faceDown'), 600));

    // faceDown → glowing (1.5s)
    timers.push(setTimeout(() => setPhase('glowing'), 2100));

    // glowing → flipping (1s)
    timers.push(setTimeout(() => {
      setPhase('flipping');
      playRevealSound();
    }, 3100));

    // Flash at flip midpoint
    timers.push(setTimeout(() => {
      setShowFlash(true);
      setTimeout(() => setShowFlash(false), 300);
    }, 3350));

    // flipping → revealed (0.6s)
    timers.push(setTimeout(() => setPhase('revealed'), 3700));

    // revealed → complete (1.2s for OVR count-up + confetti)
    timers.push(setTimeout(() => {
      setPhase('complete');
      setShowConfetti(true);
    }, 4900));

    return () => timers.forEach(clearTimeout);
  }, [playRevealSound]);

  const isCardVisible = phase !== 'entering';
  const isFlipped = phase === 'flipping' || phase === 'revealed' || phase === 'complete';
  const showGlow = phase === 'glowing' || phase === 'flipping';
  const showOVR = phase === 'revealed' || phase === 'complete';
  const showButtons = phase === 'complete';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        backgroundColor: 'rgba(10, 10, 10, 0.92)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 20,
        paddingBottom: 80,
        backdropFilter: 'blur(12px)',
      }}
      onClick={showButtons ? undefined : undefined}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        style={{
          position: 'absolute',
          top: 20,
          right: 20,
          width: 36,
          height: 36,
          border: '1px solid rgba(255,255,255,0.2)',
          borderRadius: '50%',
          backgroundColor: 'transparent',
          color: 'rgba(255,255,255,0.5)',
          fontSize: 18,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {'\u00D7'}
      </button>

      {/* Light flash */}
      <AnimatePresence>
        {showFlash && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: 'rgba(255, 255, 255, 0.4)',
              pointerEvents: 'none',
              zIndex: 10001,
            }}
          />
        )}
      </AnimatePresence>

      {/* Card */}
      <AnimatePresence>
        {isCardVisible && (
          <motion.div
            initial={{ opacity: 0, scale: 0.7, y: 40 }}
            animate={{
              opacity: 1,
              scale: 1,
              y: 0,
            }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            style={{
              width: 280,
              height: 440,
              perspective: 1200,
              position: 'relative',
            }}
          >
            {/* Glow rays */}
            {showGlow && (
              <div style={{
                position: 'absolute',
                inset: -30,
                borderRadius: radii.xl,
                background: `radial-gradient(ellipse at center, rgba(255,215,100,0.3) 0%, transparent 70%)`,
                animation: 'revealPulse 1s ease-in-out infinite',
                pointerEvents: 'none',
                zIndex: 1,
              }} />
            )}

            <motion.div
              style={{
                width: '100%',
                height: '100%',
                position: 'relative',
                transformStyle: 'preserve-3d',
              }}
              animate={{ rotateY: isFlipped ? 180 : 0 }}
              transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
            >
              {/* Card back (face-down) */}
              <div style={{
                position: 'absolute',
                width: '100%',
                height: '100%',
                borderRadius: radii.lg,
                backfaceVisibility: 'hidden',
                background: 'linear-gradient(135deg, #1A1A1A 0%, #2A2A2A 50%, #1A1A1A 100%)',
                border: '1px solid rgba(255,255,255,0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
              }}>
                {/* Embossed L */}
                <div style={{
                  fontSize: 80,
                  fontFamily: fonts.serif,
                  fontWeight: 700,
                  color: 'rgba(255,255,255,0.06)',
                  textShadow: '0 2px 4px rgba(0,0,0,0.3)',
                  userSelect: 'none',
                }}>
                  L
                </div>
                {/* Texture lines */}
                <div style={{
                  position: 'absolute',
                  inset: 16,
                  border: '1px solid rgba(255,255,255,0.04)',
                  borderRadius: radii.md,
                }} />
              </div>

              {/* Card front (revealed) — click to 3D-flip to stats */}
              <div
                onClick={() => { if (isRevealed) setCardStatsVisible(v => !v); }}
                style={{
                  position: 'absolute',
                  width: '100%',
                  height: '100%',
                  borderRadius: radii.lg,
                  backfaceVisibility: 'hidden',
                  transform: 'rotateY(180deg)',
                  boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
                  cursor: isRevealed ? 'pointer' : 'default',
                  // No overflow:hidden — would flatten preserve-3d children below
                }}>
                {/* Independent perspective for inner stats flip */}
                <div style={{ width: '100%', height: '100%', perspective: '700px' }}>
                  <div style={{
                    width: '100%', height: '100%',
                    position: 'relative',
                    transformStyle: 'preserve-3d',
                    transform: cardStatsVisible ? 'rotateY(180deg)' : 'rotateY(0deg)',
                    transition: 'transform 0.52s cubic-bezier(0.4, 0, 0.2, 1)',
                  }}>
                    {/* Face A — AgentCard */}
                    <div style={{
                      position: 'absolute', inset: 0,
                      backfaceVisibility: 'hidden',
                      backgroundColor: colors.bgCard,
                      border: `1px solid ${colors.border}`,
                      borderRadius: radii.lg,
                      overflow: 'hidden',
                    }}>
                      <AgentCard profile={profile} selected={false} hideSeniorityBadge />
                    </div>

                    {/* Face B — Stats */}
                    <div style={{
                      position: 'absolute', inset: 0,
                      backfaceVisibility: 'hidden',
                      transform: 'rotateY(180deg)',
                      backgroundColor: colors.bgCard,
                      border: `1px solid ${colors.border}`,
                      borderRadius: radii.lg,
                      overflow: 'hidden',
                      padding: '28px 22px',
                      display: 'flex', flexDirection: 'column',
                    }}>
                      <div style={{ fontFamily: fonts.serif, fontSize: 18, color: colors.text, marginBottom: 5 }}>{profile.displayName}</div>
                      <div style={{ fontFamily: fonts.sans, fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', color: colors.textMuted, marginBottom: 24 }}>{profile.practiceAreas[0]}</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, flex: 1 }}>
                        {([
                          { l: 'Precision', v: profile.skills.precision, c: colors.sonnet },
                          { l: 'Depth',     v: profile.skills.depth,     c: colors.specialist },
                          { l: 'Risk',      v: profile.skills.risk,      c: colors.accent },
                          { l: 'Research',  v: profile.skills.research,  c: colors.success },
                        ] as { l: string; v: number; c: string }[]).map(s => (
                          <div key={s.l}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 7 }}>
                              <span style={{ fontFamily: fonts.sans, fontSize: 11, color: colors.textMuted }}>{s.l}</span>
                              <span style={{ fontFamily: fonts.serif, fontSize: 16, color: colors.text, lineHeight: 1 }}>{s.v}</span>
                            </div>
                            <div style={{ height: 4, borderRadius: 2, background: colors.bgInput, overflow: 'hidden' }}>
                              <div style={{
                                height: '100%', borderRadius: 2,
                                background: `linear-gradient(90deg, ${s.c}, ${s.c}80)`,
                                width: cardStatsVisible ? `${s.v * 10}%` : '0%',
                                transition: 'width 0.65s ease 0.22s',
                              }} />
                            </div>
                          </div>
                        ))}
                      </div>
                      <div style={{ paddingTop: 16, borderTop: `1px solid ${colors.border}`, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                        <span style={{ fontFamily: fonts.sans, fontSize: 8, letterSpacing: 2, textTransform: 'uppercase', color: colors.textMuted }}>OVR</span>
                        <span style={{ fontFamily: fonts.serif, fontSize: 52, color: colors.text, lineHeight: 1, fontWeight: 300 }}>{ovr}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* OVR counter + tier */}
      <AnimatePresence>
        {showOVR && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
          >
            <OverallRating
              ovr={ovr}
              costTier={costTier}
              billingRate={billingRate}
              animate={true}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Action button — single CTA */}
      <AnimatePresence>
        {showButtons && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
            style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 14, width: '100%', flexWrap: 'wrap' }}
          >
            {onCustomise && (
              <button
                onClick={onCustomise}
                style={{
                  display: 'block',
                  width: 'fit-content',
                  padding: '18px 36px',
                  fontSize: 11,
                  fontFamily: fonts.sans,
                  fontWeight: 600,
                  letterSpacing: 3,
                  textTransform: 'uppercase',
                  color: 'rgba(250,249,246,0.95)',
                  backgroundColor: 'transparent',
                  border: '1px solid rgba(250,249,246,0.45)',
                  borderRadius: 100,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'background-color 0.2s ease, border-color 0.2s ease',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.backgroundColor = 'rgba(250,249,246,0.08)';
                  e.currentTarget.style.borderColor = 'rgba(250,249,246,0.85)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.borderColor = 'rgba(250,249,246,0.45)';
                }}
              >
                Customise
              </button>
            )}
            <button
              onClick={onSave}
              style={{
                display: 'block',
                width: 'fit-content',
                padding: '18px 48px',
                fontSize: 11,
                fontFamily: fonts.sans,
                fontWeight: 600,
                letterSpacing: 3,
                textTransform: 'uppercase',
                color: '#080808',
                backgroundColor: 'rgba(250,249,246,0.95)',
                border: 'none',
                borderRadius: 100,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                boxShadow: '0 4px 30px rgba(0,0,0,0.4)',
                transition: 'transform 0.3s ease, box-shadow 0.3s ease',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 8px 40px rgba(0,0,0,0.5)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 30px rgba(0,0,0,0.4)';
              }}
            >
              {saveLabel ?? 'See the agents work'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confetti burst */}
      {showConfetti && (
        <div style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          overflow: 'hidden',
          zIndex: 10002,
        }}>
          {Array.from({ length: 40 }).map((_, i) => {
            const x = Math.random() * 100;
            const delay = Math.random() * 0.5;
            const size = 4 + Math.random() * 6;
            const hue = Math.random() * 360;
            const dur = 1.5 + Math.random() * 1;
            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: `${x}%`,
                  top: '45%',
                  width: size,
                  height: size * (0.5 + Math.random() * 0.8),
                  backgroundColor: `hsl(${hue}, 70%, 60%)`,
                  borderRadius: Math.random() > 0.5 ? '50%' : 1,
                  animation: `confettiFall ${dur}s ease-out ${delay}s forwards`,
                  opacity: 0,
                }}
              />
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
