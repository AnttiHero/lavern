/**
 * PresetSelector — Team preset quick-select buttons.
 * Warm editorial design — clean pills with dark active state.
 */

import { colors, fonts, radii, spacing } from '../styles/tokens.js';
import type { TeamPreset } from '../hooks/useTeamPresets.js';

interface Props {
  presets: TeamPreset[];
  activePreset: string | null;
  onSelect: (presetId: string) => void;
}

export function PresetSelector({ presets, activePreset, onSelect }: Props) {
  if (presets.length === 0) return null;

  return (
    <div style={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: spacing.sm,
      justifyContent: 'center',
      padding: `${spacing.md}px 0`,
    }}>
      {presets.map(preset => {
        const isActive = activePreset === preset.id;

        return (
          <button
            key={preset.id}
            onClick={() => onSelect(preset.id)}
            style={{
              padding: '8px 18px',
              borderRadius: radii.lg,
              border: `1px solid ${isActive ? colors.text : colors.border}`,
              backgroundColor: isActive ? colors.text : colors.bgCard,
              color: isActive ? '#fff' : colors.textSecondary,
              fontFamily: fonts.sans,
              fontSize: 12,
              fontWeight: isActive ? 600 : 400,
              boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              cursor: 'pointer',
              transition: 'background-color 0.25s ease, color 0.25s ease, border-color 0.25s ease',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span>{preset.name}</span>
            {preset.teamSize > 0 && (
              <span style={{
                fontSize: 10,
                backgroundColor: isActive ? 'rgba(255,255,255,0.2)' : colors.bgPanel,
                padding: '1px 6px',
                borderRadius: radii.pill,
                color: isActive ? 'rgba(255,255,255,0.8)' : colors.textMuted,
              }}>
                {preset.teamSize}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
