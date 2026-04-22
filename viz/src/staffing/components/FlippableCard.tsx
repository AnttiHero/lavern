/**
 * FlippableCard — Container with flip animation, hover lift, selection ring.
 *
 * Click → flip to back. Click again → flip to front.
 * Separate click target for "select/deselect" vs "flip".
 *
 * Warm editorial design — paper card on ivory background.
 */

import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AgentCard } from './AgentCard.js';
import { AgentCardBack } from './AgentCardBack.js';
import { colors, radii } from '../styles/tokens.js';
import { injectHolographicStyles } from '../styles/holographic.js';
import type { AgentProfile } from '../hooks/useAgentProfiles.js';

interface Props {
  profile: AgentProfile;
  selected: boolean;
  onToggle: (role: string) => void;
  onFlipSound?: () => void;
  onSelectSound?: () => void;
}

export function FlippableCard({ profile, selected, onToggle, onFlipSound, onSelectSound }: Props) {
  const [isFlipped, setIsFlipped] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    injectHolographicStyles();
  }, []);

  const handleFlip = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsFlipped(f => !f);
    onFlipSound?.();
  }, [onFlipSound]);

  const handleSelect = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onToggle(profile.role);
    onSelectSound?.();
  }, [onToggle, profile.role, onSelectSound]);

  return (
    <motion.div
      style={{
        width: 220,
        height: 460,
        perspective: 1000,
        cursor: 'pointer',
      }}
      variants={{
        hidden: { opacity: 0, y: 20, scale: 0.95 },
        visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } },
      }}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
    >
      <motion.div
        style={{
          width: '100%',
          height: '100%',
          position: 'relative',
          transformStyle: 'preserve-3d',
        }}
        animate={{ rotateY: isFlipped ? 180 : 0 }}
        transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
      >
        {/* Front face */}
        <div
          style={{
            ...faceBase,
            backfaceVisibility: 'hidden',
            border: `1px solid ${selected ? colors.text : isHovered ? colors.borderHover : colors.border}`,
            boxShadow: selected
              ? `0 0 0 1px ${colors.text}, 0 2px 8px rgba(0,0,0,0.06)`
              : isHovered
                ? '0 4px 16px rgba(0,0,0,0.08)'
                : '0 1px 4px rgba(0,0,0,0.04)',
          }}
          onClick={handleFlip}
        >
          <AgentCard profile={profile} selected={selected} />

          {/* Subtle light sweep on hover */}
          {isHovered && !selected && (
            <div style={{
              position: 'absolute',
              inset: 0,
              borderRadius: radii.lg,
              background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0) 35%, rgba(255,255,255,0.5) 50%, rgba(255,255,255,0) 65%, transparent 100%)',
              backgroundSize: '200% 100%',
              animation: 'holoShimmer 1s ease-in-out',
              animationIterationCount: '1',
              pointerEvents: 'none',
            }} />
          )}

          {/* Select button */}
          <button
            style={{
              position: 'absolute',
              bottom: 10,
              right: 10,
              width: 28,
              height: 28,
              borderRadius: '50%',
              border: `1.5px solid ${selected ? colors.text : colors.border}`,
              backgroundColor: selected ? colors.text : 'rgba(255,255,255,0.8)',
              color: selected ? '#fff' : colors.textMuted,
              fontSize: 14,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background-color 0.25s ease, color 0.25s ease, border-color 0.25s ease',
              backdropFilter: 'blur(4px)',
            }}
            onClick={handleSelect}
            title={selected ? 'Remove from team' : 'Add to team'}
          >
            {selected ? '\u2713' : '+'}
          </button>
        </div>

        {/* Back face */}
        <div
          style={{
            ...faceBase,
            backfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
            border: `1px solid ${selected ? colors.text : colors.border}`,
            boxShadow: selected
              ? `0 0 0 1px ${colors.text}, 0 2px 8px rgba(0,0,0,0.06)`
              : '0 1px 4px rgba(0,0,0,0.04)',
          }}
          onClick={handleFlip}
        >
          <AgentCardBack profile={profile} />
        </div>
      </motion.div>
    </motion.div>
  );
}

const faceBase: React.CSSProperties = {
  position: 'absolute',
  width: '100%',
  height: '100%',
  borderRadius: radii.lg,
  backgroundColor: colors.bgCard,
  overflow: 'hidden',
  transition: 'border-color 0.2s ease, box-shadow 0.3s ease',
};
