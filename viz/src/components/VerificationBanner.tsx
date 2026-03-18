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

import { useState, useCallback, useEffect, useRef } from 'react';
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
      from { transform: translateX(-50%) translateY(20px); opacity: 0; }
      to   { transform: translateX(-50%) translateY(0);     opacity: 1; }
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
  const [cooldown, setCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(ensureKeyframes, []);

  // Cleanup cooldown timer on unmount
  useEffect(() => {
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, []);

  const startCooldown = useCallback(() => {
    setCooldown(60);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setCooldown(prev => {
        if (prev <= 1) {
          if (cooldownRef.current) clearInterval(cooldownRef.current);
          cooldownRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    try { sessionStorage.setItem('shem-verify-banner-dismissed', '1'); }
    catch { /* ignore */ }
  }, []);

  const handleResend = useCallback(async () => {
    if (resending || cooldown > 0) return;
    setResending(true);
    setError(false);
    setResent(false);
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
        startCooldown();
      } else if (res.status === 429) {
        setError(true);
        startCooldown();
      }
    } catch {
      setError(true);
    }
    setResending(false);
  }, [resending, cooldown, startCooldown]);

  if (dismissed) return null;

  return (
    <div style={styles.banner} role="alert" aria-live="polite">
      <div style={styles.content}>
        <span style={styles.dot} />
        <span style={styles.text}>
          Please verify your email to use Lavern.
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
          disabled={resending || cooldown > 0}
          style={{
            ...styles.resendBtn,
            opacity: resending || cooldown > 0 ? 0.5 : 1,
            cursor: resending || cooldown > 0 ? 'default' : 'pointer',
          }}
          aria-label={cooldown > 0 ? `Resend available in ${cooldown} seconds` : resent ? 'Verification email sent' : 'Resend verification email'}
        >
          {resending ? 'Sending\u2026' : cooldown > 0 ? `Resend in ${cooldown}s` : resent ? 'Sent \u2713' : 'Resend email'}
        </button>
      </div>
      <button
        onClick={handleDismiss}
        style={styles.dismiss}
        aria-label="Dismiss verification banner"
      >
        {'\u2715'}
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  banner: {
    position: 'fixed',
    bottom: 32,
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 10000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    padding: '12px 20px',
    backgroundColor: 'rgba(20,20,20,0.9)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 100,
    fontFamily: fonts.sans,
    fontSize: 12,
    color: 'rgba(250,249,246,0.6)',
    letterSpacing: 0.3,
    animation: 'shemVerifySlideDown 350ms ease-out',
    boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
    maxWidth: 'calc(100vw - 48px)',
  },
  content: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap' as const,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: '50%',
    backgroundColor: '#D49060',
    animation: 'shemVerifyPulse 2s ease-in-out infinite',
    flexShrink: 0,
  },
  text: {
    fontWeight: 400,
    lineHeight: 1.5,
    whiteSpace: 'nowrap' as const,
  },
  errorHint: {
    fontSize: 11,
    color: '#D49060',
    fontWeight: 500,
  },
  resendBtn: {
    background: 'none',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 100,
    color: 'rgba(250,249,246,0.7)',
    fontSize: 10,
    fontFamily: fonts.sans,
    fontWeight: 500,
    padding: '4px 14px',
    lineHeight: 1.4,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    whiteSpace: 'nowrap' as const,
    transition: 'border-color 150ms, opacity 150ms',
  },
  dismiss: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'rgba(250,249,246,0.3)',
    fontSize: 13,
    padding: '2px 4px',
    borderRadius: 4,
    lineHeight: 1,
    flexShrink: 0,
  },
};
