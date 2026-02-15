/**
 * AgentCard — Front face of an agent card.
 *
 * Shows: DiceBear avatar, display name, archetype, skill radar,
 * cost tier badge, seniority badge, billing rate.
 *
 * Warm editorial design — Inter font, paper-white card.
 * v2: Fixed overlaps — removed absolute checkmark, repositioned bottom row.
 */

import { useState } from 'react';
import { SkillRadar } from './SkillRadar.js';
import { CostTierBadge } from './CostTierBadge.js';
import { SeniorityBadge } from './SeniorityBadge.js';
import { colors, fonts, radii, categoryColor } from '../styles/tokens.js';
import type { AgentProfile } from '../hooks/useAgentProfiles.js';

interface Props {
  profile: AgentProfile;
  selected: boolean;
}

function avatarUrl(seed: string, extra?: string): string {
  const base = `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(seed)}&backgroundColor=transparent`;
  return extra ? `${base}&${extra}` : base;
}

function Initials({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div style={{
      width: 68,
      height: 68,
      borderRadius: '50%',
      backgroundColor: colors.bgPanel,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 20,
      fontFamily: fonts.sans,
      fontWeight: 600,
      color: colors.textMuted,
    }}>
      {initials}
    </div>
  );
}

export function AgentCard({ profile, selected }: Props) {
  const [imgError, setImgError] = useState(false);
  const catColor = categoryColor(profile.category);

  return (
    <div style={{
      width: '100%',
      height: '100%',
      padding: '14px 14px 40px 14px', // extra bottom padding for the select button
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 4,
    }}>
      {/* Top badges row */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        width: '100%',
        alignItems: 'center',
        marginBottom: 2,
      }}>
        <CostTierBadge tier={profile.costTier} />
        <SeniorityBadge seniority={profile.seniority} />
      </div>

      {/* Avatar */}
      <div style={{
        width: 68,
        height: 68,
        borderRadius: '50%',
        overflow: 'hidden',
        border: `2px solid ${selected ? colors.text : colors.border}`,
        backgroundColor: colors.bgPanel,
        flexShrink: 0,
        transition: 'border-color 0.2s ease',
      }}>
        {imgError ? (
          <Initials name={profile.displayName} />
        ) : (
          <img
            src={avatarUrl(profile.displayName, profile.avatarExtra)}
            alt={profile.displayName}
            width={68}
            height={68}
            onError={() => setImgError(true)}
            style={{ display: 'block' }}
          />
        )}
      </div>

      {/* Name */}
      <div style={{
        fontSize: 13,
        fontFamily: fonts.sans,
        fontWeight: 600,
        color: colors.text,
        textAlign: 'center',
        lineHeight: '16px',
        marginTop: 2,
        maxWidth: '100%',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical',
      }}>
        {profile.displayName}
      </div>

      {/* Archetype */}
      <div style={{
        fontSize: 10,
        fontFamily: fonts.sans,
        fontStyle: 'italic',
        color: catColor,
        textAlign: 'center',
        lineHeight: '13px',
        maxWidth: '100%',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {profile.personality.archetype}
      </div>

      {/* Radar chart — slightly smaller */}
      <SkillRadar skills={profile.skills} costTier={profile.costTier} size={120} />

      {/* Bottom info — billing rate, required badge, category */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        width: '100%',
        marginTop: 'auto',
        gap: 4,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{
            fontSize: 13,
            fontFamily: fonts.sans,
            fontWeight: 600,
            color: colors.text,
          }}>
            ${profile.billingRateUsd.toLocaleString()}/hr
          </span>
          {!profile.optional && (
            <span style={{
              fontSize: 9,
              fontFamily: fonts.sans,
              fontWeight: 500,
              color: colors.accent,
            }}>
              Required
            </span>
          )}
        </div>
        <span style={{
          fontSize: 10,
          fontFamily: fonts.sans,
          fontWeight: 500,
          color: catColor,
          textTransform: 'capitalize',
          flexShrink: 0,
        }}>
          {profile.category}
        </span>
      </div>
    </div>
  );
}
