/**
 * BudgetMeter — Compact team size + equivalent hourly cost.
 * Framed as "traditional firm equivalent" — not a real charge.
 * Warm editorial tones.
 */

import { colors, fonts, radii } from '../styles/tokens.js';

interface Props {
  teamSize: number;
  totalCost: number;
}

export function BudgetMeter({ teamSize, totalCost }: Props) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      fontFamily: fonts.sans,
    }}>
      <span style={{
        fontSize: 13,
        fontWeight: 600,
        color: teamSize > 0 ? colors.text : colors.textDim,
      }}>
        {teamSize} agent{teamSize !== 1 ? 's' : ''}
      </span>

      {totalCost > 0 && (
        <>
          <span style={{ fontSize: 11, color: colors.textDim }}>{'\u00B7'}</span>
          <span style={{
            fontSize: 12,
            color: colors.textMuted,
            fontWeight: 500,
          }}>
            ~${totalCost.toLocaleString()}/hr equiv.
          </span>
        </>
      )}
    </div>
  );
}
