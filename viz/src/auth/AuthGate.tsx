/**
 * AuthGate — Wraps the entire app with authentication.
 *
 * On mount: calls GET /api/auth/me to check if the user has a valid cookie.
 * If authenticated → renders children (the app) with UserContext.
 * If not authenticated → renders LoginView.
 *
 * Also provides a logout function via context.
 */

import { useState, useEffect, useCallback, Suspense, lazy } from 'react';
import { UserContext, type AuthUser } from './UserContext.js';
import { colors, fonts } from '../staffing/styles/tokens.js';

const LoginView = lazy(() => import('./LoginView.js'));

interface Props {
  children: React.ReactNode;
}

export function AuthGate({ children }: Props) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checking, setChecking] = useState(true);

  // Check for existing session on mount
  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        setUser(data?.user ?? null);
        setChecking(false);
      })
      .catch(() => {
        setChecking(false);
      });
  }, []);

  // Logout handler
  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch { /* ignore */ }
    setUser(null);
  }, []);

  // Loading state
  if (checking) {
    return (
      <div style={loadingStyles.wrap}>
        <div style={loadingStyles.text}>MARBLE</div>
      </div>
    );
  }

  // Not authenticated → show login
  if (!user) {
    return (
      <Suspense fallback={<div style={loadingStyles.wrap} />}>
        <LoginView onAuth={setUser} />
      </Suspense>
    );
  }

  // Authenticated → provide user context and render app
  return (
    <UserContext.Provider value={{ user, logout }}>
      {children}
    </UserContext.Provider>
  );
}

const loadingStyles: Record<string, React.CSSProperties> = {
  wrap: {
    width: '100%',
    height: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  text: {
    fontFamily: fonts.serif,
    fontSize: 24,
    fontWeight: 300,
    color: colors.textDim,
    letterSpacing: 8,
  },
};
