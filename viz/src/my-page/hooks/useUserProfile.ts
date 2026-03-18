/**
 * useUserProfile — User profile persistence (localStorage + server sync).
 *
 * Write-through: every mutation writes to both localStorage (instant) and
 * the server via PUT /api/auth/profile (async, fire-and-forget).
 *
 * On init: reads from localStorage for instant load, then fetches
 * from GET /api/auth/me to merge any server-side data.
 */

import { useState, useCallback, useEffect, useRef } from 'react';

// ── Types ──────────────────────────────────────────────────────────────

export interface SavedTeam {
  id: string;
  name: string;
  description: string;
  roles: string[];
  teamSize: number;
}

export interface UserProfile {
  // Identity
  displayName: string;
  firmName: string;
  defaultJurisdiction: string;

  // Engagement defaults
  defaultWorkflowId: string;
  defaultIntensity: string;
  defaultBudgetUsd: number;
  yoloModeDefault: boolean;

  // Custom instructions (appended to briefing memos)
  customInstructions: string;

  // Soul — defines Lavern's personality, voice, and principles for this user
  soul: string;

  // Saved teams
  savedTeams: SavedTeam[];
}

// ── Defaults ───────────────────────────────────────────────────────────

const STORAGE_KEY = 'shem-user-profile';

const DEFAULT_PROFILE: UserProfile = {
  displayName: '',
  firmName: '',
  defaultJurisdiction: '',
  defaultWorkflowId: 'counsel',
  defaultIntensity: 'standard',
  defaultBudgetUsd: 10,
  yoloModeDefault: false,
  customInstructions: '',
  soul: '',
  savedTeams: [],
};

// ── Read / Write helpers ───────────────────────────────────────────────

function readProfile(): UserProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_PROFILE, ...parsed };
    }
  } catch (err) {
    // Corrupted profile — warn the user via console and return defaults
    console.warn('[Profile] Saved profile was corrupted and has been reset to defaults.', err);
    // Clear the corrupted data so it doesn't persist
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }
  return { ...DEFAULT_PROFILE };
}

function writeProfile(profile: UserProfile): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
}

/** Sync profile to server (fire-and-forget, debounced externally). */
function syncToServer(profile: UserProfile): void {
  fetch('/api/auth/profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      displayName: profile.displayName,
      firmName: profile.firmName,
      profileJson: JSON.stringify({
        defaultJurisdiction: profile.defaultJurisdiction,
        defaultWorkflowId: profile.defaultWorkflowId,
        defaultIntensity: profile.defaultIntensity,
        defaultBudgetUsd: profile.defaultBudgetUsd,
        yoloModeDefault: profile.yoloModeDefault,
        customInstructions: profile.customInstructions,
        soul: profile.soul,
        savedTeams: profile.savedTeams,
      }),
    }),
  }).catch(() => { /* server unreachable — localStorage is the fallback */ });
}

// ── Hook ───────────────────────────────────────────────────────────────

export function useUserProfile() {
  const [profile, setProfile] = useState<UserProfile>(readProfile);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Clean up debounce timer on unmount
  useEffect(() => {
    return () => { clearTimeout(syncTimerRef.current); };
  }, []);

  // On mount: fetch server profile and merge
  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data?.user) return;
        const serverUser = data.user;

        // Parse server-side profile JSON
        let serverProfile: Record<string, unknown> = {};
        if (serverUser.profile && typeof serverUser.profile === 'object') {
          serverProfile = serverUser.profile;
        }

        setProfile(prev => {
          const merged: UserProfile = {
            ...prev,
            // Server identity fields take precedence if non-empty
            displayName: serverUser.displayName || prev.displayName,
            firmName: serverUser.firmName || prev.firmName,
            // Server profile fields take precedence if present
            defaultJurisdiction: (serverProfile.defaultJurisdiction as string) || prev.defaultJurisdiction,
            defaultWorkflowId: (serverProfile.defaultWorkflowId as string) || prev.defaultWorkflowId,
            defaultIntensity: (serverProfile.defaultIntensity as string) || prev.defaultIntensity,
            defaultBudgetUsd: (serverProfile.defaultBudgetUsd as number) ?? prev.defaultBudgetUsd,
            yoloModeDefault: serverProfile.yoloModeDefault !== undefined
              ? (serverProfile.yoloModeDefault as boolean)
              : prev.yoloModeDefault,
            customInstructions: (serverProfile.customInstructions as string) || prev.customInstructions,
            soul: (serverProfile.soul as string) || prev.soul,
            savedTeams: Array.isArray(serverProfile.savedTeams)
              ? (serverProfile.savedTeams as SavedTeam[])
              : prev.savedTeams,
          };
          writeProfile(merged);
          return merged;
        });
      })
      .catch(() => { /* server unreachable — use localStorage */ });
  }, []);

  /** Merge partial updates into the profile. */
  const updateProfile = useCallback((patch: Partial<UserProfile>) => {
    setProfile(prev => {
      const next = { ...prev, ...patch };
      writeProfile(next);

      // Debounced server sync (500ms)
      clearTimeout(syncTimerRef.current);
      syncTimerRef.current = setTimeout(() => syncToServer(next), 500);

      return next;
    });
  }, []);

  /** Add a saved team. */
  const saveTeam = useCallback((team: Omit<SavedTeam, 'id'>) => {
    setProfile(prev => {
      const newTeam: SavedTeam = { ...team, id: `team-${Date.now()}` };
      const next = { ...prev, savedTeams: [...prev.savedTeams, newTeam] };
      writeProfile(next);
      syncToServer(next);
      return next;
    });
  }, []);

  /** Remove a saved team by ID. */
  const deleteTeam = useCallback((teamId: string) => {
    setProfile(prev => {
      const next = { ...prev, savedTeams: prev.savedTeams.filter(t => t.id !== teamId) };
      writeProfile(next);
      syncToServer(next);
      return next;
    });
  }, []);

  const hasSavedTeams = profile.savedTeams.length > 0;

  return { profile, updateProfile, saveTeam, deleteTeam, hasSavedTeams };
}
