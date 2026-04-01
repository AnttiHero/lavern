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
    }}>
      {/* Large OVR number — serif, cinematic */}
      <div style={{
        fontSize: 88,
        fontFamily: fonts.serif,
        fontWeight: 300,
        color: 'rgba(250,249,246,0.95)',
        lineHeight: 1,
        letterSpacing: -2,
      }}>
        {display}
      </div>

      {/* OVR label */}
      <div style={{
        fontSize: 9,
        fontFamily: fonts.sans,
        fontWeight: 500,
        color: 'rgba(250,249,246,0.35)',
        textTransform: 'uppercase',
        letterSpacing: 4,
        marginTop: 6,
      }}>
        Overall
      </div>

      {/* Tier · billing — subtle single line */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        marginTop: 10,
        color: 'rgba(250,249,246,0.4)',
        fontSize: 11,
        fontFamily: fonts.sans,
      }}>
        <span style={{ color: tColor, fontWeight: 600 }}>{costTier}</span>
        <span style={{ opacity: 0.4 }}>·</span>
        <span>${billingRate}/hr</span>
      </div>
    </div>
  );
}
