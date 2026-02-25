/**
 * LoadingM — Animated Marble "M" loading indicator.
 *
 * A pulsating serif "M" with a breathing glow. Used as the loading
 * state across all views. The M scales gently and its opacity
 * breathes — alive, not spinning.
 */

import { colors, fonts } from '../staffing/styles/tokens.js';

const KEYFRAMES_ID = 'marble-loading-m-keyframes';
if (typeof document !== 'undefined' && !document.getElementById(KEYFRAMES_ID)) {
  const s = document.createElement('style');
  s.id = KEYFRAMES_ID;
  s.textContent = `
    @keyframes marbleBreath {
      0%, 100% {
        opacity: 0.25;
        transform: scale(1);
      }
      50% {
        opacity: 0.7;
        transform: scale(1.08);
      }
    }
    @keyframes marbleDot {
      0%, 80%, 100% { opacity: 0; }
      40% { opacity: 0.5; }
    }
  `;
  document.head.appendChild(s);
}

interface LoadingMProps {
  /** Optional text below the M (e.g., "Loading session..."). If omitted, no text shown. */
  text?: string;
  /** Size of the M in px. Default 64. */
  size?: number;
}

export function LoadingM({ text, size = 64 }: LoadingMProps) {
  return (
    <div style={{
      width: '100%',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#FAF9F6',
      gap: 16,
    }}>
      {/* The M */}
      <div style={{
        fontFamily: fonts.serif,
        fontSize: size,
        fontWeight: 300,
        color: colors.text,
        lineHeight: 1,
        userSelect: 'none',
        animation: 'marbleBreath 2.4s ease-in-out infinite',
      }}>
        M
      </div>

      {/* Optional label */}
      {text && (
        <div style={{
          fontFamily: fonts.sans,
          fontSize: 11,
          fontWeight: 500,
          color: colors.textDim,
          letterSpacing: 0.5,
          textTransform: 'uppercase',
        }}>
          {text}
        </div>
      )}
    </div>
  );
}
