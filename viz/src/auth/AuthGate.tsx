/**
 * AuthGate - transparent auth wrapper.
 *
 * Always renders children with the current user context. In LOCAL MODE the API
 * reports auth=false, so the app uses a synthetic local user and skips login.
 */

import { useState, useEffect, useCallback } from 'react';
import { UserContext, type AuthUser } from './UserContext.js';
import { IS_STANDALONE } from '../standalone.js';
import { apiUrl } from '../api.js';
import { colors, fonts } from '../staffing/styles/tokens.js';
import { LavernIlluminated } from '../components/LavernIlluminated.js';

interface Props {
  children: React.ReactNode;
}

const LOCAL_USER: AuthUser = {
  id: 'local-user',
  email: 'local@localhost',
  displayName: 'Local User',
  firmName: '',
  profile: {},
  emailVerified: true,
};

export function AuthGate({ children }: Props) {
  const [user, setUser] = useState<AuthUser | null>(LOCAL_USER);
  const [checking, setChecking] = useState(!IS_STANDALONE);

  useEffect(() => {
    if (IS_STANDALONE) {
      setChecking(false);
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    fetch(apiUrl('/api/capabilities'), { credentials: 'include', signal: controller.signal })
      .then(async r => {
        if (!r.ok) throw new Error(`Capabilities HTTP ${r.status}`);
        return await r.json() as { auth?: boolean };
      })
      .then(async capabilities => {
        if (!capabilities.auth) {
          setUser(LOCAL_USER);
          return;
        }

        const res = await fetch(apiUrl('/api/auth/me'), {
          credentials: 'include',
          signal: controller.signal,
        });
        const data = res.ok ? await res.json() : null;
        setUser(data?.user ?? null);
      })
      .catch(() => {
        setUser(LOCAL_USER);
      })
      .finally(() => {
        setChecking(false);
        clearTimeout(timeout);
      });
  }, []);

  const login = useCallback((u: AuthUser) => {
    setUser(u);
    sessionStorage.removeItem('shem-session-id');
    sessionStorage.removeItem('shem-demo-case');
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch(apiUrl('/api/auth/logout'), { method: 'POST', credentials: 'include' });
    } catch { /* ignore */ }
    setUser(null);
    if (!window.location.hash.startsWith('#/claw-live')) {
      window.location.hash = '';
    }
  }, []);

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
