/**
 * SuggestionChip — Clickable pill suggesting a way to improve the briefing.
 *
 * Design: warm pill with accent left border, subtle bg, hover effect.
 */

import { useState } from 'react';
import type { Suggestion } from '../hooks/useSmartSuggestions.js';
import { colors, fonts, radii } from '../../staffing/styles/tokens.js';

interface Props {
  suggestion: Suggestion;
  onActivate: (suggestion: Suggestion) => void;
}

export function SuggestionChip({ suggestion, onActivate }: Props) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={() => onActivate(suggestion)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...styles.chip,
        backgroundColor: hovered ? 'rgba(196, 93, 62, 0.08)' : colors.bgCard,
        borderColor: hovered ? colors.accent : colors.border,
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
    transition: 'background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease',
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
