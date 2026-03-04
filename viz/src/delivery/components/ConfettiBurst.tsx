/**
 * ConfettiBurst — Brief celebration particles on delivery completion.
 * Terracotta-and-gold palette. Tasteful, not party-store.
 */

import { useState, useEffect } from 'react';

const COLORS = [
  'rgba(196, 93, 62, 0.8)',   // terracotta
  'rgba(184, 134, 11, 0.7)',  // amber/gold
  'rgba(196, 93, 62, 0.5)',   // soft terracotta
  'rgba(184, 134, 11, 0.4)',  // soft gold
  'rgba(74, 124, 80, 0.5)',   // soft green
];

interface Particle {
  id: number;
  x: number;
  size: number;
  color: string;
  delay: number;
  rotate: number;
  duration: number;
}

function generateParticles(count: number): Particle[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: 20 + Math.random() * 60,            // 20-80% horizontal spread
    size: 2 + Math.random() * 4,            // 2-6px
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    delay: Math.random() * 0.6,             // stagger up to 0.6s
    rotate: -60 + Math.random() * 120,      // random spin
    duration: 1.2 + Math.random() * 0.8,    // 1.2-2s
  }));
}

export function ConfettiBurst() {
  const [particles] = useState(() => generateParticles(24));
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 2800);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div style={styles.container}>
      {particles.map(p => (
        <div
          key={p.id}
          style={{
            position: 'absolute' as const,
            left: `${p.x}%`,
            bottom: 0,
            width: p.size,
            height: p.size,
            borderRadius: p.size > 4 ? 1 : '50%',
            backgroundColor: p.color,
            animation: `confettiRise ${p.duration}s ease-out ${p.delay}s both`,
            '--confetti-rotate': `${p.rotate}deg`,
            pointerEvents: 'none' as const,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'relative',
    width: '100%',
    height: 0,
    overflow: 'visible',
    pointerEvents: 'none',
  },
};
