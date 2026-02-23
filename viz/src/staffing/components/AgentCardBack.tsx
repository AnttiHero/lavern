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
      }}>
        Personality
      </div>

      {/* Personality bars */}
      {Object.keys(traits).length > 0 ? (
        <PersonalityBars traits={traits} />
      ) : (
        <div style={{ fontSize: 11, color: colors.textDim, textAlign: 'center' }}>
          No trait data
        </div>
      )}

      {/* Practice Areas */}
      <div>
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
      <div style={{ overflow: 'hidden' }}>
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
            lineHeight: '14px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {'\u2713'} {s}
          </div>
        ))}
      </div>

      {/* Limitations */}
      <div style={{ overflow: 'hidden' }}>
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
            lineHeight: '14px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {'\u26A0'} {l}
          </div>
        ))}
      </div>

      {/* Work style (truncated) */}
      <div style={{
        fontSize: 10,
        fontFamily: fonts.sans,
        fontStyle: 'italic',
        color: colors.textDim,
        lineHeight: '14px',
        marginTop: 'auto',
        overflow: 'hidden',
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical',
      }}>
        &ldquo;{profile.personality.workStyle}&rdquo;
      </div>
    </div>
  );
}
