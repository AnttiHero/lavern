/**
 * BenchAgent — Small avatar chip for the team bench.
 * Warm editorial tones.
 */

import { useState } from 'react';
import { motion } from 'motion/react';
import { colors, fonts, radii, tierColor } from '../styles/tokens.js';
import type { AgentProfile } from '../hooks/useAgentProfiles.js';

interface Props {
  profile: AgentProfile;
  onRemove: (role: string) => void;
}

function avatarUrl(seed: string, extra?: string): string {
  const base = `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(seed)}&backgroundColor=transparent&size=32`;
  return extra ? `${base}&${extra}` : base;
}

export function BenchAgent({ profile, onRemove }: Props) {
  const [hovered, setHovered] = useState(false);
  const [imgError, setImgError] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.7, x: -10 }}
      animate={{ opacity: 1, scale: 1, x: 0 }}
      exit={{ opacity: 0, scale: 0.7, x: 10 }}
      transition={{ duration: 0.2 }}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
        cursor: profile.optional ? 'pointer' : 'default',
      }}
      onClick={() => profile.optional && onRemove(profile.role)}
      title={`${profile.displayName} — ${profile.personality.archetype}${!profile.optional ? ' (required)' : ''}`}
    >
      {/* Avatar circle */}
      <div style={{
        width: 36,
        height: 36,
        borderRadius: '50%',
        overflow: 'hidden',
        border: `2px solid ${tierColor(profile.costTier)}`,
        backgroundColor: colors.bgPanel,
        transition: 'transform 0.15s ease',
        transform: hovered ? 'scale(1.1)' : 'scale(1)',
      }}>
        {imgError ? (
          <div style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 13,
            fontFamily: fonts.sans,
            fontWeight: 500,
            color: colors.textMuted,
          }}>
            {profile.displayName[0]}
          </div>
        ) : (
          <img
            src={avatarUrl(profile.displayName, profile.avatarExtra)}
            alt={profile.displayName}
            width={32}
            height={32}
            onError={() => setImgError(true)}
            style={{ display: 'block', width: '100%', height: '100%' }}
          />
        )}
      </div>

      {/* Name label */}
      <span style={{
        fontSize: 9,
        fontFamily: fonts.sans,
        color: colors.textMuted,
        maxWidth: 50,
        textAlign: 'center',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {profile.displayName.split(' ')[0]}
      </span>

      {/* Remove X on hover (only optional agents) */}
      {hovered && profile.optional && (
        <div style={{
          position: 'absolute',
          top: -2,
          right: -2,
          width: 14,
          height: 14,
          borderRadius: '50%',
          backgroundColor: colors.danger,
          color: '#fff',
          fontSize: 9,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 'bold',
        }}>
          {'\u00D7'}
        </div>
      )}
    </motion.div>
  );
}
