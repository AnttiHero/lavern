/**
 * WorkingHeader — Top bar for the working screen.
 *
 * Shows: logo, title, connection status, session ID, replay controls, cost meter,
 * and navigation (back/skip).
 */

import { useState } from 'react';
import type { ConnectionStatus } from '../../connection/ws-client.js';
import { colors, fonts, radii } from '../../staffing/styles/tokens.js';

interface WorkingHeaderProps {
  connectionStatus: ConnectionStatus;
  sessionId?: string;
  cost?: { accumulated: number; budget: number };
  isReplay: boolean;
  replayPaused: boolean;
  replaySpeed: number;
  onPause: () => void;
  onResume: () => void;
  onSetSpeed: (speed: number) => void;
  onDisconnect: () => void;
  onConnectSession: (id: string) => void;
  onBack: () => void;
  onSkip: () => void;
  certaintyPct?: number;
}

const STATUS_COLORS: Record<ConnectionStatus, string> = {
  disconnected: colors.danger,
  connecting: colors.warning,
  connected: colors.success,
  reconnecting: colors.warning,
};

export function WorkingHeader({
  connectionStatus,
  sessionId,
  cost,
  isReplay,
  replayPaused,
  replaySpeed,
  onPause,
  onResume,
  onSetSpeed,
  onDisconnect,
  onConnectSession,
  onBack,
  onSkip,
  certaintyPct,
}: WorkingHeaderProps) {
  const [inputId, setInputId] = useState('');

  return (
    <div style={styles.container}>
      {/* Left: back + title + status */}
      <div style={styles.left}>
        <button
          onClick={onBack}
          style={styles.navButton}
          onMouseEnter={e => { const b = e.currentTarget; b.style.backgroundColor = colors.text; b.style.color = '#fff'; }}
          onMouseLeave={e => { const b = e.currentTarget; b.style.backgroundColor = 'transparent'; b.style.color = colors.text; }}
        >&larr; Back</button>
        <span style={styles.divider} />
        <span style={styles.title}>Marble</span>
        <div style={{ ...styles.statusDot, backgroundColor: STATUS_COLORS[connectionStatus] }} />
        <span style={styles.statusText}>{connectionStatus}</span>
        {sessionId && <span style={styles.sessionId}>{sessionId}</span>}
      </div>

      {/* Center: connection or replay controls */}
      <div style={styles.center}>
        {connectionStatus === 'disconnected' ? (
          <>
            <input
              type="text"
              placeholder="Session ID..."
              value={inputId}
              onChange={e => setInputId(e.target.value)}
              style={styles.input}
            />
            <button
              onClick={() => inputId && onConnectSession(inputId)}
              style={styles.btnPrimary}
            >
              Connect
            </button>
          </>
        ) : (
          <>
            {isReplay && (
              <>
                <button
                  onClick={replayPaused ? onResume : onPause}
                  style={styles.btnPrimary}
                >
                  {replayPaused ? '\u25B6 Play' : '\u23F8 Pause'}
                </button>
                <span style={styles.speedLabel}>Speed:</span>
                {[0.5, 1, 2, 5].map(s => (
                  <button
                    key={s}
                    onClick={() => onSetSpeed(s)}
                    style={{
                      ...styles.speedBtn,
                      backgroundColor: replaySpeed === s ? colors.text : colors.bgPanel,
                      color: replaySpeed === s ? '#fff' : colors.textSecondary,
                    }}
                  >
                    {s}x
                  </button>
                ))}
              </>
            )}
            <button onClick={onDisconnect} style={styles.btnDanger}>Disconnect</button>
          </>
        )}
      </div>

      {/* Right: certainty + cost + skip */}
      <div style={styles.right}>
        <div style={styles.certaintyBadge}>
          <div style={{
            ...styles.certaintyDot,
            backgroundColor: certaintyPct == null ? colors.textDim
              : certaintyPct >= 85 ? colors.success
              : certaintyPct >= 70 ? colors.warning
              : colors.danger,
          }} />
          <span style={styles.certaintyValue}>
            {certaintyPct != null ? `${certaintyPct}%` : '\u2013\u2013'}
          </span>
          <span style={styles.certaintyLabel}>Certainty</span>
        </div>
        {cost && (
          <div style={styles.costMeter}>
            <span style={styles.costLabel}>Cost</span>
            <div style={styles.costBar}>
              <div
                style={{
                  ...styles.costFill,
                  width: `${Math.min(100, (cost.accumulated / cost.budget) * 100)}%`,
                  backgroundColor:
                    cost.accumulated / cost.budget > 0.9 ? colors.danger :
                    cost.accumulated / cost.budget > 0.7 ? colors.warning : colors.success,
                }}
              />
            </div>
            <span style={styles.costText}>
              ${cost.accumulated.toFixed(2)} / ${cost.budget.toFixed(2)}
            </span>
          </div>
        )}
        <button
          onClick={onSkip}
          style={styles.navButton}
          onMouseEnter={e => { const b = e.currentTarget; b.style.backgroundColor = colors.text; b.style.color = '#fff'; }}
          onMouseLeave={e => { const b = e.currentTarget; b.style.backgroundColor = 'transparent'; b.style.color = colors.text; }}
        >Skip &rarr;</button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100%',
    height: 60,
    backgroundColor: colors.bgCard,
    borderBottom: `1.5px solid ${colors.border}`,
    display: 'flex',
    alignItems: 'center',
    padding: '0 24px',
    gap: 14,
    flexShrink: 0,
  },
  left: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    minWidth: 240,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontFamily: fonts.serif,
    fontWeight: 300,
    letterSpacing: -0.3,
  },
  divider: {
    width: 1,
    height: 20,
    backgroundColor: colors.border,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: '50%',
    flexShrink: 0,
  },
  statusText: {
    fontSize: 11,
    color: colors.textMuted,
    fontFamily: fonts.sans,
    fontWeight: 500,
    textTransform: 'capitalize' as const,
  },
  sessionId: {
    fontSize: 10,
    color: colors.textDim,
    fontFamily: fonts.mono,
    maxWidth: 120,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  center: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  right: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    minWidth: 200,
    justifyContent: 'flex-end',
  },
  navButton: {
    background: 'none',
    border: `1.5px solid ${colors.text}`,
    borderRadius: radii.sm,
    color: colors.text,
    fontFamily: fonts.sans,
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    padding: '5px 14px',
    cursor: 'pointer',
    transition: 'background-color 0.25s ease, color 0.25s ease, border-color 0.25s ease',
    whiteSpace: 'nowrap' as const,
  },
  input: {
    backgroundColor: colors.bgInput,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.sm,
    color: colors.text,
    fontFamily: fonts.sans,
    fontSize: 12,
    padding: '5px 10px',
    width: 200,
    outline: 'none',
  },
  btnPrimary: {
    backgroundColor: colors.text,
    border: `1.5px solid ${colors.text}`,
    borderRadius: radii.sm,
    color: '#fff',
    fontFamily: fonts.sans,
    fontSize: 10,
    fontWeight: 600,
    padding: '6px 14px',
    cursor: 'pointer',
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
  },
  btnDanger: {
    backgroundColor: 'transparent',
    border: `1px solid ${colors.danger}`,
    borderRadius: radii.sm,
    color: colors.danger,
    fontFamily: fonts.sans,
    fontSize: 11,
    fontWeight: 500,
    padding: '5px 14px',
    cursor: 'pointer',
  },
  speedLabel: {
    fontSize: 11,
    color: colors.textMuted,
    fontFamily: fonts.sans,
    fontWeight: 500,
  },
  speedBtn: {
    border: 'none',
    borderRadius: radii.sm,
    fontFamily: fonts.sans,
    fontSize: 10,
    fontWeight: 500,
    padding: '4px 8px',
    cursor: 'pointer',
    transition: 'background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease',
  },
  costMeter: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  costLabel: {
    fontSize: 10,
    color: colors.textMuted,
    fontFamily: fonts.sans,
    fontWeight: 600,
    letterSpacing: 0.3,
    textTransform: 'uppercase' as const,
  },
  costBar: {
    width: 60,
    height: 5,
    backgroundColor: colors.bgPanel,
    borderRadius: 3,
    overflow: 'hidden',
  },
  costFill: {
    height: '100%',
    borderRadius: 3,
    transition: 'width 0.3s ease',
  },
  costText: {
    fontSize: 10,
    color: colors.textDim,
    fontFamily: fonts.mono,
  },
  certaintyBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    padding: '3px 10px',
    borderRadius: radii.sm,
    border: `1px solid ${colors.border}`,
    backgroundColor: colors.bgPanel,
  },
  certaintyDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    flexShrink: 0,
    transition: 'background-color 0.3s ease',
  },
  certaintyValue: {
    fontSize: 11,
    fontFamily: fonts.mono,
    fontWeight: 600,
    color: colors.text,
  },
  certaintyLabel: {
    fontSize: 9,
    fontFamily: fonts.sans,
    fontWeight: 600,
    color: colors.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.4,
  },
};
