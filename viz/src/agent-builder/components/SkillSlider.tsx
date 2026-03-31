/**
 * SkillSlider — Single skill slider displaying 0-99.
 *
 * Internal values are 1-10; display values are 0-99.
 * Shows a labelled horizontal range input with the display value.
 */

import { useCallback } from 'react';
import { colors, fonts } from '../../staffing/styles/tokens.js';
import { skillToDisplay, displayToSkill } from '../hooks/useAgentBuilder.js';
import type { SkillRatings } from '../../types/agent-profile.js';

interface Props {
  skill: keyof SkillRatings;
  label: string;
  value: number;        // internal 1-10
  onChange: (skill: keyof SkillRatings, value: number) => void;
}

export function SkillSlider({ skill, label, value, onChange }: Props) {
  const displayValue = skillToDisplay(value);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(skill, displayToSkill(Number(e.target.value)));
  }, [skill, onChange]);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
    }}>
      {/* Label */}
      <div style={{
        width: 100,
        fontSize: 12,
        fontFamily: fonts.sans,
        fontWeight: 500,
        color: colors.textSecondary,
        textTransform: 'capitalize',
        flexShrink: 0,
      }}>
        {label}
      </div>

      {/* Range input */}
      <input
        type="range"
        min={0}
        max={99}
        value={displayValue}
        onChange={handleChange}
        className="builder-skill-slider"
        style={{
          flex: 1,
          height: 4,
          background: `linear-gradient(to right, ${colors.text} ${displayValue}%, ${colors.bgPanel} ${displayValue}%)`,
          borderRadius: 2,
        }}
      />

      {/* Display value */}
      <div style={{
        width: 32,
        fontSize: 14,
        fontFamily: fonts.mono,
        fontWeight: 700,
        color: colors.text,
        textAlign: 'right',
        flexShrink: 0,
      }}>
        {displayValue}
      </div>
    </div>
  );
}
