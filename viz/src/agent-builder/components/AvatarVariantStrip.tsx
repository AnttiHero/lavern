/**
 * AvatarVariantStrip — Horizontal scrollable strip of avatar feature variants.
 *
 * Shows numbered circles per variant with the feature's icon/initial.
 * No API calls per thumbnail — only the main preview hits the DiceBear API.
 * Click to apply. Highlights active selection with a solid dark ring.
 */

import { useRef, useCallback } from 'react';
import { colors, fonts, radii } from '../../staffing/styles/tokens.js';
import type { AvatarFeature } from '../data/dicebear-variants.js';

interface Props {
  feature: AvatarFeature;
  seed: string;
  currentValue: string | null | undefined;
  currentSelections: Record<string, string | null>;
  onSelect: (feature: string, variant: string | null) => void;
}

/** Map feature keys to a representative icon/emoji for the strip */
const FEATURE_ICONS: Record<string, string> = {
  hair: '\u2702',      // scissors
  eyes: '\u25C9',      // fisheye
  lips: '\u223F',      // sine wave
  nose: '\u25B3',      // triangle
  brows: '\u2312',     // arc
  beard: '\u2698',     // gear/flower
  glasses: '\u25CB',   // circle
};

/** Gentle pastel tints per feature so strips feel distinct */
const FEATURE_TINTS: Record<string, string> = {
  hair: 'rgba(139, 105, 20, 0.06)',
  eyes: 'rgba(46, 125, 156, 0.06)',
  lips: 'rgba(196, 93, 62, 0.06)',
  nose: 'rgba(74, 124, 80, 0.06)',
  brows: 'rgba(123, 94, 167, 0.06)',
  beard: 'rgba(156, 123, 62, 0.06)',
  glasses: 'rgba(46, 125, 156, 0.06)',
};

const FEATURE_ACTIVE_TINTS: Record<string, string> = {
  hair: 'rgba(139, 105, 20, 0.12)',
  eyes: 'rgba(46, 125, 156, 0.12)',
  lips: 'rgba(196, 93, 62, 0.12)',
  nose: 'rgba(74, 124, 80, 0.12)',
  brows: 'rgba(123, 94, 167, 0.12)',
  beard: 'rgba(156, 123, 62, 0.12)',
  glasses: 'rgba(46, 125, 156, 0.12)',
};

export function AvatarVariantStrip({ feature, currentValue, onSelect }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleScroll = useCallback((direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const amount = direction === 'left' ? -200 : 200;
    scrollRef.current.scrollBy({ left: amount, behavior: 'smooth' });
  }, []);

  const icon = FEATURE_ICONS[feature.key] || '\u25CF';
  const tint = FEATURE_TINTS[feature.key] || 'rgba(0,0,0,0.04)';
  const activeTint = FEATURE_ACTIVE_TINTS[feature.key] || 'rgba(0,0,0,0.1)';

  return (
    <div style={{ marginBottom: 8 }}>
      {/* Label + count + scroll buttons */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 6,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            fontSize: 11,
            fontFamily: fonts.sans,
            fontWeight: 600,
            color: colors.textSecondary,
            letterSpacing: 0.5,
          }}>
            {feature.label}
          </span>
          <span style={{
            fontSize: 9,
            fontFamily: fonts.mono,
            color: colors.textDim,
            letterSpacing: 0,
          }}>
            {feature.variants.length} options
          </span>
        </div>

        <div style={{ display: 'flex', gap: 4 }}>
          <button
            onClick={() => handleScroll('left')}
            style={scrollBtnStyle}
            aria-label={`Scroll ${feature.label} left`}
          >
            {'\u2039'}
          </button>
          <button
            onClick={() => handleScroll('right')}
            style={scrollBtnStyle}
            aria-label={`Scroll ${feature.label} right`}
          >
            {'\u203A'}
          </button>
        </div>
      </div>

      {/* Scrollable strip */}
      <div
        ref={scrollRef}
        className="variant-strip"
        style={{
          display: 'flex',
          gap: 5,
          overflowX: 'auto',
          overflowY: 'hidden',
          paddingBottom: 4,
          scrollbarWidth: 'none',
        }}
      >
        {/* "None" option if allowed */}
        {feature.allowNone && (
          <button
            onClick={() => onSelect(feature.key, null)}
            style={{
              ...thumbStyle,
              border: `2px solid ${currentValue === null ? colors.text : colors.border}`,
              backgroundColor: currentValue === null ? 'rgba(26, 26, 26, 0.06)' : colors.bgPanel,
              boxShadow: currentValue === null ? `0 0 0 1px ${colors.text}` : 'none',
            }}
            title="None"
          >
            <span style={{
              fontSize: 14,
              color: currentValue === null ? colors.text : colors.textDim,
              lineHeight: 1,
            }}>
              {'\u2205'}
            </span>
          </button>
        )}

        {/* Variant circles */}
        {feature.variants.map((variant, idx) => {
          const isActive = currentValue === variant;
          const num = idx + 1;
          return (
            <button
              key={variant}
              onClick={() => onSelect(feature.key, variant)}
              style={{
                ...thumbStyle,
                border: `2px solid ${isActive ? colors.text : colors.border}`,
                boxShadow: isActive ? `0 0 0 1px ${colors.text}` : 'none',
                backgroundColor: isActive ? activeTint : tint,
              }}
              title={`${feature.label} ${num}`}
            >
              {/* Icon + number stacked */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 0,
                lineHeight: 1,
              }}>
                <span style={{
                  fontSize: 10,
                  color: isActive ? colors.text : colors.textDim,
                  opacity: isActive ? 1 : 0.5,
                  transition: 'opacity 0.15s ease',
                }}>
                  {icon}
                </span>
                <span style={{
                  fontSize: 8,
                  fontFamily: fonts.mono,
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? colors.text : colors.textMuted,
                  transition: 'color 0.15s ease',
                }}>
                  {num}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const scrollBtnStyle: React.CSSProperties = {
  width: 22,
  height: 22,
  border: `1px solid ${colors.border}`,
  borderRadius: radii.sm,
  backgroundColor: colors.bgCard,
  color: colors.textMuted,
  fontSize: 14,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  transition: 'background-color 0.15s ease',
};

const thumbStyle: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: '50%',
  padding: 0,
  backgroundColor: colors.bgPanel,
  cursor: 'pointer',
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'border-color 0.15s ease, box-shadow 0.15s ease, background-color 0.15s ease',
  overflow: 'hidden',
};
