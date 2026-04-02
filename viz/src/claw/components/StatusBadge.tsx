/**
 * StatusBadge — Document status pill with semantic colors.
 */

import { radii } from '../../staffing/styles/tokens.js';
import { CLAW } from '../theme.js';

const BADGE_COLORS: Record<string, { bg: string; fg: string }> = {
  reviewed:   { bg: 'rgba(92, 158, 110, 0.12)', fg: CLAW.success },
  flagged:    { bg: CLAW.dangerBg, fg: CLAW.danger },
  new:        { bg: 'rgba(91, 163, 201, 0.1)', fg: '#5BA3C9' },
  queued:     { bg: 'rgba(91, 163, 201, 0.1)', fg: '#5BA3C9' },
  processing: { bg: CLAW.amberBg, fg: CLAW.amber },
  stale:      { bg: CLAW.amberBg, fg: CLAW.amber },
  error:      { bg: CLAW.dangerBg, fg: CLAW.danger },
  completed:  { bg: 'rgba(92, 158, 110, 0.12)', fg: CLAW.success },
  failed:     { bg: CLAW.dangerBg, fg: CLAW.danger },
  partial:    { bg: CLAW.amberBg, fg: CLAW.amber },
};

interface Props {
  status: string;
}

export function StatusBadge({ status }: Props) {
  const c = BADGE_COLORS[status] ?? { bg: CLAW.surface, fg: CLAW.textMuted };
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
