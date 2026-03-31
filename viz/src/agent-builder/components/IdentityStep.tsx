/**
 * IdentityStep — Step 1: Pick a starter kit + set identity fields.
 *
 * Shows archetype presets as large clickable cards, then name/tagline/
 * category/seniority fields below.
 */

import { useCallback } from 'react';
import { colors, fonts, radii, categoryColor, tierColor } from '../../staffing/styles/tokens.js';
import { ARCHETYPE_PRESETS } from '../data/archetype-presets.js';
import { calculateOVR, ovrToCostTier } from '../hooks/useAgentBuilder.js';
import type { BuilderState } from '../hooks/useAgentBuilder.js';
import type { AgentCategory, SeniorityTier } from '../../types/agent-profile.js';

interface Props {
  state: BuilderState;
  onUpdateField: <K extends keyof BuilderState>(key: K, value: BuilderState[K]) => void;
  onApplyPreset: (presetId: string) => void;
}

const CATEGORIES: Array<{ value: AgentCategory; label: string }> = [
  { value: 'lawyer', label: 'Lawyer' },
  { value: 'specialist', label: 'Specialist' },
  { value: 'infrastructure', label: 'Infrastructure' },
  { value: 'orchestrator', label: 'Orchestrator' },
];

const SENIORITIES: Array<{ value: SeniorityTier; label: string }> = [
  { value: 'associate', label: 'Associate' },
  { value: 'senior-associate', label: 'Senior Associate' },
  { value: 'partner', label: 'Partner' },
  { value: 'specialist', label: 'Specialist' },
  { value: 'counsel', label: 'Counsel' },
];

export function IdentityStep({ state, onUpdateField, onApplyPreset }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Section header */}
      <div>
        <h3 style={{
          fontSize: 20,
          fontFamily: fonts.serif,
          fontWeight: 600,
          color: colors.text,
          margin: 0,
          marginBottom: 4,
        }}>
          Choose Your Archetype
        </h3>
        <p style={{
          fontSize: 12,
          fontFamily: fonts.sans,
          color: colors.textMuted,
          margin: 0,
        }}>
          Start with a template or build from scratch. Everything can be customized.
        </p>
      </div>

      {/* Preset cards grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
        gap: 10,
      }}>
        {ARCHETYPE_PRESETS.map(preset => {
          const isSelected = state.presetId === preset.id;
          const ovr = calculateOVR(preset.skills);
          const tier = ovrToCostTier(ovr);

          return (
            <button
              key={preset.id}
              onClick={() => onApplyPreset(preset.id)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: 4,
                padding: 12,
                border: `1.5px solid ${isSelected ? colors.text : colors.border}`,
                borderRadius: radii.lg,
                backgroundColor: isSelected ? colors.bgPanel : colors.bgCard,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                textAlign: 'left',
                boxShadow: isSelected ? `0 0 0 1px ${colors.text}` : 'none',
              }}
            >
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                width: '100%',
              }}>
                <span style={{ fontSize: 20 }}>{preset.emoji}</span>
                <span style={{
                  fontSize: 13,
                  fontFamily: fonts.sans,
                  fontWeight: 600,
                  color: colors.text,
                }}>
                  {preset.name}
                </span>
              </div>

              <span style={{
                fontSize: 10,
                fontFamily: fonts.sans,
                color: colors.textMuted,
                lineHeight: '14px',
              }}>
                {preset.tagline}
              </span>

              {preset.id !== 'blank' && (
                <div style={{
                  display: 'flex',
                  gap: 6,
                  marginTop: 2,
                }}>
                  <span style={{
                    fontSize: 9,
                    fontFamily: fonts.sans,
                    fontWeight: 600,
                    color: tierColor(tier),
                    textTransform: 'uppercase',
                  }}>
                    OVR {ovr}
                  </span>
                  <span style={{
                    fontSize: 9,
                    fontFamily: fonts.sans,
                    color: categoryColor(preset.category),
                    textTransform: 'capitalize',
                  }}>
                    {preset.category}
                  </span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Divider */}
      <div style={{
        height: 1,
        backgroundColor: colors.border,
      }} />

      {/* Identity fields */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Display Name */}
        <div>
          <label style={labelStyle}>Display Name *</label>
          <input
            type="text"
            value={state.displayName}
            onChange={e => onUpdateField('displayName', e.target.value)}
            placeholder="Give your agent a name..."
            maxLength={40}
            style={inputStyle}
          />
        </div>

        {/* Tagline */}
        <div>
          <label style={labelStyle}>Tagline</label>
          <input
            type="text"
            value={state.tagline}
            onChange={e => onUpdateField('tagline', e.target.value)}
            placeholder="A short description of your agent..."
            maxLength={80}
            style={inputStyle}
          />
        </div>

        {/* Category */}
        <div>
          <label style={labelStyle}>Category</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {CATEGORIES.map(cat => (
              <button
                key={cat.value}
                onClick={() => onUpdateField('category', cat.value)}
                style={{
                  fontSize: 12,
                  fontFamily: fonts.sans,
                  fontWeight: state.category === cat.value ? 600 : 400,
                  color: state.category === cat.value ? '#fff' : colors.textSecondary,
                  backgroundColor: state.category === cat.value ? categoryColor(cat.value) : colors.bgPanel,
                  border: `1px solid ${state.category === cat.value ? categoryColor(cat.value) : colors.border}`,
                  padding: '6px 14px',
                  borderRadius: radii.pill,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Seniority */}
        <div>
          <label style={labelStyle}>Seniority</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {SENIORITIES.map(sen => (
              <button
                key={sen.value}
                onClick={() => onUpdateField('seniority', sen.value)}
                style={{
                  fontSize: 12,
                  fontFamily: fonts.sans,
                  fontWeight: state.seniority === sen.value ? 600 : 400,
                  color: state.seniority === sen.value ? '#fff' : colors.textSecondary,
                  backgroundColor: state.seniority === sen.value ? colors.text : colors.bgPanel,
                  border: `1px solid ${state.seniority === sen.value ? colors.text : colors.border}`,
                  padding: '6px 14px',
                  borderRadius: radii.pill,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {sen.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontFamily: fonts.sans,
  fontWeight: 500,
  color: colors.textMuted,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  fontSize: 14,
  fontFamily: fonts.sans,
  color: colors.text,
  backgroundColor: colors.bgInput,
  border: `1px solid ${colors.border}`,
  borderRadius: radii.md,
  boxSizing: 'border-box',
};
