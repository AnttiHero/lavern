/**
 * LoginView — Login / Signup screen for Lavern.
 *
 * Same background as the lobby, but with an overlay card.
 * Typography wordmark instead of SVG. Clean, editorial, warm.
 */

import { useState, useCallback, useEffect } from 'react';
import { colors, fonts, radii, spacing } from '../staffing/styles/tokens.js';
import { LavernIlluminated } from '../components/LavernIlluminated.js';
import type { AuthUser } from './UserContext.js';

interface Props {
  onAuth: (user: AuthUser) => void;
  onBack?: () => void;
}

export default function LoginView({ onAuth, onBack }: Props) {
  const hasRef = window.location.hash.includes('ref=');
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>(hasRef ? 'signup' : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [firmName, setFirmName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [forgotSuccess, setForgotSuccess] = useState(false);

  // Read referral code from URL hash (e.g., #/login?ref=ref-abcd1234)
  const [referralCode] = useState(() => {
    const hash = window.location.hash;
    const match = hash.match(/[?&]ref=([^&]+)/);
    return match ? decodeURIComponent(match[1]) : '';
  });

  // Read OAuth error from URL hash (e.g., #/login?error=oauth_denied)
  const [oauthError] = useState(() => {
    const hash = window.location.hash;
    const match = hash.match(/[?&]error=([^&]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  });
  useEffect(() => {
    if (oauthError === 'oauth_denied') setError('Google sign-in was cancelled.');
    else if (oauthError === 'oauth_failed') setError('Google sign-in failed. Please try again.');
  }, [oauthError]);

  const handleForgotPassword = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        setError('Something went wrong. Please try again.');
        return;
      }
      setForgotSuccess(true);
    } catch {
      setError('Unable to connect to the server.');
    } finally {
      setLoading(false);
    }
  }, [email]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/signup';
      const body = mode === 'login'
        ? { email, password }
        : { email, password, inviteCode: inviteCode || undefined, displayName: displayName || undefined, firmName: firmName || undefined, referralCode: referralCode || undefined };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'include',
      });

      let data: Record<string, unknown>;
      try {
        data = await res.json();
      } catch {
        setError('Server returned an unexpected response. Please try again.');
        return;
      }

      if (!res.ok) {
        // Map all auth errors to a generic message — prevents leaking
        // account existence, internal error details, or implementation hints.
        const serverMsg = (data.error as string) || '';
        const safeMsg = res.status === 401 ? 'Invalid email or password.'
          : res.status === 429 ? 'Too many attempts. Please wait a moment.'
          : res.status === 403 ? 'Please verify your email before logging in.'
          : 'Authentication failed. Please try again.';
        setError(serverMsg.includes('email or password') ? serverMsg : safeMsg);
        return;
      }

      if (data.user) {
        onAuth(data.user as AuthUser);
      }
    } catch {
      setError('Unable to connect to the server.');
    } finally {
      setLoading(false);
    }
  }, [mode, email, password, inviteCode, displayName, firmName, referralCode, onAuth]);

  const isSignup = mode === 'signup';

  return (
    <div style={styles.page}>
      {/* Background */}
      <img
        src={`${import.meta.env.BASE_URL}photo-1640280882429-204f63d777e7.avif`}
        alt=""
        style={styles.heroBg}
      />
      <div style={styles.veil} />

      {/* Back button */}
      {onBack && (
        <button
          onClick={onBack}
          style={styles.backBtn}
          onMouseEnter={e => { e.currentTarget.style.backgroundColor = colors.text; e.currentTarget.style.color = '#fff'; }}
          onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = colors.text; }}
        >
          {'\u2190'} Back
        </button>
      )}

      {/* Card */}
      <div style={styles.card}>
        {/* Wordmark */}
        <h1 style={styles.wordmark}><LavernIlluminated color="rgba(26,26,26,0.8)" /></h1>

        {/* Thin rule */}
        <div style={styles.rule} />

        {/* Title */}
        <h2 style={styles.title}>
          {mode === 'forgot' ? 'Forgot Password' : isSignup ? 'Create Account' : 'Welcome Back'}
        </h2>
        <p style={styles.subtitle}>
          {mode === 'forgot'
            ? "Enter your email and we'll send a reset link."
            : isSignup
            ? 'Join the agentic law firm.'
            : 'Sign in to your Lavern account.'}
        </p>

        {/* Error */}
        {error && <div style={styles.error}>{error}</div>}

        {/* Google OAuth */}
        {mode !== 'forgot' && (
          <>
            <a href="/api/auth/google" style={styles.googleBtn}>
              <svg width="18" height="18" viewBox="0 0 18 18" style={{ flexShrink: 0 }}>
                <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
                <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
                <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
                <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
              </svg>
              Continue with Google
            </a>
            <div style={styles.divider}>
              <div style={styles.dividerLine} />
              <span style={styles.dividerText}>or</span>
              <div style={styles.dividerLine} />
            </div>
          </>
        )}

        {/* Forgot password mode */}
        {mode === 'forgot' ? (
          forgotSuccess ? (
            <div style={{ textAlign: 'center', width: '100%' }}>
              <p style={{ fontSize: 14, color: colors.textMuted, lineHeight: 1.6, margin: `0 0 ${spacing.xl}px` }}>
                If an account with that email exists, we sent a password reset link. Check your inbox.
              </p>
              <button
                type="button"
                onClick={() => { setMode('login'); setError(null); setForgotSuccess(false); }}
                style={styles.submitBtn}
              >
                Back to Sign In
              </button>
            </div>
          ) : (
            <>
              <form onSubmit={handleForgotPassword} style={styles.form}>
                <label htmlFor="forgot-email" className="sr-only">Email</label>
                <input
                  id="forgot-email"
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  style={styles.input}
                  required
                  autoFocus
                  autoComplete="email"
                />
                <button type="submit" style={styles.submitBtn} disabled={loading}>
                  {loading ? 'Please wait...' : 'Send Reset Link'}
                </button>
              </form>
              <div style={styles.toggle}>
                <span style={styles.toggleText}>Remember your password?</span>
                <button
                  type="button"
                  onClick={() => { setMode('login'); setError(null); }}
                  style={styles.toggleBtn}
                >
                  Sign In
                </button>
              </div>
            </>
          )
        ) : (
          <>
            {/* Login / Signup Form */}
            <form onSubmit={handleSubmit} style={styles.form}>
              <label htmlFor="auth-email" className="sr-only">Email</label>
              <input
                id="auth-email"
                type="email"
                placeholder="Email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                style={styles.input}
                required
                autoFocus
                autoComplete="email"
              />
              <label htmlFor="auth-password" className="sr-only">Password</label>
              <input
                id="auth-password"
                type="password"
                placeholder="Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                style={styles.input}
                required
                minLength={mode === 'signup' ? 8 : 1}
                autoComplete={isSignup ? 'new-password' : 'current-password'}
              />
              {isSignup && password.length > 0 && password.length < 8 && (
                <p style={{ ...styles.waitlistHint, color: colors.textMuted, marginTop: -4 }}>
                  Minimum 8 characters
                </p>
              )}

              {!isSignup && (
                <button
                  type="button"
                  onClick={() => { setMode('forgot'); setError(null); }}
                  style={styles.forgotBtn}
                >
                  Forgot password?
                </button>
              )}

              {isSignup && (
                <>
                  <label htmlFor="auth-invite" className="sr-only">Invite Code (optional)</label>
                  <input
                    id="auth-invite"
                    type="text"
                    placeholder="Invite Code (optional)"
                    value={inviteCode}
                    onChange={e => setInviteCode(e.target.value)}
                    style={styles.input}
                  />
                  <p style={styles.waitlistHint}>
                    Have a code? Enter it for bonus hours.{' '}
                    <a
                      href="#/pricing"
                      onClick={(e) => { e.preventDefault(); window.location.hash = '#/pricing'; }}
                      style={styles.waitlistLink}
                    >
                      Learn more.
                    </a>
                  </p>
                  <label htmlFor="auth-display-name" className="sr-only">Display Name</label>
                  <input
                    id="auth-display-name"
                    type="text"
                    placeholder="Display Name (optional)"
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    style={styles.input}
                    autoComplete="name"
                  />
                  <label htmlFor="auth-firm" className="sr-only">Firm or Organization</label>
                  <input
                    id="auth-firm"
                    type="text"
                    placeholder="Firm / Organization (optional)"
                    value={firmName}
                    onChange={e => setFirmName(e.target.value)}
                    style={styles.input}
                    autoComplete="organization"
                  />
                </>
              )}

              {isSignup && (
                <p style={styles.legalConsent}>
                  By creating an account, you agree to our{' '}
                  <a href="/terms" target="_blank" rel="noopener noreferrer" style={styles.legalLink}>Terms of Service</a> and{' '}
                  <a href="/privacy" target="_blank" rel="noopener noreferrer" style={styles.legalLink}>Privacy Policy</a>.
                </p>
              )}

              <button type="submit" style={styles.submitBtn} disabled={loading}>
                {loading
                  ? 'Please wait...'
                  : isSignup ? 'Create Account' : 'Sign In'}
              </button>
            </form>

            {/* Toggle mode */}
            <div style={styles.toggle}>
              <span style={styles.toggleText}>
                {isSignup ? 'Already have an account?' : "Don't have an account?"}
              </span>
              <button
                type="button"
                onClick={() => { setMode(isSignup ? 'login' : 'signup'); setError(null); }}
                style={styles.toggleBtn}
              >
                {isSignup ? 'Sign In' : 'Sign Up'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  page: {
    width: '100%',
    height: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0ede8',
    fontFamily: fonts.sans,
    position: 'relative' as const,
    overflow: 'hidden',
  },

  heroBg: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover' as const,
    objectPosition: 'center center',
    filter: 'contrast(0.75) brightness(1.12) saturate(0.3)',
    opacity: 0.5,
    pointerEvents: 'none' as const,
  },
  veil: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(245, 243, 239, 0.45)',
    pointerEvents: 'none' as const,
  },

  backBtn: {
    position: 'absolute' as const,
    top: 28,
    left: 36,
    zIndex: 10,
    padding: '6px 14px',
    borderRadius: radii.sm,
    border: `1.5px solid ${colors.text}`,
    backgroundColor: 'transparent',
    color: colors.text,
    fontFamily: fonts.sans,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    cursor: 'pointer',
    transition: 'background-color 0.25s ease, color 0.25s ease',
  },

  card: {
    position: 'relative' as const,
    zIndex: 1,
    width: '100%',
    maxWidth: 400,
    padding: `${spacing.xxxl}px ${spacing.xxl}px`,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.45)',
    backdropFilter: 'blur(24px)',
    WebkitBackdropFilter: 'blur(24px)',
    borderRadius: radii.lg,
    border: '1px solid rgba(26, 26, 26, 0.06)',
  },

  wordmark: {
    fontSize: 48,
    fontWeight: 300,
    fontFamily: fonts.serif,
    color: colors.text,
    margin: 0,
    letterSpacing: 10,
    textTransform: 'uppercase' as const,
    opacity: 0.8,
  },

  rule: {
    width: 48,
    height: 1.5,
    backgroundColor: colors.text,
    opacity: 0.2,
    margin: `${spacing.xl}px 0`,
  },

  title: {
    fontFamily: fonts.serif,
    fontSize: 24,
    fontWeight: 300,
    fontStyle: 'italic' as const,
    color: colors.text,
    margin: 0,
    letterSpacing: -0.3,
  },

  subtitle: {
    fontSize: 13,
    color: colors.textMuted,
    margin: `${spacing.sm}px 0 ${spacing.xxl}px`,
    textAlign: 'center' as const,
  },

  error: {
    width: '100%',
    backgroundColor: 'rgba(196, 93, 62, 0.08)',
    color: colors.danger,
    border: '1px solid rgba(196, 93, 62, 0.2)',
    borderRadius: radii.sm,
    padding: '10px 14px',
    marginBottom: spacing.lg,
    fontSize: 13,
    textAlign: 'center' as const,
    boxSizing: 'border-box' as const,
  },

  form: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: spacing.md,
  },

  input: {
    width: '100%',
    padding: '13px 16px',
    fontSize: 14,
    fontFamily: fonts.sans,
    color: colors.text,
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
    border: `1.5px solid rgba(26, 26, 26, 0.1)`,
    borderRadius: radii.sm,
    boxSizing: 'border-box' as const,
    transition: 'border-color 0.2s ease',
    letterSpacing: 0.2,
  },

  submitBtn: {
    width: '100%',
    padding: '14px',
    fontSize: 13,
    fontWeight: 600,
    fontFamily: fonts.sans,
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
    color: '#fff',
    backgroundColor: colors.text,
    border: `2px solid ${colors.text}`,
    borderRadius: radii.sm,
    cursor: 'pointer',
    transition: 'opacity 0.2s ease',
    marginTop: spacing.sm,
  },

  toggle: {
    marginTop: spacing.xl,
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
  },

  toggleText: {
    fontSize: 13,
    color: colors.textMuted,
  },

  toggleBtn: {
    background: 'none',
    border: 'none',
    color: colors.text,
    fontSize: 13,
    fontWeight: 600,
    fontFamily: fonts.sans,
    cursor: 'pointer',
    textDecoration: 'underline',
    padding: 0,
  },

  forgotBtn: {
    background: 'none',
    border: 'none',
    color: colors.textMuted,
    fontSize: 12,
    fontFamily: fonts.sans,
    cursor: 'pointer',
    padding: 0,
    alignSelf: 'flex-end' as const,
    marginTop: -spacing.sm,
    textDecoration: 'underline',
  },

  waitlistHint: {
    fontSize: 12,
    fontFamily: fonts.serif,
    fontStyle: 'italic' as const,
    color: colors.textMuted,
    margin: `-${spacing.sm}px 0 0`,
    textAlign: 'center' as const,
    lineHeight: 1.4,
  },

  waitlistLink: {
    color: colors.text,
    fontFamily: fonts.serif,
    fontStyle: 'italic' as const,
    textDecoration: 'underline',
    cursor: 'pointer',
  },

  googleBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    width: '100%',
    padding: '12px 16px',
    fontSize: 14,
    fontFamily: fonts.sans,
    fontWeight: 500,
    color: colors.text,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    border: '1.5px solid rgba(26, 26, 26, 0.12)',
    borderRadius: radii.sm,
    textDecoration: 'none',
    cursor: 'pointer',
    transition: 'background-color 0.2s ease, border-color 0.2s ease',
    boxSizing: 'border-box' as const,
  },

  divider: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    margin: `${spacing.sm}px 0`,
  },

  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(26, 26, 26, 0.1)',
  },

  dividerText: {
    fontSize: 12,
    color: colors.textMuted,
    fontFamily: fonts.serif,
    fontStyle: 'italic' as const,
  },

  legalConsent: {
    fontSize: 11,
    fontFamily: fonts.serif,
    fontStyle: 'italic' as const,
    color: colors.textMuted,
    textAlign: 'center' as const,
    lineHeight: 1.5,
    margin: 0,
  },

  legalLink: {
    color: colors.text,
    fontFamily: fonts.serif,
    fontStyle: 'italic' as const,
    textDecoration: 'underline',
    cursor: 'pointer',
  },
};
