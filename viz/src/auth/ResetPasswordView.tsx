/**
 * ResetPasswordView — Set a new password using a reset token from email.
 *
 * Arrived at via `#/reset-password?token=xxx` from the password reset email.
 * Shows a new password + confirm form, or an error if the token is invalid.
 */

import { useState, useCallback } from 'react';
import { colors, fonts, radii, spacing } from '../staffing/styles/tokens.js';
import { LavernIlluminated } from '../components/LavernIlluminated.js';

interface Props {
  onBack?: () => void;
}

export default function ResetPasswordView({ onBack }: Props) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  // Extract token from hash
  const hashParts = window.location.hash.split('?');
  const params = new URLSearchParams(hashParts[1] ?? '');
  const token = params.get('token') ?? '';

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json().catch(() => ({ error: 'Unexpected response' }));

      if (!res.ok) {
        setError((data as { error?: string }).error || 'Password reset failed.');
        return;
      }

      setSuccess(true);
    } catch {
      setError('Unable to connect to the server.');
    } finally {
      setLoading(false);
    }
  }, [password, confirmPassword, token]);

  if (!token) {
    return (
      <div style={styles.page}>
        <img src={`${import.meta.env.BASE_URL}photo-1640280882429-204f63d777e7.avif`} alt="" style={styles.heroBg} />
        <div style={styles.veil} />
        <div style={styles.card}>
          <h1 style={styles.wordmark}><LavernIlluminated color="rgba(26,26,26,0.8)" /></h1>
          <div style={styles.rule} />
          <h2 style={styles.title}>Invalid Link</h2>
          <p style={styles.subtitle}>This reset link is missing a token. Please request a new one.</p>
          <button onClick={() => { window.location.hash = '#/login'; }} style={styles.submitBtn}>
            Back to Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <img src={`${import.meta.env.BASE_URL}photo-1640280882429-204f63d777e7.avif`} alt="" style={styles.heroBg} />
      <div style={styles.veil} />

      {onBack && (
        <button onClick={onBack} style={styles.backBtn}
          onMouseEnter={e => { e.currentTarget.style.backgroundColor = colors.text; e.currentTarget.style.color = '#fff'; }}
          onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = colors.text; }}
        >
          {'\u2190'} Back
        </button>
      )}

      <div style={styles.card}>
        <h1 style={styles.wordmark}><LavernIlluminated color="rgba(26,26,26,0.8)" /></h1>
        <div style={styles.rule} />

        {success ? (
          <>
            <h2 style={styles.title}>Password Reset</h2>
            <p style={styles.subtitle}>Your password has been changed. You can now sign in with your new password.</p>
            <button onClick={() => { window.location.hash = '#/login'; }} style={styles.submitBtn}>
              Sign In
            </button>
          </>
        ) : (
          <>
            <h2 style={styles.title}>New Password</h2>
            <p style={styles.subtitle}>Choose a new password for your account.</p>

            {error && <div style={styles.error}>{error}</div>}

            <form onSubmit={handleSubmit} style={styles.form}>
              <label htmlFor="reset-password" className="sr-only">New Password</label>
              <input
                id="reset-password"
                type="password"
                placeholder="New Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                style={styles.input}
                required
                minLength={8}
                autoFocus
                autoComplete="new-password"
              />
              {password.length > 0 && password.length < 8 && (
                <p style={{ fontSize: 11, color: colors.textMuted, margin: '-4px 0 4px', fontFamily: fonts.sans }}>
                  Minimum 8 characters
                </p>
              )}
              <label htmlFor="reset-confirm" className="sr-only">Confirm Password</label>
              <input
                id="reset-confirm"
                type="password"
                placeholder="Confirm Password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                style={styles.input}
                required
                minLength={8}
                autoComplete="new-password"
              />
              <button type="submit" style={styles.submitBtn} disabled={loading}>
                {loading ? 'Please wait...' : 'Reset Password'}
              </button>
            </form>

            <div style={styles.toggle}>
              <span style={styles.toggleText}>Link expired?</span>
              <button
                type="button"
                onClick={() => { window.location.hash = '#/login'; }}
                style={styles.toggleBtn}
              >
                Request New Link
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

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
};
