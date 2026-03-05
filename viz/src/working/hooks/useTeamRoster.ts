/**
 * useTeamRoster — Reads the selected team from sessionStorage and resolves
 * each role to a full AgentProfile from demo data.
 *
 * v2: Dynamically expands the team when SSE events reference agents not in
 * the initial roster. Creates synthetic profiles for truly unknown roles.
 */

import { useState, useEffect, useRef } from 'react';
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

/** Convert kebab-case role ID to display name: "privacy-counsel" → "Privacy Counsel" */
function formatRole(role: string): string {
  return role.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/** Build a profile map from DEMO_PROFILES for O(1) lookup. */
const PROFILE_MAP = new Map<string, AgentProfile>();
for (const p of DEMO_PROFILES) PROFILE_MAP.set(p.role, p);

/**
 * Create a synthetic AgentProfile for roles not found in DEMO_PROFILES.
 * Uses deterministic values so the avatar is consistent.
 */
function createSyntheticProfile(role: string): AgentProfile {
  return {
    role,
    displayName: formatRole(role),
    tagline: 'Specialist',
    category: 'lawyer',
    seniority: 'associate',
    costTier: 'sonnet',
    billingRateUsd: 0,
    skills: {
      precision: 3, creativity: 3, speed: 3, depth: 3,
      negotiation: 3, communication: 3, research: 3, risk: 3,
    },
    personality: {
      archetype: 'Specialist',
      workStyle: 'Focused and methodical.',
    },
    practiceAreas: [],
    strengths: [],
    limitations: [],
    optional: true,
    defaultSelected: false,
  };
}

/**
 * Resolve a single agent role to a profile. Checks DEMO_PROFILES first,
 * then creates a synthetic profile.
 */
export function resolveAgent(role: string): AgentProfile {
  return PROFILE_MAP.get(role) ?? createSyntheticProfile(role);
}

export function useTeamRoster(eventRoles?: string[]): { team: AgentProfile[]; loading: boolean } {
  const [team, setTeam] = useState<AgentProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const knownRolesRef = useRef(new Set<string>());

  // Initial load from sessionStorage
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

    const resolved = roles.map(r => resolveAgent(r));

    // Track which roles we know about
    for (const p of resolved) knownRolesRef.current.add(p.role);

    setTeam(resolved);
    setLoading(false);
  }, []);

  // Expand team when new roles appear in events
  useEffect(() => {
    if (!eventRoles || eventRoles.length === 0) return;

    const newRoles = eventRoles.filter(r => r && !knownRolesRef.current.has(r));
    if (newRoles.length === 0) return;

    const newProfiles = newRoles.map(r => {
      knownRolesRef.current.add(r);
      return resolveAgent(r);
    });

    setTeam(prev => [...prev, ...newProfiles]);
  }, [eventRoles]);

  return { team, loading };
}
