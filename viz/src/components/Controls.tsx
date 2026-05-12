/**
 * Controls — Connection UI and replay controls.
 *
 * Warm editorial design — Inter font, white bar, muted accents.
 * In live mode: session selector, connection status.
 * In replay mode: play/pause, speed, seek.
 */

import { useState } from 'react';
import type { ConnectionStatus } from '../connection/ws-client.js';
import { colors, fonts, radii } from '../staffing/styles/tokens.js';

interface ControlsProps {
  connectionStatus: ConnectionStatus;
  onConnectSession: (sessionId: string) => void;
  onConnectReplay: (sessionId: string) => void;
  onDisconnect: () => void;
  replayControls?: {
    onPause: () => void;
    onResume: () => void;
    onSetSpeed: (speed: number) => void;
    speed: number;
    paused: boolean;
  };
  sessionId?: string;
  cost?: { accumulated: number; budget: number };
}

export function Controls({
  connectionStatus,
  onConnectSession,
  onConnectReplay,
  onDisconnect,
  replayControls,
  sessionId,
  cost,
}: ControlsProps) {
  const [inputSessionId, setInputSessionId] = useState('');

  const statusColors: Record<ConnectionStatus, string> = {
    disconnected: colors.danger,
    connecting: colors.warning,
    connected: colors.success,
    reconnecting: colors.warning,
  };

  return (
    <div style={styles.container}>
      {/* Left: Title + Status */}
      <div style={styles.leftSection}>
        <span style={{ fontFamily: fonts.serif, fontSize: 20, fontWeight: 300, color: colors.text, lineHeight: 1 }}>L</span>
        <span style={styles.title}>Lavern</span>
        <div
          style={{
            ...styles.statusDot,
            backgroundColor: statusColors[connectionStatus],
          }}
        />
        <span style={styles.statusText}>{connectionStatus}</span>
        {sessionId && (
          <span style={styles.sessionId}>{sessionId}</span>
        )}
      </div>

      {/* Center: Connection / Replay controls */}
      <div style={styles.centerSection}>
        {connectionStatus === 'disconnected' ? (
          <>
            <input
              type="text"
              placeholder="Session ID..."
              value={inputSessionId}
              onChange={(e) => setInputSessionId(e.target.value)}
              style={styles.input}
            />
            <button
              onClick={() => inputSessionId && onConnectSession(inputSessionId)}
              style={styles.buttonPrimary}
              onMouseEnter={e => { const b = e.currentTarget; b.style.backgroundColor = 'transparent'; b.style.color = colors.text; }}
              onMouseLeave={e => { const b = e.currentTarget; b.style.backgroundColor = colors.text; b.style.color = '#fff'; }}
            >
              Connect
            </button>
            <button
              onClick={() => inputSessionId && onConnectReplay(inputSessionId)}
              style={styles.buttonSecondary}
              onMouseEnter={e => { const b = e.currentTarget; b.style.backgroundColor = colors.text; b.style.color = '#fff'; }}
              onMouseLeave={e => { const b = e.currentTarget; b.style.backgroundColor = 'transparent'; b.style.color = colors.text; }}
            >
              Replay
            </button>
</>
        ) : (
          <>
            {replayControls && (
              <>
                <button
                  onClick={replayControls.paused ? replayControls.onResume : replayControls.onPause}
                  style={styles.buttonPrimary}
                  onMouseEnter={e => { const b = e.currentTarget; b.style.backgroundColor = 'transparent'; b.style.color = colors.text; }}
                  onMouseLeave={e => { const b = e.currentTarget; b.style.backgroundColor = colors.text; b.style.color = '#fff'; }}
                >
                  {replayControls.paused ? '\u25B6 Play' : '\u23F8 Pause'}
                </button>
                <span style={styles.speedLabel}>Speed:</span>
                {[0.5, 1, 2, 5].map((speed) => (
                  <button
                    key={speed}
                    onClick={() => replayControls.onSetSpeed(speed)}
                    style={{
                      ...styles.speedButton,
                      backgroundColor: replayControls.speed === speed ? colors.text : colors.bgPanel,
                      color: replayControls.speed === speed ? '#fff' : colors.textSecondary,
                    }}
                  >
                    {speed}x
                  </button>
                ))}
              </>
            )}
            <button onClick={onDisconnect} style={styles.buttonDanger}
              onMouseEnter={e => { const b = e.currentTarget; b.style.backgroundColor = colors.danger; b.style.color = '#fff'; }}
              onMouseLeave={e => { const b = e.currentTarget; b.style.backgroundColor = 'transparent'; b.style.color = colors.danger; }}
            >
              Disconnect
            </button>
          </>
        )}
      </div>

      {/* Right: Cost meter */}
      <div style={styles.rightSection}>
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
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100%',
    height: 48,
    backgroundColor: colors.bgCard,
    borderBottom: `1px solid ${colors.border}`,
    display: 'flex',
    alignItems: 'center',
    padding: '0 16px',
    gap: 12,
    flexShrink: 0,
  },
  leftSection: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    minWidth: 200,
  },
  title: {
    color: colors.text,
    fontSize: 14,
    fontFamily: fonts.sans,
    fontWeight: 600,
    letterSpacing: -0.2,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: '50%',
  },
  statusText: {
    fontSize: 11,
    color: colors.textMuted,
    fontFamily: fonts.sans,
    fontWeight: 500,
    textTransform: 'capitalize',
  },
  sessionId: {
    fontSize: 10,
    color: colors.textDim,
    fontFamily: fonts.mono,
    maxWidth: 120,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  centerSection: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
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
    transition: 'border-color 0.15s ease',
  },
  buttonPrimary: {
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
    transition: 'background-color 0.25s ease, color 0.25s ease, border-color 0.25s ease',
  },
  buttonSecondary: {
    backgroundColor: 'transparent',
    border: `1.5px solid ${colors.text}`,
    borderRadius: radii.sm,
    color: colors.text,
    fontFamily: fonts.sans,
    fontSize: 10,
    fontWeight: 600,
    padding: '5px 14px',
    cursor: 'pointer',
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
    transition: 'background-color 0.25s ease, color 0.25s ease, border-color 0.25s ease',
  },
  buttonDanger: {
    backgroundColor: 'transparent',
    border: `1.5px solid ${colors.danger}`,
    borderRadius: radii.sm,
    color: colors.danger,
    fontFamily: fonts.sans,
    fontSize: 11,
    fontWeight: 500,
    padding: '5px 14px',
    cursor: 'pointer',
    transition: 'background-color 0.25s ease, color 0.25s ease, border-color 0.25s ease',
  },
  speedLabel: {
    fontSize: 11,
    color: colors.textMuted,
    fontFamily: fonts.sans,
    fontWeight: 500,
  },
  speedButton: {
    border: 'none',
    borderRadius: radii.sm,
    fontFamily: fonts.sans,
    fontSize: 10,
    fontWeight: 500,
    padding: '4px 8px',
    cursor: 'pointer',
    transition: 'background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease',
  },
  rightSection: {
    display: 'flex',
    alignItems: 'center',
    minWidth: 180,
    justifyContent: 'flex-end',
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
    textTransform: 'uppercase',
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
};
