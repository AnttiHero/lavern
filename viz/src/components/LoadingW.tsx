/**
 * LoadingW — Animated Lavern "L" loading indicator.
 *
 * A pulsating serif "L" with a breathing glow. Used as the loading
 * state across all views. The L scales gently and its opacity
 * breathes — alive, not spinning.
 */

import { colors, fonts } from '../staffing/styles/tokens.js';

interface LoadingWProps {
  /** Optional text below the W (e.g., "Loading session..."). If omitted, no text shown. */
  text?: string;
  /** Size of the W in px. Default 64. */
  size?: number;
}

export function LoadingW({ text, size = 64 }: LoadingWProps) {
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
      {/* The L */}
      <div style={{
        fontFamily: fonts.serif,
        fontSize: size,
        fontWeight: 300,
        color: colors.text,
        lineHeight: 1,
        userSelect: 'none',
        animation: 'lavernLoadBreath 2.4s ease-in-out infinite',
      }}>
        L
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
