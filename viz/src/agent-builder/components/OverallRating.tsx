/**
 * OverallRating — Large OVR number with animated counter.
 *
 * Displays the overall rating (0-99) in a prominent badge
 * with the cost tier label and billing rate below.
 */

import { useEffect, useRef, useState } from 'react';
import { colors, fonts, tierColor, tierBg } from '../../staffing/styles/tokens.js';
import type { CostTier } from '../../types/agent-profile.js';

interface Props {
  ovr: number;
  costTier: CostTier;
  billingRate: number;
  animate?: boolean;  // if true, counts up from 0
}

export function OverallRating({ ovr, costTier, billingRate, animate = false }: Props) {
  const [display, setDisplay] = useState(animate ? 0 : ovr);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!animate) {
      setDisplay(ovr);
      return;
    }

    let start = 0;
    const duration = 800; // ms
    const startTime = performance.now();

    function tick(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * ovr));

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [ovr, animate]);

  const tColor = tierColor(costTier);
  const tBg = tierBg(costTier);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 4,
    }}>
      {/* Large OVR number */}
      <div style={{
        fontSize: 56,
        fontFamily: fonts.sans,
        fontWeight: 800,
        color: colors.text,
        lineHeight: 1,
        letterSpacing: -2,
      }}>
        {display}
      </div>

      {/* OVR label */}
      <div style={{
        fontSize: 10,
        fontFamily: fonts.sans,
        fontWeight: 500,
        color: colors.textMuted,
        textTransform: 'uppercase',
        letterSpacing: 2,
      }}>
        Overall
      </div>

      {/* Tier + billing rate */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginTop: 4,
      }}>
        <span style={{
          fontSize: 11,
          fontFamily: fonts.sans,
          fontWeight: 600,
          color: tColor,
          backgroundColor: tBg,
          padding: '2px 8px',
          borderRadius: 999,
          textTransform: 'capitalize',
        }}>
          {costTier}
        </span>
        <span style={{
          fontSize: 12,
          fontFamily: fonts.sans,
          fontWeight: 600,
          color: colors.textSecondary,
        }}>
          ${billingRate}/hr
        </span>
      </div>
    </div>
  );
}
