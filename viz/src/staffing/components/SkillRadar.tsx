/**
 * SkillRadar — Compact Recharts RadarChart showing 8 skill dimensions.
 * Editorial palette — muted fill, warm grid lines.
 */

import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
  ResponsiveContainer,
} from 'recharts';
import { tierColor, fonts } from '../styles/tokens.js';

interface Skills {
  precision: number;
  creativity: number;
  speed: number;
  depth: number;
  negotiation: number;
  communication: number;
  research: number;
  risk: number;
}

interface Props {
  skills: Skills;
  costTier: string;
  size?: number;
}

const axes = [
  { key: 'precision', label: 'PRE' },
  { key: 'creativity', label: 'CRE' },
  { key: 'speed', label: 'SPD' },
  { key: 'depth', label: 'DEP' },
  { key: 'negotiation', label: 'NEG' },
  { key: 'communication', label: 'COM' },
  { key: 'research', label: 'RES' },
  { key: 'risk', label: 'RSK' },
] as const;

export function SkillRadar({ skills, costTier, size = 140 }: Props) {
  const data = axes.map(a => ({
    axis: a.label,
    value: skills[a.key],
  }));

  const fillColor = tierColor(costTier);

  return (
    <div style={{ width: size, height: size, margin: '0 auto' }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} cx="50%" cy="50%" outerRadius="75%">
          <PolarGrid stroke="#E5E3DD" strokeWidth={0.5} />
          <PolarAngleAxis
            dataKey="axis"
            tick={{ fontSize: 8, fill: '#A3A39E', fontFamily: fonts.sans }}
          />
          <Radar
            name="Skills"
            dataKey="value"
            stroke={fillColor}
            fill={fillColor}
            fillOpacity={0.15}
            strokeWidth={1.5}
            dot={false}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
