/**
 * SparkleEffect -- Gold particle burst for memo reveal.
 *
 * Renders 12 small gold dots that float upward and fade out.
 * Used during the consultation memo reveal animation.
 */

import { useMemo } from 'react';

const GOLD = '#96875f';
const PARTICLE_COUNT = 12;

interface Props {
  active: boolean;
}

export function SparkleEffect({ active }: Props) {
  const particles = useMemo(() =>
    Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
      id: i,
      left: 10 + Math.random() * 80,
      delay: Math.random() * 1,
      duration: 1.5 + Math.random() * 1.5,
      size: 3 + Math.random() * 3,
    })),
  []);

  if (!active) return null;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        zIndex: -1,
      }}
    >
      {particles.map(p => (
        <div
          key={p.id}
          style={{
            position: 'absolute',
            left: `${p.left}%`,
            bottom: '20%',
            width: p.size,
            height: p.size,
            borderRadius: '50%',
            backgroundColor: GOLD,
            animation: `sparkleFloat ${p.duration}s ease-out ${p.delay}s forwards`,
            opacity: 0,
          }}
        />
      ))}
    </div>
  );
}
