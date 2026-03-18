/**
 * LavernIlluminated — Wordmark with a slow light-sweep effect.
 *
 * A warm highlight band drifts across the letters like sunlight
 * catching veins in stone. Works on both light and dark backgrounds
 * — pass the base text color and the highlight color.
 */

import type React from 'react';

interface Props {
  /** Base text color (what the text would normally be) */
  color?: string;
  /** Highlight color for the light sweep */
  glow?: string;
  /** Merge additional styles (font-size, letter-spacing, etc.) */
  style?: React.CSSProperties;
}

export function LavernIlluminated({
  color = '#1a1a1a',
  glow = '#96875f',
  style,
}: Props) {
  return (
    <span
      style={{
        ...style,
        background: `linear-gradient(90deg, ${color} 0%, ${color} 44%, ${glow} 50%, ${color} 56%, ${color} 100%)`,
        backgroundSize: '400% 100%',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        animation: 'lavernIlluminate 8s ease-in-out infinite',
      }}
    >
      LAVERN
    </span>
  );
}
