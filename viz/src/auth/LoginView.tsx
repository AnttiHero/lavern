/**
 * LoginView — Login / Signup screen for Marble.
 *
 * Matches the editorial warm palette. Toggle between Login and Sign Up.
 * On success, calls onAuth(user) which re-renders the parent AuthGate.
 */

import { useState, useCallback } from 'react';
import { colors, fonts, radii, spacing } from '../staffing/styles/tokens.js';
import { MarbleLogo } from '../landing/LandingView.js';
import type { AuthUser } from './UserContext.js';

interface Props {
  onAuth: (user: AuthUser) => void;
}

export default function LoginView({ onAuth }: Props) {
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
      <div style={styles.card}>
        {/* Logo */}
        <div style={styles.logoWrap}>
          <MarbleLogo height={32} />
        </div>

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
    backgroundColor: colors.bg,
    fontFamily: fonts.sans,
  },

  card: {
    width: '100%',
    maxWidth: 400,
    padding: `${spacing.xxxl}px ${spacing.xxl}px`,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },

  logoWrap: {
    marginBottom: spacing.xxl,
  },

  title: {
    fontFamily: fonts.serif,
    fontSize: 28,
    fontWeight: 300,
    color: colors.text,
    margin: 0,
    letterSpacing: -0.5,
  },

  subtitle: {
    fontSize: 14,
    color: colors.textMuted,
    margin: `${spacing.sm}px 0 ${spacing.xxl}px`,
    textAlign: 'center' as const,
  },

  error: {
    width: '100%',
    backgroundColor: 'rgba(196, 93, 62, 0.06)',
    color: colors.danger,
    border: '1px solid rgba(196, 93, 62, 0.2)',
    borderRadius: radii.sm,
    padding: '10px 14px',
    marginBottom: spacing.lg,
    fontSize: 13,
    textAlign: 'center' as const,
  },

  form: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.md,
  },

  input: {
    width: '100%',
    padding: '12px 14px',
    fontSize: 14,
    fontFamily: fonts.sans,
    color: colors.text,
    backgroundColor: colors.bgInput,
    border: `1.5px solid ${colors.border}`,
    borderRadius: radii.sm,
    outline: 'none',
    boxSizing: 'border-box' as const,
    transition: 'border-color 0.2s ease',
  },

  submitBtn: {
    width: '100%',
    padding: '14px',
    fontSize: 14,
    fontWeight: 600,
    fontFamily: fonts.sans,
    letterSpacing: 1,
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
    marginTop: spacing.xxl,
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
