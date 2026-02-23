/**
 * LoginView — Login / Signup screen for Marble.
 *
 * Same marble background as the lobby, but with an overlay card.
 * Typography wordmark instead of SVG. Clean, editorial, warm.
 */

import { useState, useCallback } from 'react';
import { colors, fonts, radii, spacing } from '../staffing/styles/tokens.js';
import type { AuthUser } from './UserContext.js';

interface Props {
  onAuth: (user: AuthUser) => void;
  onBack?: () => void;
}

export default function LoginView({ onAuth, onBack }: Props) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [firmName, setFirmName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/signup';
      const body = mode === 'login'
        ? { email, password }
        : { email, password, displayName: displayName || undefined, firmName: firmName || undefined };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'include',
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Authentication failed.');
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
  }, [mode, email, password, displayName, firmName, onAuth]);

  const isSignup = mode === 'signup';

  return (
    <div style={styles.page}>
      {/* Marble background */}
      <img
        src={`${import.meta.env.BASE_URL}photo-1640280882429-204f63d777e7.avif`}
        alt=""
        style={styles.marbleBg}
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
        <h1 style={styles.wordmark}>MARBLE</h1>

        {/* Thin rule */}
        <div style={styles.rule} />

        {/* Title */}
        <h2 style={styles.title}>
          {isSignup ? 'Create Account' : 'Welcome Back'}
        </h2>
        <p style={styles.subtitle}>
          {isSignup
            ? 'Join the agentic law firm.'
            : 'Sign in to your Marble account.'}
        </p>

        {/* Error */}
        {error && <div style={styles.error}>{error}</div>}

        {/* Form */}
        <form onSubmit={handleSubmit} style={styles.form}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            style={styles.input}
            required
            autoFocus
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            style={styles.input}
            required
            minLength={mode === 'signup' ? 8 : 1}
          />

          {isSignup && (
            <>
              <input
                type="text"
                placeholder="Display Name (optional)"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                style={styles.input}
              />
              <input
                type="text"
                placeholder="Firm / Organization (optional)"
                value={firmName}
                onChange={e => setFirmName(e.target.value)}
                style={styles.input}
              />
            </>
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

  marbleBg: {
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
    outline: 'none',
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
