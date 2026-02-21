/**
 * UserContext — Authenticated user state available throughout the app.
 *
 * Provides the current user (id, email, displayName, firmName, profile)
 * and a logout function. Used by AuthGate to set the user after login.
 */

import { createContext, useContext } from 'react';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  firmName: string;
  profile: Record<string, unknown>;
}

export interface UserContextValue {
  user: AuthUser;
  logout: () => Promise<void>;
}

export const UserContext = createContext<UserContextValue | null>(null);

export function useUser(): UserContextValue {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useUser() must be used within <AuthGate>');
  return ctx;
}
