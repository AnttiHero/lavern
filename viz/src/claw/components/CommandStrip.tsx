/**
 * CommandStrip — Persistent control bar: scan trigger + last scan + budget compact.
 */

import { colors, fonts, radii, spacing } from '../../staffing/styles/tokens.js';

/** EU sovereign blue — same as ProviderToggle / ConfigTab. */
const EU_COLOR = '#2E5D9C';

interface Props {
  lastScan: string;
  scanning: boolean;
  budget: { spentUsd: number; totalUsd: number; exhausted: boolean };
  onScan: () => void;
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

export function CommandStrip({ lastScan, scanning, budget, onScan, demoMode, demoPlaying, onWatchDemo, ethicalMode }: Props) {
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
      </div>

      <div style={styles.right}>
        <span style={styles.budgetCompact}>
          <span style={{
            color: budget.exhausted ? colors.danger : colors.textSecondary,
            fontWeight: budget.exhausted ? 600 : 400,
          }}>
            ${budget.spentUsd.toFixed(2)}
          </span>
          <span style={{ color: colors.textDim }}> / ${budget.totalUsd.toFixed(2)}</span>
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
              e.currentTarget.style.backgroundColor = '#B8860B';
              e.currentTarget.style.color = '#fff';
            }}
            onMouseLeave={e => {
              if (demoPlaying) return;
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = '#B8860B';
            }}
          >
            {demoPlaying ? 'Playing\u2026' : 'Watch Demo'}
          </button>
        )}

        <button
          onClick={onScan}
          disabled={scanning || demoMode}
          style={{
            ...styles.scanBtn,
            opacity: scanning || demoMode ? 0.4 : 1,
            cursor: scanning || demoMode ? 'default' : 'pointer',
          }}
          onMouseEnter={e => {
            if (scanning || demoMode) return;
            e.currentTarget.style.backgroundColor = '#B8860B';
            e.currentTarget.style.color = '#fff';
          }}
          onMouseLeave={e => {
            if (scanning || demoMode) return;
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = '#B8860B';
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
    backgroundColor: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.md,
    marginBottom: spacing.md,
  },
  scanTime: {
    fontSize: 12,
    fontFamily: fonts.sans,
    color: colors.textDim,
  },
  right: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.md,
  },
  budgetCompact: {
    fontSize: 12,
    fontFamily: fonts.mono,
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
  scanBtn: {
    padding: '5px 14px',
    borderRadius: radii.sm,
    border: '1.5px solid #B8860B',
    backgroundColor: 'transparent',
    color: '#B8860B',
    fontFamily: fonts.sans,
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    transition: 'background-color 0.25s ease, color 0.25s ease',
  },
};
