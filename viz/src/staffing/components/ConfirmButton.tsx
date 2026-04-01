/**
 * ConfirmButton — "Engage Team" button with confetti burst.
 * Warm editorial — dark fill, clean type, subtle confetti in warm tones.
 */

import { useCallback, useRef } from 'react';
import { motion } from 'motion/react';
import confetti from 'canvas-confetti';
import { colors, fonts, radii } from '../styles/tokens.js';

interface Props {
  disabled: boolean;
  confirming: boolean;
  teamSize: number;
  onConfirm: () => void;
}

export function ConfirmButton({ disabled, confirming, teamSize, onConfirm }: Props) {
  const btnRef = useRef<HTMLButtonElement>(null);

  const handleClick = useCallback(() => {
    if (disabled || confirming) return;

    // Fire confetti from button position — warm tones
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const x = (rect.left + rect.width / 2) / window.innerWidth;
      const y = (rect.top + rect.height / 2) / window.innerHeight;

      confetti({
        particleCount: 60,
        spread: 55,
        origin: { x, y },
        colors: ['#C45D3E', '#2E7D9C', '#7B5EA7', '#4A7C50', '#9C7B3E'],
        disableForReducedMotion: true,
      });
    }

    onConfirm();
  }, [disabled, confirming, onConfirm]);

  return (
    <motion.button
      ref={btnRef}
      onClick={handleClick}
      disabled={disabled || confirming}
      whileHover={!disabled ? { scale: 1.02 } : undefined}
      whileTap={!disabled ? { scale: 0.98 } : undefined}
      style={{
        padding: '14px 44px',
        borderRadius: 100,
        border: `2px solid ${disabled ? colors.border : colors.text}`,
        backgroundColor: disabled ? colors.bgPanel : colors.text,
        color: disabled ? colors.textDim : '#fff',
        fontFamily: fonts.sans,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: 3,
        textTransform: 'uppercase' as const,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background-color 0.25s ease, color 0.25s ease, border-color 0.25s ease',
        whiteSpace: 'nowrap',
        boxShadow: disabled ? 'none' : '0 2px 8px rgba(0,0,0,0.1)',
      }}
    >
      {confirming ? 'Engaging...' : `Engage Team (${teamSize})`}
    </motion.button>
  );
}
