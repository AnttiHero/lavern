/**
 * LiveCardPreview — Right-side live card preview with OVR badge.
 *
 * Reuses existing AgentCard + AgentCardBack + SkillRadar components.
 * Shows a larger card (280×440) with an OVR overlay badge.
 * Click to flip between front and back.
 */

import { useState, useCallback } from 'react';
import { motion } from 'motion/react';
import { AgentCard } from '../../staffing/components/AgentCard.js';
import { AgentCardBack } from '../../staffing/components/AgentCardBack.js';
import { colors, fonts, radii, tierColor, tierBg } from '../../staffing/styles/tokens.js';
import type { AgentProfile } from '../../types/agent-profile.js';
import type { CostTier } from '../../types/agent-profile.js';

interface Props {
  profile: AgentProfile;
  ovr: number;
  costTier: CostTier;
}

export function LiveCardPreview({ profile, ovr, costTier }: Props) {
  const [isFlipped, setIsFlipped] = useState(false);

  const handleFlip = useCallback(() => {
    setIsFlipped(f => !f);
  }, []);

  const tColor = tierColor(costTier);
  const tBg = tierBg(costTier);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 12,
    }}>
      {/* Flip hint */}
      <div style={{
        fontSize: 10,
        fontFamily: fonts.sans,
        color: colors.textDim,
        letterSpacing: 0.5,
      }}>
        Click card to flip
      </div>

      {/* Card container */}
      <div
        style={{
          width: 260,
          height: 420,
          perspective: 1000,
          cursor: 'pointer',
        }}
        onClick={handleFlip}
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
          <div style={{
            ...faceBase,
            backfaceVisibility: 'hidden',
          }}>
            <AgentCard profile={profile} selected={false} hideSeniorityBadge />

            {/* OVR badge overlay */}
            <div style={{
              position: 'absolute',
              top: 8,
              right: 8,
              backgroundColor: tBg,
              border: `1px solid ${tColor}`,
              borderRadius: radii.md,
              padding: '2px 8px',
              display: 'flex',
              alignItems: 'baseline',
              gap: 3,
            }}>
              <span style={{
                fontSize: 18,
                fontFamily: fonts.sans,
                fontWeight: 800,
                color: tColor,
              }}>
                {ovr}
              </span>
              <span style={{
                fontSize: 8,
                fontFamily: fonts.sans,
                fontWeight: 500,
                color: tColor,
                textTransform: 'uppercase',
              }}>
                OVR
              </span>
            </div>
          </div>

          {/* Back face */}
          <div style={{
            ...faceBase,
            backfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
          }}>
            <AgentCardBack profile={profile} />
          </div>
        </motion.div>
      </div>

      {/* Status line */}
      <div style={{
        fontSize: 11,
        fontFamily: fonts.sans,
        color: colors.textMuted,
        textAlign: 'center',
      }}>
        {profile.displayName || 'Unnamed Agent'} &middot;{' '}
        <span style={{ color: tColor, fontWeight: 600, textTransform: 'capitalize' }}>
          {costTier}
        </span>{' '}
        &middot; ${profile.billingRateUsd}/hr
      </div>
    </div>
  );
}

const faceBase: React.CSSProperties = {
  position: 'absolute',
  width: '100%',
  height: '100%',
  borderRadius: radii.lg,
  backgroundColor: colors.bgCard,
  border: `1px solid ${colors.border}`,
  boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
  overflow: 'hidden',
};
