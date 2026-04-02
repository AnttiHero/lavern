/**
 * CommandStrip — Persistent control bar: scan trigger + pause/resume + last scan + budget compact.
 */

import { fonts, radii, spacing } from '../../staffing/styles/tokens.js';
import { CLAW } from '../theme.js';

/** EU sovereign blue — same as ProviderToggle / ConfigTab. */
const EU_COLOR = '#2E5D9C';
const PAUSE_COLOR = '#FF9800';
const RESUME_COLOR = '#4CAF50';

interface Props {
  lastScan: string;
  scanning: boolean;
  budget: { spentUsd: number; totalUsd: number; exhausted: boolean };
  onScan: () => void;
  paused?: boolean;
  onTogglePause?: () => void;
  demoMode: boolean;
  demoPlaying?: boolean;
  onWatchDemo?: () => void;
  ethicalMode?: boolean;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function CommandStrip({ lastScan, scanning, budget, onScan, paused, onTogglePause, demoMode, demoPlaying, onWatchDemo, ethicalMode }: Props) {
  const pauseBtnColor = paused ? RESUME_COLOR : PAUSE_COLOR;

  return (
    <div style={styles.strip}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={styles.scanTime}>
          Last scan: {timeAgo(lastScan)}
        </span>
        {ethicalMode && (
          <span style={styles.ethicalBadge}>
            {'\uD83D\uDEE1\uFE0F'} ETHICAL
          </span>
        )}
        {paused && (
          <span style={styles.pausedBadge} aria-label="Processing paused">
            {'\u23F8'} PAUSED
          </span>
        )}
      </div>

      <div style={styles.right}>
        <span style={styles.budgetCompact}>
          <span style={{
            color: budget.exhausted ? CLAW.danger : CLAW.textSecondary,
            fontWeight: budget.exhausted ? 600 : 400,
          }}>
            ${budget.spentUsd.toFixed(2)}
          </span>
          <span style={{ color: CLAW.textDim }}> / ${budget.totalUsd.toFixed(2)}</span>
        </span>

        {demoMode && onWatchDemo && (
          <button
            onClick={onWatchDemo}
            disabled={demoPlaying}
            style={{
              ...styles.scanBtn,
              opacity: demoPlaying ? 0.4 : 1,
              cursor: demoPlaying ? 'default' : 'pointer',
            }}
            onMouseEnter={e => {
              if (demoPlaying) return;
              e.currentTarget.style.backgroundColor = CLAW.amber;
              e.currentTarget.style.color = '#080808';
            }}
            onMouseLeave={e => {
              if (demoPlaying) return;
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = CLAW.amber;
            }}
          >
            {demoPlaying ? 'Playing\u2026' : 'Watch Demo'}
          </button>
        )}

        {onTogglePause && (
          <button
            onClick={onTogglePause}
            aria-label={paused ? 'Resume processing' : 'Pause processing'}
            style={{
              ...styles.scanBtn,
              borderColor: pauseBtnColor,
              color: pauseBtnColor,
            }}
            onMouseEnter={e => {
              e.currentTarget.style.backgroundColor = pauseBtnColor;
              e.currentTarget.style.color = '#fff';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = pauseBtnColor;
            }}
          >
            {paused ? 'Resume' : 'Pause'}
          </button>
        )}

        <button
          onClick={onScan}
          disabled={scanning || demoMode || !!paused}
          style={{
            ...styles.scanBtn,
            opacity: scanning || demoMode || paused ? 0.4 : 1,
            cursor: scanning || demoMode || paused ? 'default' : 'pointer',
          }}
          onMouseEnter={e => {
            if (scanning || demoMode || paused) return;
            e.currentTarget.style.backgroundColor = CLAW.amber;
            e.currentTarget.style.color = '#080808';
          }}
          onMouseLeave={e => {
            if (scanning || demoMode || paused) return;
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = CLAW.amber;
          }}
        >
          {scanning ? 'Scanning...' : 'Scan Now'}
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  strip: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: `${spacing.sm}px ${spacing.lg}px`,
    backgroundColor: CLAW.surface,
    border: `1px solid ${CLAW.border}`,
    borderRadius: radii.md,
    marginBottom: spacing.md,
    flexWrap: 'wrap' as const,
    gap: 8,
  },
  scanTime: {
    fontSize: 12,
    fontFamily: fonts.sans,
    color: CLAW.textDim,
  },
  right: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.md,
    flexWrap: 'wrap' as const,
  },
  budgetCompact: {
    fontSize: 12,
    fontFamily: fonts.mono,
    color: CLAW.textSecondary,
  },
  ethicalBadge: {
    fontSize: 9,
    fontFamily: fonts.sans,
    fontWeight: 700,
    letterSpacing: 1,
    color: EU_COLOR,
    backgroundColor: 'rgba(46, 93, 156, 0.08)',
    border: `1px solid rgba(46, 93, 156, 0.2)`,
    borderRadius: radii.sm,
    padding: '3px 8px',
    whiteSpace: 'nowrap' as const,
  },
  pausedBadge: {
    fontSize: 9,
    fontFamily: fonts.sans,
    fontWeight: 700,
    letterSpacing: 1,
    color: PAUSE_COLOR,
    backgroundColor: 'rgba(255, 152, 0, 0.08)',
    border: '1px solid rgba(255, 152, 0, 0.2)',
    borderRadius: radii.sm,
    padding: '3px 8px',
    whiteSpace: 'nowrap' as const,
  },
  scanBtn: {
    padding: '5px 14px',
    borderRadius: radii.sm,
    border: `1.5px solid ${CLAW.amber}`,
    backgroundColor: 'transparent',
    color: CLAW.amber,
    fontFamily: fonts.sans,
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    transition: 'background-color 0.25s ease, color 0.25s ease',
  },
};
