/**
 * SessionOverlay — Wraps the existing SessionList in a blur overlay.
 * Shown when the working screen is active but no session is connected.
 */

import { SessionList } from '../../components/SessionList.js';

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
  return (
    <div style={styles.overlay}>
      <SessionList
        onConnectSession={onConnectSession}
        onConnectReplay={onConnectReplay}
        onBeginEngagement={onBeginEngagement}
      />
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
  },
};
