/**
 * OfflineBanner — Fixed amber bar shown when the browser is offline.
 *
 * Similar to DemoBanner but non-dismissible (disappears automatically
 * when connectivity is restored).
 */

import { colors, fonts } from '../staffing/styles/tokens.js';

export function OfflineBanner() {
  return (
    <div role="alert" style={styles.banner}>
      <div style={styles.content}>
        <span style={styles.icon} aria-hidden="true">&#x26A0;</span>
        <span style={styles.text}>
          You appear to be offline. Some features may be unavailable until your connection is restored.
        </span>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  banner: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10001,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '10px 16px',
    backgroundColor: '#FFF3E0',
    borderBottom: `2px solid #FF9800`,
    fontFamily: fonts.sans,
    fontSize: 13,
    color: '#E65100',
  },
  content: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  icon: {
    fontSize: 16,
  },
  text: {
    fontWeight: 600,
  },
};
