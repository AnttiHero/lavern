/**
 * AuthGate — Transparent auth wrapper.
 *
 * Always renders children (the app). Provides UserContext with
 * the current user (or null) plus login/logout functions.
 *
 * In standalone mode: skips auth check entirely, renders immediately.
 */

import { useState, useEffect, useCallback } from 'react';
import { UserContext, type AuthUser } from './UserContext.js';
import { IS_STANDALONE } from '../standalone.js';
import { colors, fonts } from '../staffing/styles/tokens.js';
import { LavernIlluminated } from '../components/LavernIlluminated.js';

interface Props {
  children: React.ReactNode;
}

export function AuthGate({ children }: Props) {
  const [user, setUser] = useState<AuthUser | null>(null);
  // In standalone mode, skip auth check — render children immediately
  const [checking, setChecking] = useState(!IS_STANDALONE);

  // Check for existing session on mount (API mode only)
  useEffect(() => {
    if (IS_STANDALONE) return;

    // 5-second timeout prevents indefinite loading on slow/unresponsive server
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    fetch('/api/auth/me', { credentials: 'include', signal: controller.signal })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        setUser(data?.user ?? null);
        setChecking(false);
      })
      .catch(() => {
        // Network error or timeout — proceed as unauthenticated
        setChecking(false);
      })
      .finally(() => clearTimeout(timeout));
  }, []);

  const login = useCallback((u: AuthUser) => {
    setUser(u);
    // Clear any demo session so real API calls are used going forward
    sessionStorage.removeItem('shem-session-id');
    sessionStorage.removeItem('shem-demo-case');
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch { /* ignore */ }
    setUser(null);
    // Don't redirect away from auth-free routes
    if (!window.location.hash.startsWith('#/claw-live')) {
      window.location.hash = '';
    }
  }, []);

  // Brief loading flash while checking cookie (API mode only)
  if (checking) {
    return (
      <div style={loadingStyles.wrap}>
        <div style={loadingStyles.text}><LavernIlluminated color={colors.textDim} /></div>
      </div>
    );
  }

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
