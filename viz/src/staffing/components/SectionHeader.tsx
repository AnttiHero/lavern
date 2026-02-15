/**
 * SectionHeader — Visual group divider between agent sections.
 *
 * Non-collapsible. Editorial-style label + count badge.
 * Thin bottom border, sentence case, warm tones.
 */

import { colors, fonts, spacing, radii } from '../styles/tokens.js';

interface Props {
  title: string;
  subtitle: string;
  count: number;
  accentColor?: string;
}

export function SectionHeader({ title, subtitle, count, accentColor }: Props) {
  const accent = accentColor ?? colors.text;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: spacing.md,
        padding: `${spacing.xl}px 0 ${spacing.sm}px`,
        borderBottom: `1px solid ${colors.border}`,
        marginBottom: spacing.md,
      }}
    >
      {/* Title */}
      <span style={{
        fontSize: 14,
        fontFamily: fonts.sans,
        fontWeight: 600,
        color: accent,
        letterSpacing: 0.5,
      }}>
        {title}
      </span>

      {/* Subtitle */}
      <span style={{
        fontSize: 12,
        fontFamily: fonts.sans,
        color: colors.textDim,
      }}>
        {subtitle}
      </span>

      {/* Spacer */}
      <span style={{ flex: 1 }} />

      {/* Count badge */}
      <span style={{
        fontSize: 11,
        fontFamily: fonts.sans,
        fontWeight: 500,
        color: colors.textMuted,
        backgroundColor: colors.bgPanel,
        borderRadius: radii.pill,
        padding: '2px 10px',
        whiteSpace: 'nowrap',
      }}>
        {count}
      </span>
    </div>
  );
}
