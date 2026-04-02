/**
 * BudgetGauge — Budget progress bar with color transitions.
 */

import { fonts, radii, spacing } from '../../staffing/styles/tokens.js';
import { CLAW } from '../theme.js';

interface Props {
  spent: number;
  total: number;
  exhausted: boolean;
}

export function BudgetGauge({ spent, total, exhausted }: Props) {
  const pct = total > 0 ? (spent / total) * 100 : 0;
  const remaining = total - spent;
  const barColor = exhausted ? CLAW.danger : pct > 80 ? CLAW.amber : CLAW.success;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>Budget</span>
        <span style={styles.amount}>
          ${spent.toFixed(2)} / ${total.toFixed(2)}
        </span>
      </div>
      <div style={styles.track}>
        <div style={{
          ...styles.fill,
          width: `${Math.min(100, pct)}%`,
          backgroundColor: barColor,
        }} />
      </div>
      <div style={styles.footer}>
        <span>${remaining.toFixed(2)} remaining</span>
        {exhausted && <span style={{ color: CLAW.danger, fontWeight: 600 }}>Budget exhausted</span>}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    backgroundColor: CLAW.surface,
    border: `1px solid ${CLAW.border}`,
    borderRadius: radii.md,
    padding: spacing.lg,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 16,
    fontWeight: 300,
    color: CLAW.text,
  },
  amount: {
    fontSize: 13,
    color: CLAW.textSecondary,
    fontFamily: fonts.mono,
  },
  track: {
    height: 8,
    backgroundColor: CLAW.input,
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radii.pill,
    transition: 'width 0.3s ease',
  },
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 12,
    color: CLAW.textMuted,
    fontFamily: fonts.sans,
    marginTop: 6,
  },
};
