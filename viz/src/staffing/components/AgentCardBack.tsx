/**
 * AgentCardBack — Back face of an agent card.
 *
 * Shows: personality bars, practice areas, strengths, limitations, workStyle.
 * Warm editorial design — Inter font, warm tones.
 */

import { PersonalityBars } from './PersonalityBars.js';
import { colors, fonts, radii } from '../styles/tokens.js';
import type { AgentProfile } from '../hooks/useAgentProfiles.js';

interface Props {
  profile: AgentProfile;
}

export function AgentCardBack({ profile }: Props) {
  const traits = profile.personality.traits ?? {};

  return (
    <div style={{
      width: '100%',
      height: '100%',
      padding: 16,
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        fontSize: 11,
        fontFamily: fonts.sans,
        fontWeight: 600,
        color: colors.text,
        letterSpacing: 1,
        textAlign: 'center',
        textTransform: 'uppercase',
        flexShrink: 0,
      }}>
        Personality
      </div>

      {/* Personality bars */}
      <div style={{ flexShrink: 0 }}>
        {Object.keys(traits).length > 0 ? (
          <PersonalityBars traits={traits} />
        ) : (
          <div style={{ fontSize: 11, color: colors.textDim, textAlign: 'center' }}>
            No trait data
          </div>
        )}
      </div>

      {/* Practice Areas */}
      <div style={{ flexShrink: 0 }}>
        <div style={{
          fontSize: 10,
          fontFamily: fonts.sans,
          fontWeight: 500,
          color: colors.textMuted,
          marginBottom: 4,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        }}>
          Practice Areas
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {profile.practiceAreas.slice(0, 3).map(pa => (
            <span key={pa} style={{
              fontSize: 9,
              fontFamily: fonts.sans,
              color: colors.textSecondary,
              backgroundColor: colors.bgPanel,
              padding: '2px 6px',
              borderRadius: radii.sm,
            }}>
              {pa}
            </span>
          ))}
        </div>
      </div>

      {/* Strengths */}
      <div style={{ flexShrink: 0 }}>
        <div style={{
          fontSize: 10,
          fontFamily: fonts.sans,
          fontWeight: 500,
          color: colors.success,
          marginBottom: 3,
        }}>
          Strengths
        </div>
        {profile.strengths.slice(0, 2).map(s => (
          <div key={s} style={{
            fontSize: 10,
            fontFamily: fonts.sans,
            color: colors.textSecondary,
            lineHeight: 1.35,
            marginBottom: 2,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}>
            {'\u2713'} {s}
          </div>
        ))}
      </div>

      {/* Limitations */}
      <div style={{ flexShrink: 0 }}>
        <div style={{
          fontSize: 10,
          fontFamily: fonts.sans,
          fontWeight: 500,
          color: colors.warning,
          marginBottom: 3,
        }}>
          Limitations
        </div>
        {profile.limitations.slice(0, 1).map(l => (
          <div key={l} style={{
            fontSize: 10,
            fontFamily: fonts.sans,
            color: colors.textMuted,
            lineHeight: 1.35,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}>
            {'\u26A0'} {l}
          </div>
        ))}
      </div>

      {/* Work style (quote, bottom-anchored) */}
      <div style={{
        fontSize: 10,
        fontFamily: fonts.sans,
        fontStyle: 'italic',
        color: colors.textDim,
        lineHeight: 1.4,
        marginTop: 'auto',
        paddingTop: 8,
        borderTop: `1px solid ${colors.border}`,
        display: '-webkit-box',
        WebkitLineClamp: 3,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
        flexShrink: 0,
      }}>
        &ldquo;{profile.personality.workStyle}&rdquo;
      </div>
    </div>
  );
}
