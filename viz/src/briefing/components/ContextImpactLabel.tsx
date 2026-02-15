/**
 * ContextImpactLabel — Small fade-in label explaining WHY an answer matters.
 *
 * Appears after a debounced pause when the user types an answer.
 * Design: 12px, textDim color, preceded by accent dot.
 */

import { useState, useEffect } from 'react';
import { colors, fonts } from '../../staffing/styles/tokens.js';

interface Props {
  /** The impact note text to display */
  note: string;
  /** Whether the user has provided a non-empty answer */
  hasAnswer: boolean;
}

export function ContextImpactLabel({ note, hasAnswer }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!hasAnswer) {
      setVisible(false);
      return;
    }

    // Debounce: show after 500ms of having an answer
    const timer = setTimeout(() => setVisible(true), 500);
    return () => clearTimeout(timer);
  }, [hasAnswer]);

  if (!visible || !note) return null;

  return (
    <div style={styles.container}>
      <span style={styles.dot}>{'\u25CF'}</span>
      <span style={styles.text}>{note}</span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 6,
    opacity: 0.85,
    animation: 'fadeIn 0.3s ease-in',
  },
  dot: {
    color: colors.accent,
    fontSize: 6,
    lineHeight: '18px',
    flexShrink: 0,
  },
  text: {
    fontSize: 12,
    fontFamily: fonts.sans,
    fontWeight: 400,
    color: colors.textDim,
    lineHeight: 1.5,
  },
};
