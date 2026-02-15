/**
 * VerificationBreakdown — Three-column grid showing per-type verification results.
 *
 * Each card: pass/fail icon, type label, confidence percentage.
 * Footer: "Double-checked by X independent agents" messaging.
 */

import { colors, fonts, radii, spacing } from '../../staffing/styles/tokens.js';

export interface VerificationDimension {
  type: 'self' | 'cross' | 'score';
  passed: boolean;
  confidence: number;
  label: string;
}

interface Props {
  breakdown: VerificationDimension[];
  agentCount: number;
}

export function VerificationBreakdown({ breakdown, agentCount }: Props) {
  return (
    <div style={styles.container}>
      <div style={styles.grid}>
        {breakdown.map(dim => (
          <div key={dim.type} style={styles.card} data-testid={`verification-${dim.type}`}>
            <div style={{
              ...styles.icon,
              color: dim.passed ? colors.success : colors.danger,
            }}>
              {dim.passed ? '\u2713' : '\u2717'}
            </div>
            <div style={styles.label}>{dim.label}</div>
            <div style={{
              ...styles.confidence,
              color: dim.passed ? colors.text : colors.danger,
            }}>
              {Math.round(dim.confidence * 100)}%
            </div>
          </div>
        ))}
      </div>

      <div style={styles.footer}>
        Double-checked by {agentCount} independent agent{agentCount !== 1 ? 's' : ''}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.md,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: spacing.md,
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: spacing.xs,
    padding: `${spacing.lg}px ${spacing.md}px`,
    backgroundColor: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.md,
  },
  icon: {
    fontSize: 24,
    fontWeight: 700,
    lineHeight: 1,
  },
  label: {
    fontSize: 12,
    fontFamily: fonts.sans,
    fontWeight: 500,
    color: colors.textSecondary,
    textAlign: 'center' as const,
  },
  confidence: {
    fontSize: 22,
    fontFamily: fonts.mono,
    fontWeight: 600,
    letterSpacing: -0.5,
  },
  footer: {
    fontSize: 13,
    fontFamily: fonts.sans,
    fontWeight: 500,
    color: colors.textMuted,
    fontStyle: 'italic',
    textAlign: 'center' as const,
  },
};
