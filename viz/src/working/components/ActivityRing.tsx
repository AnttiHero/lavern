/**
 * ActivityRing — Animated SVG progress ring for the HeartbeatBand.
 *
 * Visual states:
 *   Active (agents working): Warm amber glow, breathing animation, fills with progress.
 *   Idle (between phases):   Soft green glow, slow peaceful pulse.
 *   Stale (>45s no events):  Amber glow intensifies slightly.
 *
 * Never fully stops — even in idle, a slow pulse tells the user "I'm alive."
 */

import { colors } from '../../staffing/styles/tokens.js';

interface ActivityRingProps {
  /** Phase progress 0-1 (completedSteps / totalSteps). */
  progress: number;
  /** Number of currently active agents. 0 = idle. */
  activeCount: number;
  /** Size in pixels (default 64). */
  size?: number;
}

export function ActivityRing({ progress, activeCount, size = 64 }: ActivityRingProps) {
  const isActive = activeCount > 0;
  const strokeWidth = 4;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - progress);

  const glowColor = isActive ? 'rgba(184, 134, 11, 0.35)' : 'rgba(74, 124, 80, 0.2)';
  const strokeColor = isActive ? colors.warning : colors.success;
  const animationName = isActive ? 'heartbeatGlow' : 'heartbeatGlowIdle';

  return (
    <div
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        animation: `${animationName} ${isActive ? '2s' : '4s'} ease-in-out infinite`,
      }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Glow filter */}
        <defs>
          <filter id="ringGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="2" />
          </filter>
        </defs>

        {/* Background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={colors.border}
          strokeWidth={strokeWidth}
          opacity={0.4}
        />

        {/* Progress arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 0.8s ease, stroke 0.5s ease' }}
        />

        {/* Glow overlay */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={glowColor}
          strokeWidth={strokeWidth + 4}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          filter="url(#ringGlow)"
          style={{ transition: 'stroke-dashoffset 0.8s ease' }}
        />

        {/* Center text — active count or checkmark */}
        <text
          x={size / 2}
          y={size / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fill={strokeColor}
          fontSize={isActive ? 14 : 16}
          fontWeight={600}
          fontFamily="Inter, sans-serif"
        >
          {progress >= 1 ? '✓' : isActive ? activeCount : '·'}
        </text>
      </svg>
    </div>
  );
}
