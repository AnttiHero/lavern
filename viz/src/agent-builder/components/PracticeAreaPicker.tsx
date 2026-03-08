/**
 * PracticeAreaPicker — Multi-select chip picker for practice areas.
 *
 * Groups practice areas by domain. Selected chips get a filled style.
 */

import { colors, fonts, radii } from '../../staffing/styles/tokens.js';
import { PRACTICE_AREA_GROUPS } from '../data/practice-area-options.js';

interface Props {
  selected: string[];
  onToggle: (area: string) => void;
}

export function PracticeAreaPicker({ selected, onToggle }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {PRACTICE_AREA_GROUPS.map(group => (
        <div key={group.label}>
          <div style={{
            fontSize: 10,
            fontFamily: fonts.sans,
            fontWeight: 500,
            color: colors.textMuted,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            marginBottom: 6,
          }}>
            {group.label}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {group.areas.map(area => {
              const isSelected = selected.includes(area);
              return (
                <button
                  key={area}
                  onClick={() => onToggle(area)}
                  style={{
                    fontSize: 11,
                    fontFamily: fonts.sans,
                    fontWeight: isSelected ? 600 : 400,
                    color: isSelected ? '#fff' : colors.textSecondary,
                    backgroundColor: isSelected ? colors.text : colors.bgPanel,
                    border: `1px solid ${isSelected ? colors.text : colors.border}`,
                    padding: '4px 10px',
                    borderRadius: radii.pill,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {area}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
