/**
 * StatusBadge — Document status pill with semantic colors.
 */

import { colors, radii } from '../../staffing/styles/tokens.js';

const BADGE_COLORS: Record<string, { bg: string; fg: string }> = {
  reviewed:   { bg: 'rgba(74, 124, 80, 0.08)', fg: colors.success },
  flagged:    { bg: 'rgba(196, 93, 62, 0.1)', fg: colors.danger },
  new:        { bg: 'rgba(46, 125, 156, 0.08)', fg: '#2E7D9C' },
  queued:     { bg: 'rgba(46, 125, 156, 0.08)', fg: '#2E7D9C' },
  processing: { bg: 'rgba(184, 134, 11, 0.08)', fg: '#B8860B' },
  stale:      { bg: 'rgba(184, 134, 11, 0.08)', fg: '#B8860B' },
  error:      { bg: 'rgba(196, 93, 62, 0.1)', fg: colors.danger },
  completed:  { bg: 'rgba(74, 124, 80, 0.08)', fg: colors.success },
  failed:     { bg: 'rgba(196, 93, 62, 0.1)', fg: colors.danger },
  partial:    { bg: 'rgba(184, 134, 11, 0.08)', fg: '#B8860B' },
};

interface Props {
  status: string;
}

export function StatusBadge({ status }: Props) {
  const c = BADGE_COLORS[status] ?? { bg: colors.bgPanel, fg: colors.textMuted };
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: radii.pill,
      fontSize: 11,
      fontWeight: 600,
      backgroundColor: c.bg,
      color: c.fg,
      textTransform: 'uppercase',
      letterSpacing: '0.04em',
    }}>
      {status}
    </span>
  );
}
