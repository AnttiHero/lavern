/**
 * useTeamSelection — Manages the selected agent roles, preset tracking,
 * budget calculation, and team confirmation API call.
 */

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import type { AgentProfile } from './useAgentProfiles.js';
import type { TeamPreset } from './useTeamPresets.js';

export function useTeamSelection(
  allProfiles: AgentProfile[],
  presets: TeamPreset[],
) {
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(new Set());
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [atCapFlash, setAtCapFlash] = useState(false);
  const capFlashTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Clean up timer on unmount
  useEffect(() => () => { clearTimeout(capFlashTimer.current); }, []);

  // Track when a preset was last applied — prevents recommendation effect
  // from overwriting a just-applied preset (race condition guard).
  const presetAppliedAtRef = useRef(0);

  const profileMap = useMemo(() => {
    const map = new Map<string, AgentProfile>();
    for (const p of allProfiles) map.set(p.role, p);
    return map;
  }, [allProfiles]);

  const MAX_TEAM_SIZE = 14;

  const toggleAgent = useCallback((role: string) => {
    setSelectedRoles(prev => {
      const next = new Set(prev);
      if (next.has(role)) {
        next.delete(role);
      } else if (next.size >= MAX_TEAM_SIZE) {
        // At cap — flash warning, don't add
        setAtCapFlash(true);
        clearTimeout(capFlashTimer.current);
        capFlashTimer.current = setTimeout(() => setAtCapFlash(false), 2000);
        return prev;
      } else {
        next.add(role);
      }
      return next;
    });
    // Manual change breaks preset
    setActivePreset(null);
  }, []);

  const applyPreset = useCallback((presetId: string) => {
    if (presetId === 'custom') {
      setActivePreset('custom');
      return;
    }
    const preset = presets.find(p => p.id === presetId);
    if (!preset) return;
    presetAppliedAtRef.current = Date.now();
    setSelectedRoles(new Set(preset.roles.slice(0, MAX_TEAM_SIZE)));
    setActivePreset(presetId);
  }, [presets]);

  const clearSelection = useCallback(() => {
    setSelectedRoles(new Set());
    setActivePreset(null);
  }, []);

  /** Programmatically set the team from recommended roles */
  const setRoles = useCallback((roles: string[]) => {
    setSelectedRoles(new Set(roles.slice(0, MAX_TEAM_SIZE)));
    setActivePreset(null);
  }, []);

  const totalCost = useMemo(() => {
    let sum = 0;
    for (const role of selectedRoles) {
      const p = profileMap.get(role);
      if (p) sum += p.billingRateUsd;
    }
    return sum;
  }, [selectedRoles, profileMap]);

  const selectedProfiles = useMemo(() => {
    const result: AgentProfile[] = [];
    for (const role of selectedRoles) {
      const p = profileMap.get(role);
      if (p) result.push(p);
    }
    return result;
  }, [selectedRoles, profileMap]);

  const confirmTeam = useCallback(async (matterId?: string): Promise<boolean> => {
    if (selectedRoles.size === 0) return false;
    setConfirming(true);
    try {
      if (matterId) {
        // Demo matters skip the API call
        if (matterId.startsWith('demo-matter-')) return true;
        try {
          const res = await fetch(`/api/matters/${matterId}/team`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ roles: Array.from(selectedRoles) }),
          });
          if (res.ok) return true;
        } catch (err) {
          console.warn('[TEAM] API save failed, using local team:', err);
        }
      }
      // No matterId or API failed — return success (team saved locally for session creation)
      return true;
    } catch (err) {
      console.error('[TEAM] Failed to confirm team:', err);
      return false;
    } finally {
      setConfirming(false);
    }
  }, [selectedRoles]);

  return {
    selectedRoles,
    activePreset,
    toggleAgent,
    applyPreset,
    clearSelection,
    setRoles,
    totalCost,
    teamSize: selectedRoles.size,
    selectedProfiles,
    confirming,
    confirmTeam,
    isSelected: (role: string) => selectedRoles.has(role),
    maxTeamSize: MAX_TEAM_SIZE,
    isAtCap: selectedRoles.size >= MAX_TEAM_SIZE,
    atCapFlash,
    /** Returns true if a preset was applied within the last 500ms (race guard). */
    wasPresetRecentlyApplied: () => Date.now() - presetAppliedAtRef.current < 500,
  };
}
