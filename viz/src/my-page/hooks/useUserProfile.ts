/**
 * useUserProfile — localStorage-backed user profile persistence.
 *
 * Single key: `shem-user-profile`. Spread-with-defaults pattern so
 * new fields never crash on older stored data.
 */

import { useState, useCallback } from 'react';

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
  } catch { /* corrupted — return defaults */ }
  return { ...DEFAULT_PROFILE };
}

function writeProfile(profile: UserProfile): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
}

// ── Hook ───────────────────────────────────────────────────────────────

export function useUserProfile() {
  const [profile, setProfile] = useState<UserProfile>(readProfile);

  /** Merge partial updates into the profile. */
  const updateProfile = useCallback((patch: Partial<UserProfile>) => {
    setProfile(prev => {
      const next = { ...prev, ...patch };
      writeProfile(next);
      return next;
    });
  }, []);

  /** Add a saved team. */
  const saveTeam = useCallback((team: Omit<SavedTeam, 'id'>) => {
    setProfile(prev => {
      const newTeam: SavedTeam = { ...team, id: `team-${Date.now()}` };
      const next = { ...prev, savedTeams: [...prev.savedTeams, newTeam] };
      writeProfile(next);
      return next;
    });
  }, []);

  /** Remove a saved team by ID. */
  const deleteTeam = useCallback((teamId: string) => {
    setProfile(prev => {
      const next = { ...prev, savedTeams: prev.savedTeams.filter(t => t.id !== teamId) };
      writeProfile(next);
      return next;
    });
  }, []);

  const hasSavedTeams = profile.savedTeams.length > 0;

  return { profile, updateProfile, saveTeam, deleteTeam, hasSavedTeams };
}
