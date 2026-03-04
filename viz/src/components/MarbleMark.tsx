/**
 * MarbleMark — The Marble "M" logo.
 *
 * A single serif "M" rendered in Cormorant Garamond.
 * Appears in the upper-left corner of every page.
 * Clicking navigates home (landing page).
 */

import { useState } from 'react';
import { colors, fonts } from '../staffing/styles/tokens.js';

interface MarbleMarkProps {
  /** Font size of the M in pixels. Default 28. */
  size?: number;
  /** Navigate on click. Default: go to landing. */
  onClick?: () => void;
  /** Set to true on views with their own cursor (landing page). */
  hideCursor?: boolean;
}

export function MarbleMark({ size = 28, onClick, hideCursor }: MarbleMarkProps) {
  const [hovered, setHovered] = useState(false);

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else {
      window.location.hash = '#/quickstart';
    }
  };

  return (
    <button
      onClick={handleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'fixed',
        top: 24,
        left: 28,
        zIndex: 10000,
        background: 'none',
        border: 'none',
        padding: 0,
        margin: 0,
        cursor: hideCursor ? 'none' : 'pointer',
        fontFamily: fonts.serif,
        fontSize: size,
        fontWeight: 300,
        color: colors.text,
        letterSpacing: 1,
        lineHeight: 1,
        opacity: hovered ? 1 : 0.5,
        transition: 'opacity 0.3s ease',
        userSelect: 'none' as const,
      }}
      aria-label="Marble — Home"
    >
      M
    </button>
  );
}
