/**
 * PersonalitySlider — Bipolar axis slider (1-10).
 *
 * Shows left/right labels with a centered slider.
 * The fill gradient runs from teal to purple matching PersonalityBars.
 */

import { useCallback } from 'react';
import { colors, fonts } from '../../staffing/styles/tokens.js';
import type { PersonalityAxis } from '../../types/agent-profile.js';

interface Props {
  axis: PersonalityAxis;
  leftLabel: string;
  rightLabel: string;
  value: number;  // 1-10
  onChange: (axis: PersonalityAxis, value: number) => void;
}

export function PersonalitySlider({ axis, leftLabel, rightLabel, value, onChange }: Props) {
  const pct = ((value - 1) / 9) * 100;

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(axis, Number(e.target.value));
  }, [axis, onChange]);

  return (
    <div>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: 10,
        fontFamily: fonts.sans,
        color: colors.textMuted,
        marginBottom: 4,
      }}>
        <span>{leftLabel}</span>
        <span>{rightLabel}</span>
      </div>
      <input
        type="range"
        min={1}
        max={10}
        value={value}
        onChange={handleChange}
        className="builder-personality-slider"
        style={{
          width: '100%',
          height: 4,
          background: `linear-gradient(to right, ${colors.lawyer} ${pct}%, ${colors.bgPanel} ${pct}%)`,
          borderRadius: 2,
        }}
      />
    </div>
  );
}
