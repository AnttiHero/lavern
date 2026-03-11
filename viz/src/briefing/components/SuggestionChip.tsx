/**
 * SuggestionChip — Clickable pill suggesting a way to improve the briefing.
 *
 * Design: warm pill with accent left border, subtle bg, hover effect.
 * Micro-delight: click scales down + fades out briefly before activating.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { Suggestion } from '../hooks/useSmartSuggestions.js';
import { colors, fonts, radii } from '../../staffing/styles/tokens.js';

interface Props {
  suggestion: Suggestion;
  onActivate: (suggestion: Suggestion) => void;
}

export function SuggestionChip({ suggestion, onActivate }: Props) {
  const [hovered, setHovered] = useState(false);
  const [activating, setActivating] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleClick = useCallback(() => {
    if (activating) return; // prevent double-click
    setActivating(true);
    // Brief scale-down + fade before triggering
    timerRef.current = setTimeout(() => {
      onActivate(suggestion);
    }, 180);
  }, [onActivate, suggestion, activating]);

  return (
    <button
      onClick={handleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...styles.chip,
        backgroundColor: activating
          ? 'rgba(196, 93, 62, 0.12)'
          : hovered ? 'rgba(196, 93, 62, 0.08)' : colors.bgCard,
        borderColor: activating
          ? colors.accent
          : hovered ? colors.accent : colors.border,
        transform: activating ? 'scale(0.92)' : 'scale(1)',
        opacity: activating ? 0.4 : 1,
      }}
      title={suggestion.description}
    >
      <span style={styles.icon}>
        {suggestion.action === 'add-document' ? '\u25A1' : '\u25CB'}
      </span>
      <span style={styles.label}>{suggestion.label}</span>
    </button>
  );
}

const styles: Record<string, React.CSSProperties> = {
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 14px',
    borderRadius: 999,
    border: '1px solid',
    fontFamily: fonts.sans,
    fontSize: 12,
    fontWeight: 500,
    color: colors.textSecondary,
    cursor: 'pointer',
    transition: 'background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease, transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease',
    whiteSpace: 'nowrap',
  },
  icon: {
    fontSize: 10,
    color: colors.accent,
  },
  label: {
    lineHeight: 1,
  },
};
