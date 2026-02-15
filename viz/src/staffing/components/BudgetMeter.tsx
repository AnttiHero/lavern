/**
 * BudgetMeter — Team size count + running cost total.
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
      gap: 12,
      fontFamily: fonts.sans,
    }}>
      {/* Team size */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
      }}>
        <span style={{ fontSize: 11, color: colors.textMuted, fontWeight: 500 }}>Team</span>
        <span style={{
          fontSize: 16,
          fontWeight: 600,
          color: teamSize > 0 ? colors.text : colors.textDim,
          minWidth: 20,
          textAlign: 'center',
        }}>
          {teamSize}
        </span>
      </div>

      {/* Divider */}
      <div style={{
        width: 1,
        height: 20,
        backgroundColor: colors.border,
      }} />

      {/* Cost */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
      }}>
        <span style={{ fontSize: 11, color: colors.textMuted, fontWeight: 500 }}>Est.</span>
        <span style={{
          fontSize: 16,
          fontWeight: 600,
          color: totalCost > 0 ? colors.text : colors.textDim,
          backgroundColor: totalCost > 0 ? colors.bgPanel : 'transparent',
          padding: '2px 8px',
          borderRadius: radii.sm,
        }}>
          ${totalCost}/eng
        </span>
      </div>
    </div>
  );
}
