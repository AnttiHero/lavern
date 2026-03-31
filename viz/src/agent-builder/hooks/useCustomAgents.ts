/**
 * useCustomAgents — CRUD for user-created agents.
 *
 * Custom agents are stored in the user profile alongside saved teams.
 * They persist in localStorage and sync to the server via the existing
 * useUserProfile infrastructure.
 */

import { useState, useCallback, useEffect } from 'react';
import type { AgentProfile } from '../../types/agent-profile.js';

// ── Types ──────────────────────────────────────────────────────────────

export interface CustomAgent {
  id: string;
  createdAt: string;
  profile: AgentProfile;
}

// ── Storage ────────────────────────────────────────────────────────────

const STORAGE_KEY = 'shem-custom-agents';
const MAX_AGENTS = 20;

function readAgents(): CustomAgent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeAgents(agents: CustomAgent[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(agents));
}

// ── Hook ───────────────────────────────────────────────────────────────

export function useCustomAgents() {
  const [agents, setAgents] = useState<CustomAgent[]>(readAgents);

  // Sync from localStorage on mount (for multi-tab)
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setAgents(readAgents());
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  /** Add a new custom agent. Returns the generated ID. */
  const addAgent = useCallback((profile: AgentProfile): string => {
    const hex = Math.random().toString(16).slice(2, 6);
    const id = `custom-${Date.now()}-${hex}`;
    const agent: CustomAgent = {
      id,
      createdAt: new Date().toISOString(),
      profile: { ...profile, role: id, optional: true, defaultSelected: false },
    };

    setAgents(prev => {
      const next = [agent, ...prev].slice(0, MAX_AGENTS);
      writeAgents(next);
      return next;
    });

    return id;
  }, []);

  /** Remove a custom agent by ID. */
  const removeAgent = useCallback((agentId: string) => {
    setAgents(prev => {
      const next = prev.filter(a => a.id !== agentId);
      writeAgents(next);
      return next;
    });
  }, []);

  /** Update an existing custom agent's profile. */
  const updateAgent = useCallback((agentId: string, profile: AgentProfile) => {
    setAgents(prev => {
      const next = prev.map(a =>
        a.id === agentId ? { ...a, profile: { ...profile, role: agentId } } : a,
      );
      writeAgents(next);
      return next;
    });
  }, []);

  return {
    agents,
    addAgent,
    removeAgent,
    updateAgent,
    isAtCap: agents.length >= MAX_AGENTS,
    maxAgents: MAX_AGENTS,
  };
}
