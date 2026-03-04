/**
 * AgentAvatar — Reusable DiceBear Notionists avatar for the working view.
 *
 * Renders a circular avatar with category-color border. Falls back to
 * initials if no profile or image load error occurs.
 *
 * Sizes: sm (24px, for orbs), md (32px, for feed cards), lg (40px, for thinking bubbles).
 */

import { useState } from 'react';
import type { AgentProfile } from '../../staffing/hooks/useAgentProfiles.js';
import { categoryColor, colors, fonts } from '../../staffing/styles/tokens.js';

type AvatarSize = 'sm' | 'md' | 'lg';

interface AgentAvatarProps {
  role: string;
  size?: AvatarSize;
  profile?: AgentProfile;
  showArchetype?: boolean;
}

const SIZE_PX: Record<AvatarSize, number> = { sm: 24, md: 32, lg: 40 };

function avatarUrl(seed: string, extra?: string): string {
  const base = `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(seed)}&backgroundColor=transparent`;
  return extra ? `${base}&${extra}` : base;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export function AgentAvatar({ role, size = 'md', profile, showArchetype }: AgentAvatarProps) {
  const [imgError, setImgError] = useState(false);
  const px = SIZE_PX[size];
  const color = profile ? categoryColor(profile.category) : colors.textMuted;
  const displayName = profile?.displayName ?? role.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const initials = getInitials(displayName);

  const containerStyle: React.CSSProperties = {
    display: 'inline-flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
    flexShrink: 0,
  };

  const circleStyle: React.CSSProperties = {
    width: px,
    height: px,
    borderRadius: '50%',
    border: `2px solid ${color}`,
    overflow: 'hidden',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgPanel,
  };

  const initialsStyle: React.CSSProperties = {
    fontSize: px * 0.36,
    fontFamily: fonts.sans,
    fontWeight: 600,
    color,
    lineHeight: 1,
    userSelect: 'none',
  };

  return (
    <div style={containerStyle}>
      <div style={circleStyle}>
        {profile && !imgError ? (
          <img
            src={avatarUrl(profile.displayName, profile.avatarExtra)}
            alt={displayName}
            width={px - 4}
            height={px - 4}
            style={{ borderRadius: '50%', display: 'block' }}
            onError={() => setImgError(true)}
          />
        ) : (
          <span style={initialsStyle}>{initials}</span>
        )}
      </div>
      {showArchetype && profile?.personality?.archetype && (
        <span style={{
          fontSize: 9,
          fontFamily: fonts.serif,
          fontStyle: 'italic',
          color: colors.textDim,
          lineHeight: 1,
          whiteSpace: 'nowrap',
        }}>
          {profile.personality.archetype}
        </span>
      )}
    </div>
  );
}
