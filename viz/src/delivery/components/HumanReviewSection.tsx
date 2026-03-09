/**
 * HumanReviewSection — "What If This Advice Is Wrong?"
 *
 * Transparent section that builds trust by acknowledging limitations,
 * listing items flagged for human review, and providing a disclaimer.
 * Lawyers sell certainty — and certainty is enhanced by honest disclosure.
 */

import { colors, fonts, radii, spacing } from '../../staffing/styles/tokens.js';

interface Props {
  confidence: number;
  dimensionCount: number;
  flaggedItems: string[];
  confidenceIntervals: string;
  disclaimer: string;
}

export function HumanReviewSection({
  confidence,
  dimensionCount,
  flaggedItems,
  confidenceIntervals,
  disclaimer,
}: Props) {
  const pct = Math.round(confidence * 100);
  const hasConfidence = confidence > 0 && dimensionCount > 0;

  return (
    <div style={styles.container} data-testid="human-review-section">
      <h3 style={styles.heading}>What If This Advice Is Wrong?</h3>

      <p style={styles.statement}>
        {hasConfidence ? (
          <>This analysis scores <strong>{pct}% certainty</strong> across {dimensionCount} verification dimension{dimensionCount !== 1 ? 's' : ''}.</>
        ) : (
          <>This analysis has not yet been scored against formal verification dimensions. We recommend independent review.</>
        )}
      </p>

      {flaggedItems.length > 0 && (
        <div style={styles.flaggedSection}>
          <span style={styles.flaggedLabel}>Areas flagged for human review:</span>
          <ul style={styles.flaggedList}>
            {flaggedItems.map((item, i) => (
              <li key={i} style={styles.flaggedItem}>
                <span style={styles.flaggedDot} />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p style={styles.intervals}>{confidenceIntervals}</p>

      <p style={styles.disclaimer}>{disclaimer}</p>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: `${spacing.xl}px`,
    backgroundColor: colors.bgPanel,
    borderRadius: radii.lg,
    border: `1px solid ${colors.border}`,
  },
  heading: {
    fontSize: 20,
    fontFamily: fonts.serif,
    fontWeight: 400,
    color: colors.text,
    margin: `0 0 ${spacing.md}px`,
  },
  statement: {
    fontSize: 14,
    fontFamily: fonts.sans,
    color: colors.text,
    lineHeight: 1.6,
    margin: `0 0 ${spacing.lg}px`,
  },
  flaggedSection: {
    marginBottom: spacing.lg,
  },
  flaggedLabel: {
    fontSize: 12,
    fontFamily: fonts.sans,
    fontWeight: 600,
    color: colors.textSecondary,
    letterSpacing: 0.3,
  },
  flaggedList: {
    listStyle: 'none',
    padding: 0,
    margin: `${spacing.sm}px 0 0`,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: spacing.xs,
  },
  flaggedItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 13,
    fontFamily: fonts.sans,
    color: colors.text,
    lineHeight: 1.5,
  },
  flaggedDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    backgroundColor: colors.warning,
    flexShrink: 0,
  },
  intervals: {
    fontSize: 13,
    fontFamily: fonts.sans,
    color: colors.textSecondary,
    fontStyle: 'italic',
    lineHeight: 1.5,
    margin: `0 0 ${spacing.md}px`,
  },
  disclaimer: {
    fontSize: 12,
    fontFamily: fonts.sans,
    color: colors.textMuted,
    lineHeight: 1.6,
    margin: 0,
  },
};
