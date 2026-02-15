/**
 * useTeamPresets — Fetch team preset configurations from API.
 *
 * Merges user-saved teams from localStorage (shem-user-profile) at
 * the top of the list, prefixed with ★ to distinguish from built-ins.
 */

import { useState, useEffect, useRef } from 'react';
import { DEMO_PRESETS } from '../data/demoProfiles.js';

export interface TeamPreset {
  id: string;
  name: string;
  description: string;
  teamSize: number;
  roles: string[];
}

/** Read saved teams from user profile in localStorage. */
function getSavedTeamPresets(): TeamPreset[] {
  try {
    const raw = localStorage.getItem('shem-user-profile');
    if (!raw) return [];
    const profile = JSON.parse(raw);
    if (!Array.isArray(profile.savedTeams) || profile.savedTeams.length === 0) return [];
    return profile.savedTeams.map((t: { id: string; name: string; description: string; teamSize: number; roles: string[] }) => ({
      id: `saved-${t.id}`,
      name: `\u2605 ${t.name}`,
      description: t.description,
      teamSize: t.teamSize,
      roles: t.roles,
    }));
  } catch {
    return [];
  }
}

export function useTeamPresets() {
  const [presets, setPresets] = useState<TeamPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const fetched = useRef(false);

  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;

    (async () => {
      let basePresets: TeamPreset[] = [];
      try {
        const res = await fetch('/api/agents/presets');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        basePresets = data.presets ?? [];
      } catch {
        // Fallback to demo presets when API is unreachable
        basePresets = DEMO_PRESETS;
      } finally {
        // Merge saved teams at the top
        const saved = getSavedTeamPresets();
        setPresets([...saved, ...basePresets]);
        setLoading(false);
      }
    })();
  }, []);

  return { presets, loading };
}
