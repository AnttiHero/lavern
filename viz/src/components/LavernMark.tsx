/**
 * LavernMark — The Lavern "L" mark.
 *
 * A single serif "L" rendered in Cormorant Garamond.
 * Appears in the upper-left corner of every page.
 * Clicking navigates home (landing page).
 */

import { useState, useEffect } from 'react';
import { colors, fonts } from '../staffing/styles/tokens.js';

interface LavernMarkProps {
  /** Font size of the W in pixels. Default 28. */
  size?: number;
  /** Navigate on click. Default: go to landing. */
  onClick?: () => void;
  /** Set to true on views with their own cursor (landing page). */
  hideCursor?: boolean;
}

export function LavernMark({ size = 28, onClick, hideCursor }: LavernMarkProps) {
  const [hovered, setHovered] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 100);
    return () => clearTimeout(t);
  }, []);

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
        opacity: mounted ? (hovered ? 1 : 0.5) : 0,
        transition: 'opacity 0.3s ease',
        userSelect: 'none' as const,
      }}
      aria-label="Lavern — Home"
    >
      L
    </button>
  );
}
