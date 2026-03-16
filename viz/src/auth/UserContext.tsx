/**
 * UserContext — Authenticated user state available throughout the app.
 *
 * Provides the current user (or null if not logged in),
 * plus login and logout functions.
 */

import { createContext, useContext } from 'react';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  firmName: string;
  profile: Record<string, unknown>;
  emailVerified?: boolean;
}

export interface UserContextValue {
  user: AuthUser | null;
  login: (user: AuthUser) => void;
  logout: () => Promise<void>;
}

export const UserContext = createContext<UserContextValue | null>(null);

export function useUser(): UserContextValue {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useUser() must be used within <AuthGate>');
  return ctx;
}
