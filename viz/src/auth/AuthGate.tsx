/**
 * AuthGate — Transparent auth wrapper.
 *
 * Always renders children (the app). Provides UserContext with
 * the current user (or null) plus login/logout functions.
 *
 * The landing and lobby are accessible without auth.
 * Login happens inline on the lobby page.
 */

import { useState, useEffect, useCallback } from 'react';
import { UserContext, type AuthUser } from './UserContext.js';
import { colors, fonts } from '../staffing/styles/tokens.js';

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

  const login = useCallback((u: AuthUser) => {
    setUser(u);
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch { /* ignore */ }
    setUser(null);
    window.location.hash = '';
  }, []);

  // Brief loading flash while checking cookie
  if (checking) {
    return (
      <div style={loadingStyles.wrap}>
        <div style={loadingStyles.text}>MARBLE</div>
      </div>
    );
  }

  // Always render app — login happens on the lobby page
  return (
    <UserContext.Provider value={{ user, login, logout }}>
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
