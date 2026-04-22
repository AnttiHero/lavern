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
  /** Hide the seniority badge in the top-right corner. Used by LiveCardPreview
   *  where an OVR badge sits in that slot instead. */
  hideSeniorityBadge?: boolean;
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

export function AgentCard({ profile, selected, hideSeniorityBadge }: Props) {
  const [imgError, setImgError] = useState(false);
  const catColor = categoryColor(profile.category);

  return (
    <div style={{
      width: '100%',
      height: '100%',
      padding: '14px 14px 40px 14px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 0,
      minHeight: 0,
      overflow: 'hidden',
    }}>
      {/* Top badges row */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        width: '100%',
        alignItems: 'center',
        marginBottom: 10,
      }}>
        <CostTierBadge tier={profile.costTier} />
        {hideSeniorityBadge ? <span /> : <SeniorityBadge seniority={profile.seniority} />}
      </div>

      {/* Avatar */}
      <div style={{
        width: 80,
        height: 80,
        borderRadius: '50%',
        overflow: 'hidden',
        border: `2px solid ${selected ? colors.text : colors.border}`,
        backgroundColor: colors.bgPanel,
        flexShrink: 0,
        transition: 'border-color 0.2s ease',
        marginBottom: 10,
      }}>
        {imgError ? (
          <Initials name={profile.displayName} />
        ) : (
          <img
            src={avatarUrl(profile.displayName, profile.avatarExtra)}
            alt={profile.displayName}
            width={80}
            height={80}
            onError={() => setImgError(true)}
            style={{ display: 'block' }}
          />
        )}
      </div>

      {/* Name */}
      <div style={{
        fontSize: 14,
        fontFamily: fonts.serif,
        fontWeight: 500,
        color: colors.text,
        textAlign: 'center',
        lineHeight: 1.2,
        marginBottom: 4,
        maxWidth: '100%',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical',
        flexShrink: 0,
      }}>
        {profile.displayName}
      </div>

      {/* Tagline */}
      <div style={{
        fontSize: 10,
        fontFamily: fonts.sans,
        color: colors.textMuted,
        textAlign: 'center',
        lineHeight: 1.45,
        maxWidth: '90%',
        marginBottom: 10,
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
        flexShrink: 0,
      }}>
        {profile.tagline}
      </div>

      {/* Radar chart */}
      <div style={{ flexShrink: 0 }}>
        <SkillRadar skills={profile.skills} costTier={profile.costTier} size={120} />
      </div>

      {/* Practice area tags */}
      {profile.practiceAreas.length > 0 && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'center',
          marginTop: 10, width: '100%',
        }}>
          {profile.practiceAreas.slice(0, 2).map(area => (
            <span key={area} style={{
              fontSize: 8.5,
              fontFamily: fonts.sans,
              fontWeight: 500,
              color: catColor,
              backgroundColor: `${catColor}0D`,
              border: `1px solid ${catColor}22`,
              borderRadius: radii.pill,
              padding: '2px 8px',
              whiteSpace: 'nowrap',
            }}>{area}</span>
          ))}
        </div>
      )}

      {/* Bottom info */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        width: '100%',
        marginTop: 'auto',
        paddingTop: 10,
        borderTop: `1px solid ${colors.border}`,
      }}>
        <span style={{
          fontSize: 15,
          fontFamily: fonts.serif,
          fontWeight: 400,
          color: colors.text,
        }}>
          ${profile.billingRateUsd.toLocaleString()}<span style={{ fontSize: 10, fontFamily: fonts.sans, color: colors.textMuted, marginLeft: 1 }}>/hr</span>
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {!profile.optional && (
            <span style={{ fontSize: 8.5, fontFamily: fonts.sans, fontWeight: 600, color: colors.accent }}>Required</span>
          )}
          <span style={{
            fontSize: 9,
            fontFamily: fonts.sans,
            fontWeight: 500,
            color: catColor,
            textTransform: 'capitalize',
          }}>
            {profile.category}
          </span>
        </div>
      </div>
    </div>
  );
}
