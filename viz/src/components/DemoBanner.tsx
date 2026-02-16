/**
 * DemoBanner — Dismissible notification shown when the app falls back to demo mode.
 *
 * Displayed at the top of the app when an API call fails and the system
 * silently switches to locally-generated demo data. Ensures the user
 * always knows when they're seeing fake data vs. real results.
 */

import { useState } from 'react';
import { colors, fonts } from '../staffing/styles/tokens.js';

interface Props {
  reason?: string;
}

export function DemoBanner({ reason }: Props) {
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem('shem-demo-banner-dismissed') === '1'; }
    catch { return false; }
  });

  if (dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    try { sessionStorage.setItem('shem-demo-banner-dismissed', '1'); }
    catch { /* ignore */ }
  };

  return (
    <div style={styles.banner}>
      <div style={styles.content}>
        <span style={styles.icon}>&#x26A0;</span>
        <span style={styles.text}>
          Running in demo mode — API unavailable
          {reason ? ` (${reason})` : ''}
        </span>
      </div>
      <button
        onClick={handleDismiss}
        style={styles.dismiss}
        aria-label="Dismiss demo mode banner"
      >
        &#x2715;
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  banner: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 16px',
    backgroundColor: '#FFF3E0',
    borderBottom: `1px solid ${colors.border}`,
    fontFamily: fonts.sans,
    fontSize: 12,
    color: '#795548',
  },
  content: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  icon: {
    fontSize: 14,
  },
  text: {
    fontWeight: 500,
  },
  dismiss: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#795548',
    fontSize: 14,
    padding: '2px 6px',
    borderRadius: 4,
    lineHeight: 1,
  },
};
