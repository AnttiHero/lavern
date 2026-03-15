/**
 * VoiceOrb — Audio-reactive orb visualizer.
 *
 * A soft terracotta circle that breathes and scales in response
 * to real-time audio levels. Pure CSS — no canvas required.
 */

import { colors } from '../../staffing/styles/tokens.js';

interface Props {
  audioLevel: number;   // 0-1
  isListening: boolean;
}

export function VoiceOrb({ audioLevel, isListening }: Props) {
  if (!isListening) return null;

  const scale = 1 + audioLevel * 0.35;
  const glowOpacity = 0.08 + audioLevel * 0.2;
  const glowRadius = 8 + audioLevel * 24;

  return (
    <div
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: `translate(-50%, -50%) scale(${scale})`,
        width: 52,
        height: 52,
        borderRadius: '50%',
        backgroundColor: `rgba(196, 93, 62, ${glowOpacity})`,
        boxShadow: `0 0 ${glowRadius}px rgba(196, 93, 62, ${audioLevel * 0.35})`,
        transition: 'transform 80ms ease-out, background-color 80ms, box-shadow 80ms',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    />
  );
}
