/**
 * BudgetSlider — Draggable budget slider with live cost display.
 * Warm editorial tones.
 */

import { useId } from 'react';
import { colors, fonts, spacing } from '../styles/tokens.js';

interface Props {
  budget: number;
  estimatedCost: number;
  teamSize: number;
  onBudgetChange: (budget: number) => void;
}

export function BudgetSlider({ budget, estimatedCost, teamSize, onBudgetChange }: Props) {
  const sliderId = useId();

  const avgCostPerAgent = teamSize > 0 ? estimatedCost / teamSize : 0;
  const fillPercent = ((budget - 1) / 99) * 100;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.label}>Budget</span>
        <span style={styles.value}>${budget.toFixed(budget % 1 === 0 ? 0 : 2)}</span>
      </div>

      <div style={styles.sliderRow}>
        <span style={styles.minLabel}>$1</span>
        <div style={styles.sliderWrapper}>
          {/* Custom track background */}
          <div style={{
            ...styles.trackBg,
            background: `linear-gradient(to right, ${colors.success} 0%, ${colors.lawyer} 50%, ${colors.text} 100%)`,
          }} />
          <div style={{
            ...styles.trackFill,
            width: `${fillPercent}%`,
            background: `linear-gradient(to right, ${colors.success}, ${colors.lawyer} 50%, ${colors.text})`,
          }} />
          <input
            id={sliderId}
            type="range"
            min={1}
            max={100}
            step={0.5}
            value={budget}
            onChange={e => onBudgetChange(parseFloat(e.target.value))}
            style={styles.slider}
          />
        </div>
        <span style={styles.maxLabel}>$100</span>
      </div>

      <div style={styles.costInfo}>
        <span style={styles.costText}>
          Est. ${estimatedCost.toFixed(2)}/eng
          {teamSize > 0 && (
            <span style={styles.costDetail}>
              {' '}({teamSize} agents x ~${avgCostPerAgent.toFixed(2)} avg)
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: 11,
    fontFamily: fonts.sans,
    fontWeight: 500,
    color: colors.textDim,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  value: {
    fontSize: 16,
    fontFamily: fonts.sans,
    color: colors.text,
    fontWeight: 600,
  },
  sliderRow: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
  },
  minLabel: {
    fontSize: 10,
    fontFamily: fonts.sans,
    color: colors.textDim,
    minWidth: 20,
    textAlign: 'right',
  },
  maxLabel: {
    fontSize: 10,
    fontFamily: fonts.sans,
    color: colors.textDim,
    minWidth: 24,
  },
  sliderWrapper: {
    position: 'relative',
    flex: 1,
    height: 20,
    display: 'flex',
    alignItems: 'center',
  },
  trackBg: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    height: 4,
    borderRadius: 2,
    transform: 'translateY(-50%)',
    opacity: 0.15,
  },
  trackFill: {
    position: 'absolute',
    top: '50%',
    left: 0,
    height: 4,
    borderRadius: 2,
    transform: 'translateY(-50%)',
    opacity: 0.5,
    pointerEvents: 'none',
  },
  slider: {
    width: '100%',
    height: 20,
    appearance: 'none',
    WebkitAppearance: 'none',
    background: 'transparent',
    cursor: 'pointer',
    position: 'relative',
    zIndex: 1,
  },
  costInfo: {
    marginTop: 2,
  },
  costText: {
    fontSize: 12,
    fontFamily: fonts.sans,
    color: colors.textMuted,
  },
  costDetail: {
    fontSize: 11,
    color: colors.textDim,
  },
};
