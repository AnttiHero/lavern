/**
 * VerificationBanner — Warm editorial nudge shown when the logged-in user
 * has not verified their email address.
 *
 * Design: matches the connection-lost / halt-error banner language —
 * warm amber with pulsing dot, Inter sans-serif, understated but visible.
 *
 * Dismissible per session (reappears on reload). Includes a "Resend"
 * button that POSTs to /api/auth/resend-verification with feedback states.
 */

import { useState, useCallback, useEffect } from 'react';
import { colors, fonts } from '../staffing/styles/tokens.js';

/** Slide-down entrance + pulsing dot keyframes (injected once). */
const STYLE_ID = 'shem-verify-banner-keyframes';
function ensureKeyframes() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes shemVerifySlideDown {
      from { transform: translateY(-100%); opacity: 0; }
      to   { transform: translateY(0);     opacity: 1; }
    }
    @keyframes shemVerifyPulse {
      0%, 100% { opacity: 1; }
      50%      { opacity: 0.35; }
    }
  `;
  document.head.appendChild(style);
}

export function VerificationBanner() {
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem('shem-verify-banner-dismissed') === '1'; }
    catch { return false; }
  });
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState(false);

  useEffect(ensureKeyframes, []);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    try { sessionStorage.setItem('shem-verify-banner-dismissed', '1'); }
    catch { /* ignore */ }
  }, []);

  const handleResend = useCallback(async () => {
    if (resending || resent) return;
    setResending(true);
    setError(false);
    try {
      const res = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        if (data.alreadyVerified) {
          // Already verified — reload to clear banner
          window.location.reload();
          return;
        }
        setResent(true);
      } else if (res.status === 429) {
        setError(true);
      }
    } catch {
      setError(true);
    }
    setResending(false);
  }, [resending, resent]);

  if (dismissed) return null;

  return (
    <div style={styles.banner} role="alert" aria-live="polite">
      <div style={styles.content}>
        <span style={styles.dot} />
        <span style={styles.text}>
          Please verify your email to use Whiteshoe.
          {' '}
          Check your inbox for a verification link.
        </span>
        {error && (
          <span style={styles.errorHint}>
            Too many attempts — try again later.
          </span>
        )}
        <button
          onClick={handleResend}
          disabled={resending || resent}
          style={{
            ...styles.resendBtn,
            opacity: resending || resent ? 0.5 : 1,
            cursor: resending || resent ? 'default' : 'pointer',
          }}
          aria-label={resent ? 'Verification email sent' : 'Resend verification email'}
        >
          {resent ? 'Sent \u2713' : resending ? 'Sending\u2026' : 'Resend email'}
        </button>
      </div>
      <button
        onClick={handleDismiss}
        style={styles.dismiss}
        aria-label="Dismiss verification banner"
      >
        \u2715
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
    padding: '8px 20px',
    backgroundColor: `rgba(184, 134, 11, 0.08)`,
    borderBottom: `1px solid rgba(184, 134, 11, 0.2)`,
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.warning,
    letterSpacing: 0.3,
    animation: 'shemVerifySlideDown 350ms ease-out',
  },
  content: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap' as const,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    backgroundColor: colors.warning,
    animation: 'shemVerifyPulse 2s ease-in-out infinite',
    flexShrink: 0,
  },
  text: {
    fontWeight: 500,
    lineHeight: 1.5,
  },
  errorHint: {
    fontSize: 11,
    color: colors.danger,
    fontWeight: 500,
  },
  resendBtn: {
    background: 'none',
    border: `1px solid rgba(184, 134, 11, 0.35)`,
    borderRadius: 4,
    color: colors.warning,
    fontSize: 11,
    fontFamily: fonts.sans,
    fontWeight: 600,
    padding: '3px 10px',
    lineHeight: 1.4,
    letterSpacing: 0.3,
    textTransform: 'uppercase' as const,
    whiteSpace: 'nowrap' as const,
    transition: 'border-color 150ms, opacity 150ms',
  },
  dismiss: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: colors.warning,
    fontSize: 14,
    padding: '2px 6px',
    borderRadius: 4,
    lineHeight: 1,
    opacity: 0.7,
    flexShrink: 0,
  },
};
