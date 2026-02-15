/**
 * SeniorityBadge — seniority level pill (partner, senior-associate, etc.).
 * Muted editorial tones.
 */

import { fonts, radii, colors } from '../styles/tokens.js';

interface Props {
  seniority: string;
}

const seniorityDisplay: Record<string, string> = {
  partner: 'Partner',
  'senior-associate': 'Senior',
  associate: 'Associate',
  junior: 'Junior',
  specialist: 'Specialist',
};

const seniorityColors: Record<string, string> = {
  partner: colors.text,
  'senior-associate': colors.textSecondary,
  associate: colors.textMuted,
  junior: colors.textDim,
  specialist: colors.lawyer,
};

export function SeniorityBadge({ seniority }: Props) {
  const color = seniorityColors[seniority] ?? colors.textMuted;
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 3,
      padding: '2px 7px',
      borderRadius: radii.pill,
      backgroundColor: colors.bgPanel,
      color,
      fontSize: 10,
      fontFamily: fonts.sans,
      fontWeight: 500,
      lineHeight: '16px',
    }}>
      {seniority === 'partner' && <span style={{ fontSize: 8 }}>{'\u2605'}</span>}
      {seniorityDisplay[seniority] ?? seniority}
    </span>
  );
}
