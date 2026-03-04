/**
 * DaemonPulse — Animated daemon status indicator.
 * Green dot with amber glow when running, grey when stopped.
 */

import { colors, fonts, radii, spacing } from '../../staffing/styles/tokens.js';

interface Props {
  running: boolean;
  installed: boolean;
  pid?: number;
  inverted?: boolean;
}

export function DaemonPulse({ running, installed, pid, inverted }: Props) {
  const textColor = inverted ? 'rgba(250, 249, 246, 0.6)' : colors.textSecondary;

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
      backgroundColor: inverted ? 'rgba(250, 249, 246, 0.06)' : colors.bgPanel,
      borderRadius: radii.pill,
      border: `1px solid ${inverted ? 'rgba(250, 249, 246, 0.1)' : colors.border}`,
    }}>
      <span style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        backgroundColor: running ? colors.success : colors.textMuted,
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
