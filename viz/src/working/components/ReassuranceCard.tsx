/**
 * ReassuranceCard — System-level warmth during silent periods.
 *
 * A centered, serif-italic message that appears in the conversation feed
 * when there's been a gap between high-value events. Reassures the user
 * that the system is working normally and that waiting is expected.
 *
 * Style: no avatar, centered, warm cream background, thin gradient dividers.
 */

import { colors, fonts } from '../../staffing/styles/tokens.js';

interface ReassuranceCardProps {
  message: string;
}

export function ReassuranceCard({ message }: ReassuranceCardProps) {
  return (
    <div style={styles.container}>
      <div style={styles.rule} />
      <div style={styles.content}>
        <span style={styles.icon}>{'\u2714'}</span>
        <span style={styles.message}>{message}</span>
      </div>
      <div style={styles.rule} />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    padding: '8px 0',
    margin: '4px 0',
  },
  rule: {
    flex: 1,
    height: 1,
    background: `linear-gradient(90deg, transparent, ${colors.border}, transparent)`,
  },
  content: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
    maxWidth: '70%',
  },
  icon: {
    fontSize: 10,
    color: colors.success,
    flexShrink: 0,
    opacity: 0.6,
  },
  message: {
    fontSize: 12,
    fontFamily: fonts.serif,
    fontWeight: 400,
    fontStyle: 'italic' as const,
    color: colors.textDim,
    textAlign: 'center' as const,
    lineHeight: 1.4,
  },
};
