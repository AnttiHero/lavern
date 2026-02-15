/**
 * useTeamRoster — Reads the selected team from sessionStorage and resolves
 * each role to a full AgentProfile from demo data.
 */

import { useState, useEffect } from 'react';
import type { AgentProfile } from '../../staffing/hooks/useAgentProfiles.js';
import { DEMO_PROFILES } from '../../staffing/data/demoProfiles.js';

const FALLBACK_ROLES = [
  'design-reviewer',
  'ethics-auditor',
  'service-designer',
  'plain-language-specialist',
  'client-proxy',
  'transformation-specialist',
  'meaning-guardian',
  'synthesis-editor',
];

export function useTeamRoster(): { team: AgentProfile[]; loading: boolean } {
  const [team, setTeam] = useState<AgentProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = sessionStorage.getItem('shem-briefing-team');
    let roles: string[];

    if (stored) {
      try {
        roles = JSON.parse(stored);
      } catch {
        roles = FALLBACK_ROLES;
      }
    } else {
      roles = FALLBACK_ROLES;
    }

    const profileMap = new Map<string, AgentProfile>();
    for (const p of DEMO_PROFILES) profileMap.set(p.role, p);

    const resolved = roles
      .map(r => profileMap.get(r))
      .filter((p): p is AgentProfile => p != null);

    setTeam(resolved);
    setLoading(false);
  }, []);

  return { team, loading };
}
