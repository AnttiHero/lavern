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

  return (
    <div style={styles.overlay}>
      <SessionList
        onConnectSession={onConnectSession}
        onConnectReplay={onConnectReplay}
        onBeginEngagement={onBeginEngagement}
      />

      {/* Demo button — bottom center */}
      <div style={styles.demoRow}>
        <button
          onClick={handleWatchDemo}
          style={styles.demoButton}
          onMouseEnter={e => { const b = e.currentTarget; b.style.backgroundColor = colors.text; b.style.color = '#fff'; }}
          onMouseLeave={e => { const b = e.currentTarget; b.style.backgroundColor = 'transparent'; b.style.color = colors.textMuted; }}
        >
          Watch Demo
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
    justifyContent: 'center',
    padding: '24px 0 40px',
    flexShrink: 0,
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
