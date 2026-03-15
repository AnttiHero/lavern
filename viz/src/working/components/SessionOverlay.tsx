/**
 * SessionOverlay — Wraps the existing SessionList in a blur overlay.
 * Shown when the working screen is active but no session is connected.
 *
 * v12: Added "Watch Demo" button to launch offline demo session.
 */

import { SessionList } from '../../components/SessionList.js';
import { colors, fonts, radii } from '../../staffing/styles/tokens.js';

interface SessionOverlayProps {
  onConnectSession: (id: string) => void;
  onConnectReplay: (id: string) => void;
  onBeginEngagement: () => void;
}

export function SessionOverlay({
  onConnectSession,
  onConnectReplay,
  onBeginEngagement,
}: SessionOverlayProps) {
  const handleWatchDemo = () => {
    onConnectSession(`demo-session-${Date.now()}`);
  };

  const handleHeartConnectDemo = () => {
    onConnectSession(`demo-session-heartconnect-${Date.now()}`);
  };

  return (
    <div style={styles.overlay}>
      <SessionList
        onConnectSession={onConnectSession}
        onConnectReplay={onConnectReplay}
        onBeginEngagement={onBeginEngagement}
      />

      {/* Demo buttons — bottom center */}
      <div style={styles.demoRow}>
        <button
          onClick={handleHeartConnectDemo}
          style={styles.vcDemoButton}
          onMouseEnter={e => { const b = e.currentTarget; b.style.backgroundColor = '#1a1a1a'; b.style.borderColor = '#1a1a1a'; }}
          onMouseLeave={e => { const b = e.currentTarget; b.style.backgroundColor = colors.text; b.style.borderColor = colors.text; }}
        >
          HeartConnect ToS Demo
        </button>
        <button
          onClick={handleWatchDemo}
          style={styles.demoButton}
          onMouseEnter={e => { const b = e.currentTarget; b.style.backgroundColor = colors.text; b.style.color = '#fff'; }}
          onMouseLeave={e => { const b = e.currentTarget; b.style.backgroundColor = 'transparent'; b.style.color = colors.textMuted; }}
        >
          Generic Demo
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'absolute' as const,
    inset: 0,
    zIndex: 9000,
    backgroundColor: 'rgba(250, 249, 246, 0.95)',
    backdropFilter: 'blur(8px)',
    overflow: 'auto',
    display: 'flex',
    flexDirection: 'column' as const,
  },
  demoRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: '24px 0 40px',
    flexShrink: 0,
  },
  vcDemoButton: {
    padding: '12px 32px',
    borderRadius: radii.lg,
    border: `2px solid ${colors.text}`,
    backgroundColor: colors.text,
    color: '#fff',
    fontFamily: fonts.sans,
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: 0.8,
    cursor: 'pointer',
    transition: 'background-color 0.25s ease, border-color 0.25s ease',
  },
  demoButton: {
    padding: '10px 24px',
    borderRadius: radii.lg,
    border: `1.5px solid ${colors.border}`,
    backgroundColor: 'transparent',
    color: colors.textMuted,
    fontFamily: fonts.sans,
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: 0.5,
    cursor: 'pointer',
    transition: 'background-color 0.25s ease, color 0.25s ease, border-color 0.25s ease',
  },
};
