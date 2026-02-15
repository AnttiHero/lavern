/**
 * CostTierBadge — opus, sonnet, haiku pill badge.
 * Muted editorial tones.
 */

import { tierColor, tierBg, fonts, radii } from '../styles/tokens.js';

interface Props {
  tier: string;
}

const tierLabels: Record<string, string> = {
  opus: 'Opus',
  sonnet: 'Sonnet',
  haiku: 'Haiku',
};

const tierIcons: Record<string, string> = {
  opus: '\u25C6',     // ◆ diamond
  sonnet: '\u25CF',   // ● circle
  haiku: '\u25B2',    // ▲ triangle
};

export function CostTierBadge({ tier }: Props) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      padding: '2px 8px',
      borderRadius: radii.pill,
      backgroundColor: tierBg(tier),
      color: tierColor(tier),
      fontSize: 10,
      fontFamily: fonts.sans,
      fontWeight: 500,
      lineHeight: '16px',
    }}>
      <span style={{ fontSize: 7 }}>{tierIcons[tier] ?? ''}</span>
      {tierLabels[tier] ?? tier}
    </span>
  );
}
