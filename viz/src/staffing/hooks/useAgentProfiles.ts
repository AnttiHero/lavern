/**
 * useAgentProfiles — Fetch all agent profiles once, filter/sort client-side.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { DEMO_PROFILES } from '../data/demoProfiles.js';

export interface AgentProfile {
  role: string;
  displayName: string;
  tagline: string;
  category: 'lawyer' | 'specialist' | 'infrastructure' | 'orchestrator';
  seniority: string;
  costTier: 'opus' | 'sonnet' | 'haiku';
  billingRateUsd: number;
  skills: {
    precision: number;
    creativity: number;
    speed: number;
    depth: number;
    negotiation: number;
    communication: number;
    research: number;
    risk: number;
  };
  personality: {
    archetype: string;
    workStyle: string;
    traits?: Record<string, number>;
  };
  practiceAreas: string[];
  strengths: string[];
  limitations: string[];
  optional: boolean;
  defaultSelected: boolean;
  avatarExtra?: string;
}

export type SortOption = 'default' | 'billing-asc' | 'billing-desc' | 'seniority' | 'name';
export type CategoryFilter = 'all' | 'lawyer' | 'specialist' | 'infrastructure' | 'orchestrator';

const seniorityOrder: Record<string, number> = {
  partner: 0,
  'senior-associate': 1,
  associate: 2,
  junior: 3,
  specialist: 4,
};

export function useAgentProfiles() {
  // Initialize with demo profiles — prevents empty→populated flash on standalone deploy
  const [allProfiles, setAllProfiles] = useState<AgentProfile[]>(DEMO_PROFILES as unknown as AgentProfile[]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [sort, setSort] = useState<SortOption>('default');
  const [search, setSearch] = useState('');
  const fetched = useRef(false);

  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;

    (async () => {
      try {
        const res = await fetch('/api/agents/profiles', { credentials: 'include' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setAllProfiles(data.profiles ?? []);
      } catch {
        // API unavailable (standalone deploy) — use bundled demo profiles
        setAllProfiles(DEMO_PROFILES as unknown as AgentProfile[]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useCallback(() => {
    let result = allProfiles;

    // Category filter
    if (category !== 'all') {
      result = result.filter(p => p.category === category);
    }

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(p =>
        p.displayName.toLowerCase().includes(q) ||
        p.personality.archetype.toLowerCase().includes(q) ||
        p.tagline.toLowerCase().includes(q) ||
        p.practiceAreas.some(pa => pa.toLowerCase().includes(q)) ||
        p.role.toLowerCase().includes(q)
      );
    }

    // Sort
    result = [...result];
    switch (sort) {
      case 'billing-asc':
        result.sort((a, b) => a.billingRateUsd - b.billingRateUsd);
        break;
      case 'billing-desc':
        result.sort((a, b) => b.billingRateUsd - a.billingRateUsd);
        break;
      case 'seniority':
        result.sort((a, b) => (seniorityOrder[a.seniority] ?? 9) - (seniorityOrder[b.seniority] ?? 9));
        break;
      case 'name':
        result.sort((a, b) => a.displayName.localeCompare(b.displayName));
        break;
    }

    return result;
  }, [allProfiles, category, sort, search]);

  const profiles = filtered();

  const summary = {
    total: allProfiles.length,
    lawyers: allProfiles.filter(p => p.category === 'lawyer').length,
    specialists: allProfiles.filter(p => p.category === 'specialist').length,
    infrastructure: allProfiles.filter(p => p.category === 'infrastructure').length,
    orchestrators: allProfiles.filter(p => p.category === 'orchestrator').length,
  };

  return {
    profiles,
    allProfiles,
    loading,
    error,
    summary,
    category,
    setCategory,
    sort,
    setSort,
    search,
    setSearch,
  };
}
