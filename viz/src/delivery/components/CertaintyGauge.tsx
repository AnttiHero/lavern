/**
 * CertaintyGauge — Radial SVG arc showing the overall certainty score.
 *
 * 270° arc with animated stroke-dashoffset on mount.
 * Color: success (>85%), warning (70-85%), danger (<70%).
 */

import { useEffect, useState } from 'react';
import { colors, fonts } from '../../staffing/styles/tokens.js';

interface Props {
  /** Certainty score 0-100 */
  score: number;
  /** Gauge size in pixels (default 160) */
  size?: number;
}

function gaugeColor(score: number): string {
  if (score >= 85) return colors.success;
  if (score >= 70) return colors.warning;
  return colors.danger;
}

export function CertaintyGauge({ score, size = 200 }: Props) {
  const [animatedScore, setAnimatedScore] = useState(0);

  // Animate on mount
  useEffect(() => {
    const timer = requestAnimationFrame(() => {
      setAnimatedScore(score);
    });
    return () => cancelAnimationFrame(timer);
  }, [score]);

  const center = size / 2;
  const radius = (size - 20) / 2; // 10px stroke, so inset by 10
  const strokeWidth = 10;

  // Arc: 270 degrees (3/4 circle), gap at bottom
  const circumference = 2 * Math.PI * radius;
  const arcLength = circumference * 0.75; // 270 degrees
  const dashOffset = arcLength - (arcLength * animatedScore) / 100;

  // Start at 135 degrees (bottom-left), sweep 270 degrees clockwise
  const startAngle = 135;
  const color = gaugeColor(score);
  // Shrink font slightly for 3-digit scores (100%) to prevent clipping
  const scoreFontSize = score >= 100 ? 40 : 48;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        data-testid="certainty-gauge"
      >
        {/* Background arc */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={colors.bgPanel}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${arcLength} ${circumference}`}
          transform={`rotate(${startAngle} ${center} ${center})`}
        />

        {/* Foreground arc */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${arcLength} ${circumference}`}
          strokeDashoffset={dashOffset}
          transform={`rotate(${startAngle} ${center} ${center})`}
          style={{ transition: 'stroke-dashoffset 1s ease, stroke 0.3s ease' }}
        />

        {/* Center text: score */}
        <text
          x={center}
          y={center - 10}
          textAnchor="middle"
          dominantBaseline="central"
          fill={color}
          fontFamily={fonts.serif}
          fontSize={scoreFontSize}
          fontWeight={300}
        >
          {score}%
        </text>

        {/* Label */}
        <text
          x={center}
          y={center + 28}
          textAnchor="middle"
          dominantBaseline="central"
          fill={colors.textMuted}
          fontFamily={fonts.sans}
          fontSize={11}
          fontWeight={600}
          letterSpacing={1.5}
        >
          CERTAINTY
        </text>
      </svg>
    </div>
  );
}
