/**
 * ConfidenceSignal — Small pill component with benchmark data.
 *
 * Placed at key moments throughout the engagement to demonstrate
 * the system's competence and set expectations. Like a partner
 * saying "Based on our experience with similar matters..."
 */

import { colors, fonts, radii } from '../staffing/styles/tokens.js';

interface Props {
  /** The confidence message to display */
  message: string;
  /** Optional accent color override */
  accentColor?: string;
}

export function ConfidenceSignal({ message, accentColor }: Props) {
  const accent = accentColor ?? colors.accent;

  return (
    <div style={styles.container}>
      <div style={{ ...styles.dot, backgroundColor: accent }} />
      <span style={styles.text}>{message}</span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 14px',
    backgroundColor: 'rgba(196, 93, 62, 0.04)',
    borderRadius: radii.sm,
    border: `1px solid rgba(196, 93, 62, 0.12)`,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    flexShrink: 0,
  },
  text: {
    fontSize: 12,
    fontFamily: fonts.sans,
    fontWeight: 500,
    color: colors.textSecondary,
    lineHeight: 1.4,
  },
};
