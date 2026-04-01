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
      gap: 0,
      padding: '24px 0 8px',
    }}>
      {/* Large OVR number — serif, cinematic */}
      <div style={{
        fontSize: 96,
        fontFamily: fonts.serif,
        fontWeight: 300,
        color: 'rgba(250,249,246,0.92)',
        lineHeight: 1,
        letterSpacing: -3,
      }}>
        {display}
      </div>

      {/* OVR label + tier on same line */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        marginTop: 18,
      }}>
        <div style={{
          fontSize: 9,
          fontFamily: fonts.sans,
          fontWeight: 500,
          color: 'rgba(250,249,246,0.3)',
          textTransform: 'uppercase',
          letterSpacing: 5,
        }}>
          Overall
        </div>
        <span style={{ color: 'rgba(250,249,246,0.18)', fontSize: 10 }}>·</span>
        <span style={{
          fontSize: 11,
          fontFamily: fonts.sans,
          fontWeight: 600,
          color: tColor,
          letterSpacing: 0.5,
          textTransform: 'capitalize',
        }}>{costTier}</span>
      </div>
    </div>
  );
}
