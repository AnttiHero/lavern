/**
 * SectionHeader — Visual group divider between agent sections.
 *
 * Optionally collapsible. Editorial-style label + count badge.
 * Thin bottom border, sentence case, warm tones.
 */

import { colors, fonts, spacing, radii } from '../styles/tokens.js';

interface Props {
  title: string;
  subtitle: string;
  count: number;
  accentColor?: string;
  /** If provided, section is collapsible. */
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  /** Number of selected agents in this section. */
  selectedCount?: number;
}

export function SectionHeader({ title, subtitle, count, accentColor, collapsed, onToggleCollapse, selectedCount }: Props) {
  const accent = accentColor ?? colors.text;
  const isCollapsible = onToggleCollapse != null;

  return (
    <div
      onClick={isCollapsible ? onToggleCollapse : undefined}
      role={isCollapsible ? 'button' : undefined}
      aria-expanded={isCollapsible ? !collapsed : undefined}
      tabIndex={isCollapsible ? 0 : undefined}
      onKeyDown={isCollapsible ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleCollapse!(); } } : undefined}
      style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: spacing.md,
        padding: `${spacing.xl}px 0 ${spacing.sm}px`,
        borderBottom: `1px solid ${colors.border}`,
        marginBottom: spacing.md,
        cursor: isCollapsible ? 'pointer' : undefined,
        userSelect: isCollapsible ? 'none' : undefined,
      }}
    >
      {/* Collapse chevron */}
      {isCollapsible && (
        <span style={{
          fontSize: 10,
          color: colors.textDim,
          transition: 'transform 0.2s ease',
          transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
          display: 'inline-block',
        }}>
          {'\u25BE'}
        </span>
      )}

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

      {/* Selected indicator */}
      {selectedCount != null && selectedCount > 0 && (
        <span style={{
          fontSize: 10,
          fontFamily: fonts.sans,
          fontWeight: 600,
          color: colors.accent,
          letterSpacing: 0.5,
        }}>
          {selectedCount} selected
        </span>
      )}

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
