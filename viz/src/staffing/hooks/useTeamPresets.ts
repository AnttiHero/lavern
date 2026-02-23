/**
 * useTeamPresets — Fetch team preset configurations from API.
 *
 * Merges user-saved teams from localStorage (shem-user-profile) at
 * the top of the list, prefixed with ★ to distinguish from built-ins.
 *
 * In standalone mode: uses bundled demo data, no API fetch.
 */

import { useState, useEffect, useRef } from 'react';
import { DEMO_PRESETS } from '../data/demoProfiles.js';
import { IS_STANDALONE } from '../../standalone.js';

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
  const saved = getSavedTeamPresets();
  const [presets, setPresets] = useState<TeamPreset[]>([...saved, ...DEMO_PRESETS]);
  const [loading, setLoading] = useState(false);
  const fetched = useRef(false);

  useEffect(() => {
    // Standalone mode: demo data is already loaded, skip fetch
    if (IS_STANDALONE) return;
    if (fetched.current) return;
    fetched.current = true;

    (async () => {
      let basePresets: TeamPreset[] = [];
      try {
        const res = await fetch('/api/agents/presets', { credentials: 'include' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        basePresets = data.presets ?? [];
      } catch {
        // API unreachable — keep demo presets
        basePresets = DEMO_PRESETS;
      } finally {
        const saved = getSavedTeamPresets();
        setPresets([...saved, ...basePresets]);
        setLoading(false);
      }
    })();
  }, []);

  return { presets, loading };
}
