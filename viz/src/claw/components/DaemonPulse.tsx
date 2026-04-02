/**
 * DaemonPulse — Animated daemon status indicator.
 * Green dot with amber glow when running, grey when stopped.
 */

import { fonts, radii } from '../../staffing/styles/tokens.js';
import { CLAW } from '../theme.js';

interface Props {
  running: boolean;
  installed: boolean;
  pid?: number;
  inverted?: boolean;
}

export function DaemonPulse({ running, installed, pid, inverted }: Props) {
  const textColor = inverted ? CLAW.textSecondary : CLAW.textSecondary;

  const label = running
    ? `Running${pid ? ` · PID ${pid}` : ''}`
    : installed
      ? 'Installed · Stopped'
      : 'Not installed';

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '6px 14px',
      backgroundColor: CLAW.surface,
      borderRadius: radii.pill,
      border: `1px solid ${CLAW.border}`,
    }}>
      <span style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        backgroundColor: running ? CLAW.success : CLAW.textMuted,
        animation: running ? 'clawDaemonPulse 2s ease-in-out infinite' : 'none',
        flexShrink: 0,
      }} />
      <span style={{
        fontSize: 11,
        fontFamily: fonts.sans,
        fontWeight: 500,
        color: textColor,
        whiteSpace: 'nowrap',
      }}>
        {label}
      </span>
    </div>
  );
}
