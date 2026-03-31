/**
 * CardRevealOverlay — Full-screen "pack opening" reveal animation.
 *
 * Sequence:
 *   1. Screen dims to dark overlay
 *   2. Card appears face-down (dark back with marble "W" embossed)
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
}

type Phase = 'entering' | 'faceDown' | 'glowing' | 'flipping' | 'revealed' | 'complete';

export function CardRevealOverlay({
  profile, ovr, costTier, billingRate,
  onSave, onBuildAnother, onClose,
}: Props) {
  const [phase, setPhase] = useState<Phase>('entering');
  const [showFlash, setShowFlash] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const audioRef = useRef<AudioContext | null>(null);

  // Play ascending reveal tone
  const playRevealSound = useCallback(() => {
    try {
      if (!audioRef.current) {
        audioRef.current = new AudioContext();
      }
      const ctx = audioRef.current;
      if (ctx.state === 'suspended') ctx.resume();

      // Ascending arpeggio
      const notes = [440, 554, 659, 880];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = 'sine';
        const t = ctx.currentTime + i * 0.12;
        gain.gain.setValueAtTime(0.06, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        osc.start(t);
        osc.stop(t + 0.3);
      });
    } catch {
      // Audio not available
    }
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
        gap: 24,
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
                {/* Embossed M */}
                <div style={{
                  fontSize: 80,
                  fontFamily: fonts.serif,
                  fontWeight: 700,
                  color: 'rgba(255,255,255,0.06)',
                  textShadow: '0 2px 4px rgba(0,0,0,0.3)',
                  userSelect: 'none',
                }}>
                  W
                </div>
                {/* Texture lines */}
                <div style={{
                  position: 'absolute',
                  inset: 16,
                  border: '1px solid rgba(255,255,255,0.04)',
                  borderRadius: radii.md,
                }} />
              </div>

              {/* Card front (revealed) — note transform rotateY(180deg) */}
              <div style={{
                position: 'absolute',
                width: '100%',
                height: '100%',
                borderRadius: radii.lg,
                backfaceVisibility: 'hidden',
                transform: 'rotateY(180deg)',
                backgroundColor: colors.bgCard,
                border: `1px solid ${colors.border}`,
                overflow: 'hidden',
                boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
              }}>
                <AgentCard profile={profile} selected={false} />
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

      {/* Action buttons */}
      <AnimatePresence>
        {showButtons && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
            style={{
              display: 'flex',
              gap: 12,
            }}
          >
            <button
              onClick={onSave}
              style={{
                padding: '12px 28px',
                fontSize: 14,
                fontFamily: fonts.sans,
                fontWeight: 600,
                color: '#fff',
                backgroundColor: colors.text,
                border: 'none',
                borderRadius: radii.md,
                cursor: 'pointer',
                transition: 'opacity 0.2s',
              }}
            >
              Save to Roster
            </button>
            <button
              onClick={onBuildAnother}
              style={{
                padding: '12px 28px',
                fontSize: 14,
                fontFamily: fonts.sans,
                fontWeight: 600,
                color: 'rgba(255,255,255,0.7)',
                backgroundColor: 'transparent',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: radii.md,
                cursor: 'pointer',
                transition: 'color 0.2s',
              }}
            >
              Build Another
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
