/**
 * FaceBuilderStep — Step 2: DiceBear avatar customizer.
 *
 * Large avatar preview + seed input + 🎲 Randomize button.
 * Randomize picks random features internally; seed controls the base face.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { colors, fonts, radii } from '../../staffing/styles/tokens.js';
import { AVATAR_FEATURES, avatarUrl } from '../data/dicebear-variants.js';
import type { BuilderState } from '../hooks/useAgentBuilder.js';

interface Props {
  state: BuilderState;
  avatarExtra: string;
  onUpdateField: <K extends keyof BuilderState>(key: K, value: BuilderState[K]) => void;
  onUpdateAvatarFeature: (feature: string, variant: string | null) => void;
}

export function FaceBuilderStep({ state, avatarExtra, onUpdateField, onUpdateAvatarFeature }: Props) {
  const [imgError, setImgError] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);
  const spinTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup spin timer on unmount
  useEffect(() => {
    return () => {
      if (spinTimerRef.current) clearTimeout(spinTimerRef.current);
    };
  }, []);

  const fullUrl = avatarUrl(state.avatarSeed, avatarExtra || undefined);

  /** Randomize all features */
  const handleRandomize = useCallback(() => {
    setIsSpinning(true);

    // Random seed
    const words = ['Ace', 'Nova', 'Echo', 'Luna', 'Zara', 'Rex', 'Flux', 'Blaze', 'Ivy', 'Sage', 'Onyx', 'Riot', 'Dusk', 'Fern', 'Volt'];
    const randomSeed = words[Math.floor(Math.random() * words.length)] + ' ' +
                       words[Math.floor(Math.random() * words.length)] + ' ' +
                       Math.floor(Math.random() * 999);
    onUpdateField('avatarSeed', randomSeed);

    // Random features
    for (const feature of AVATAR_FEATURES) {
      if (feature.allowNone && Math.random() < 0.3) {
        onUpdateAvatarFeature(feature.key, null);
      } else {
        const randomVariant = feature.variants[Math.floor(Math.random() * feature.variants.length)];
        onUpdateAvatarFeature(feature.key, randomVariant);
      }
    }

    setImgError(false);
    if (spinTimerRef.current) clearTimeout(spinTimerRef.current);
    spinTimerRef.current = setTimeout(() => {
      spinTimerRef.current = null;
      setIsSpinning(false);
    }, 600);
  }, [onUpdateField, onUpdateAvatarFeature]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Section header */}
      <div>
        <h3 style={{
          fontSize: 20,
          fontFamily: fonts.serif,
          fontWeight: 600,
          color: colors.text,
          margin: 0,
          marginBottom: 4,
        }}>
          Design Your Face
        </h3>
        <p style={{
          fontSize: 12,
          fontFamily: fonts.sans,
          color: colors.textMuted,
          margin: 0,
        }}>
          Hit randomize for a new face, or type a seed.
        </p>
      </div>

      {/* Avatar preview + seed input row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 20,
      }}>
        {/* Large avatar circle */}
        <div style={{
          width: 140,
          height: 140,
          borderRadius: '50%',
          overflow: 'hidden',
          border: `3px solid ${colors.border}`,
          backgroundColor: colors.bgPanel,
          flexShrink: 0,
          transition: 'transform 0.6s cubic-bezier(0.22, 1, 0.36, 1)',
          transform: isSpinning ? 'rotate(720deg) scale(0.9)' : 'rotate(0deg) scale(1)',
        }}>
          {!imgError ? (
            <img
              key={fullUrl}
              src={fullUrl}
              alt="Avatar preview"
              width={140}
              height={140}
              onError={() => setImgError(true)}
              style={{ display: 'block' }}
            />
          ) : (
            <div style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 40,
              color: colors.textDim,
            }}>
              ?
            </div>
          )}
        </div>

        {/* Right side: seed + randomize */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
          <div>
            <label style={{
              display: 'block',
              fontSize: 10,
              fontFamily: fonts.sans,
              fontWeight: 500,
              color: colors.textMuted,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              marginBottom: 4,
            }}>
              Avatar Seed
            </label>
            <input
              type="text"
              value={state.avatarSeed}
              onChange={e => {
                onUpdateField('avatarSeed', e.target.value);
                setImgError(false);
              }}
              placeholder="Type anything..."
              style={{
                width: '100%',
                padding: '8px 12px',
                fontSize: 13,
                fontFamily: fonts.sans,
                color: colors.text,
                backgroundColor: colors.bgInput,
                border: `1px solid ${colors.border}`,
                borderRadius: radii.md,
                boxSizing: 'border-box',
              }}
            />
            <div style={{
              fontSize: 9,
              fontFamily: fonts.sans,
              color: colors.textDim,
              marginTop: 3,
            }}>
              The seed determines the base face. Same seed = same face.
            </div>
          </div>

          <button
            onClick={handleRandomize}
            style={{
              padding: '8px 16px',
              fontSize: 12,
              fontFamily: fonts.sans,
              fontWeight: 600,
              color: colors.text,
              backgroundColor: colors.bgPanel,
              border: `1px solid ${colors.border}`,
              borderRadius: radii.md,
              cursor: 'pointer',
              alignSelf: 'flex-start',
              transition: 'background-color 0.15s ease',
            }}
          >
            {'\u{1F3B2}'} Randomize
          </button>
        </div>
      </div>

    </div>
  );
}
