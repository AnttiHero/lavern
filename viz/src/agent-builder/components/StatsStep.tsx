/**
 * StatsStep — Step 3: Skill sliders, personality axes, practice areas.
 *
 * Shows the overall rating prominently, 8 skill sliders (0-99 display),
 * 5 personality axes, archetype/workstyle text, practice area chips,
 * and strengths/limitations text areas.
 */

import { colors, fonts, radii } from '../../staffing/styles/tokens.js';
import { SkillSlider } from './SkillSlider.js';
import { PersonalitySlider } from './PersonalitySlider.js';
import { OverallRating } from './OverallRating.js';
import { PracticeAreaPicker } from './PracticeAreaPicker.js';
import type { BuilderState } from '../hooks/useAgentBuilder.js';
import type { SkillRatings, PersonalityAxis, CostTier } from '../../types/agent-profile.js';

interface Props {
  state: BuilderState;
  ovr: number;
  costTier: CostTier;
  billingRate: number;
  onUpdateField: <K extends keyof BuilderState>(key: K, value: BuilderState[K]) => void;
  onUpdateSkill: (skill: keyof SkillRatings, value: number) => void;
  onUpdatePersonality: (axis: PersonalityAxis, value: number) => void;
  onTogglePracticeArea: (area: string) => void;
}

const SKILL_LABELS: Array<{ key: keyof SkillRatings; label: string }> = [
  { key: 'precision', label: 'Precision' },
  { key: 'depth', label: 'Depth' },
  { key: 'research', label: 'Research' },
  { key: 'risk', label: 'Risk Analysis' },
  { key: 'negotiation', label: 'Negotiation' },
  { key: 'communication', label: 'Communication' },
  { key: 'creativity', label: 'Creativity' },
  { key: 'speed', label: 'Speed' },
];

const PERSONALITY_AXES: Array<{ axis: PersonalityAxis; left: string; right: string }> = [
  { axis: 'conservative-vs-creative', left: 'Conservative', right: 'Creative' },
  { axis: 'thorough-vs-fast', left: 'Thorough', right: 'Fast' },
  { axis: 'risk-averse-vs-tolerant', left: 'Risk-averse', right: 'Tolerant' },
  { axis: 'formal-vs-approachable', left: 'Formal', right: 'Approachable' },
  { axis: 'adversarial-vs-collaborative', left: 'Adversarial', right: 'Collaborative' },
];

export function StatsStep({
  state, ovr, costTier, billingRate,
  onUpdateField, onUpdateSkill, onUpdatePersonality, onTogglePracticeArea,
}: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* OVR */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        padding: '8px 0',
      }}>
        <OverallRating ovr={ovr} costTier={costTier} billingRate={billingRate} />
      </div>

      {/* Skills section */}
      <div>
        <h3 style={sectionTitleStyle}>Skills</h3>
        <p style={sectionDescStyle}>
          Drag sliders to set each skill rating (0-99). Higher skills increase the overall rating.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
          {SKILL_LABELS.map(({ key, label }) => (
            <SkillSlider
              key={key}
              skill={key}
              label={label}
              value={state.skills[key]}
              onChange={onUpdateSkill}
            />
          ))}
        </div>
      </div>

      {/* Personality section */}
      <div>
        <h3 style={sectionTitleStyle}>Personality</h3>
        <p style={sectionDescStyle}>
          Position each axis to define your agent&apos;s working style.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
          {PERSONALITY_AXES.map(({ axis, left, right }) => (
            <PersonalitySlider
              key={axis}
              axis={axis}
              leftLabel={left}
              rightLabel={right}
              value={state.personality[axis]}
              onChange={onUpdatePersonality}
            />
          ))}
        </div>
      </div>

      {/* Archetype + Work Style */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={labelStyle}>Archetype Name</label>
          <input
            type="text"
            value={state.archetype}
            onChange={e => onUpdateField('archetype', e.target.value)}
            placeholder="e.g. The Strategist, The Closer..."
            maxLength={40}
            style={inputStyle}
          />
        </div>

        <div>
          <label style={labelStyle}>Work Style</label>
          <textarea
            value={state.workStyle}
            onChange={e => onUpdateField('workStyle', e.target.value)}
            placeholder="Describe how this agent approaches work..."
            maxLength={200}
            rows={2}
            style={{
              ...inputStyle,
              resize: 'vertical',
              minHeight: 50,
            }}
          />
        </div>
      </div>

      {/* Practice Areas */}
      <div>
        <h3 style={sectionTitleStyle}>Practice Areas</h3>
        <p style={sectionDescStyle}>
          Select areas of expertise (shown on the card back).
        </p>
        <div style={{ marginTop: 8 }}>
          <PracticeAreaPicker
            selected={state.practiceAreas}
            onToggle={onTogglePracticeArea}
          />
        </div>
      </div>

      {/* Strengths + Limitations */}
      <div style={{ display: 'flex', gap: 16 }}>
        <div style={{ flex: 1 }}>
          <label style={{ ...labelStyle, color: colors.success }}>Strengths</label>
          <textarea
            value={state.strengths.join('\n')}
            onChange={e => onUpdateField('strengths', e.target.value.split('\n').filter(s => s.trim()))}
            placeholder="One per line..."
            rows={3}
            style={{
              ...inputStyle,
              resize: 'vertical',
              minHeight: 60,
            }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ ...labelStyle, color: colors.warning }}>Limitations</label>
          <textarea
            value={state.limitations.join('\n')}
            onChange={e => onUpdateField('limitations', e.target.value.split('\n').filter(s => s.trim()))}
            placeholder="One per line..."
            rows={3}
            style={{
              ...inputStyle,
              resize: 'vertical',
              minHeight: 60,
            }}
          />
        </div>
      </div>
    </div>
  );
}

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 18,
  fontFamily: fonts.serif,
  fontWeight: 600,
  color: colors.text,
  margin: 0,
};

const sectionDescStyle: React.CSSProperties = {
  fontSize: 12,
  fontFamily: fonts.sans,
  color: colors.textMuted,
  margin: '4px 0 0 0',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 10,
  fontFamily: fonts.sans,
  fontWeight: 500,
  color: colors.textMuted,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  fontSize: 13,
  fontFamily: fonts.sans,
  color: colors.text,
  backgroundColor: colors.bgInput,
  border: `1px solid ${colors.border}`,
  borderRadius: radii.md,
  boxSizing: 'border-box',
};
