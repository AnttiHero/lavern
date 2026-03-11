/**
 * useAgentProfiles — Fetch all agent profiles once, filter/sort client-side.
 *
 * In standalone mode (Vercel, static hosting): uses bundled demo data only.
 * No API fetch, no loading state, no flicker.
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { DEMO_PROFILES } from '../data/demoProfiles.js';
import { IS_STANDALONE } from '../../standalone.js';

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
  criticalRules?: string[];
  successMetrics?: string[];
}

export type SortOption = 'default' | 'billing-asc' | 'billing-desc' | 'seniority' | 'name';
export type CategoryFilter = 'all' | 'lawyer' | 'specialist' | 'infrastructure' | 'orchestrator';

const seniorityOrder: Record<string, number> = {
  partner: 0,
  counsel: 1,
  'senior-associate': 2,
  associate: 3,
  junior: 4,
  specialist: 5,
};

export function useAgentProfiles() {
  const [allProfiles, setAllProfiles] = useState<AgentProfile[]>(DEMO_PROFILES as unknown as AgentProfile[]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [sort, setSort] = useState<SortOption>('default');
  const [search, setSearch] = useState('');
  const fetched = useRef(false);

  useEffect(() => {
    // Standalone mode: demo data is already loaded, skip fetch entirely
    if (IS_STANDALONE) return;
    if (fetched.current) return;
    fetched.current = true;

    (async () => {
      try {
        const res = await fetch('/api/agents/profiles', { credentials: 'include' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setAllProfiles(data.profiles ?? []);
      } catch {
        // API unavailable — keep demo profiles (already in state)
        setIsOffline(true);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const profiles = useMemo(() => {
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

  const summary = useMemo(() => ({
    total: allProfiles.length,
    lawyers: allProfiles.filter(p => p.category === 'lawyer').length,
    specialists: allProfiles.filter(p => p.category === 'specialist').length,
    infrastructure: allProfiles.filter(p => p.category === 'infrastructure').length,
    orchestrators: allProfiles.filter(p => p.category === 'orchestrator').length,
  }), [allProfiles]);

  return {
    profiles,
    allProfiles,
    loading,
    error,
    isOffline,
    summary,
    category,
    setCategory,
    sort,
    setSort,
    search,
    setSearch,
  };
}
