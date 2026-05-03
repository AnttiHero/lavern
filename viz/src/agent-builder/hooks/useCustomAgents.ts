/**
 * useCustomAgents — CRUD for user-created agents.
 *
 * Custom agents are stored in localStorage. Multiple hook instances within
 * the same tab need to stay in sync — without this, deleting an agent in
 * one component while another component holds stale state causes the
 * deleted agent to reappear when the second component next writes
 * (zombie agents from a stale React state overwriting localStorage).
 *
 * Two-layer sync:
 *   1. Every mutation reads fresh from localStorage, then merges, then
 *      writes. We never trust React state as the source of truth.
 *   2. After a write, we dispatch a same-tab CustomEvent that all hook
 *      instances listen to, plus the native `storage` event (cross-tab).
 */

import { useState, useCallback, useEffect } from 'react';
import type { AgentProfile, AgentProvenance } from '../../types/agent-profile.js';

// ── Types ──────────────────────────────────────────────────────────────

export interface CustomAgent {
  id: string;
  createdAt: string;
  profile: AgentProfile;
  /** Public share token. Empty string = not yet shared (private).
   *  When set, the public page at /a/<token> renders the card. */
  shareToken?: string;
}

// ── Storage ────────────────────────────────────────────────────────────

const STORAGE_KEY = 'shem-custom-agents';
const SAME_TAB_EVENT = 'shem-custom-agents:changed';
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
  // Notify other hook instances in this tab to re-read. The native
  // `storage` event only fires across tabs, so we need our own.
  window.dispatchEvent(new CustomEvent(SAME_TAB_EVENT));
}

// ── Hook ───────────────────────────────────────────────────────────────

export function useCustomAgents() {
  const [agents, setAgents] = useState<CustomAgent[]>(readAgents);

  // Sync on storage events — same tab (CustomEvent) and other tabs (StorageEvent).
  useEffect(() => {
    const reread = () => setAgents(readAgents());
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) reread();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener(SAME_TAB_EVENT, reread);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(SAME_TAB_EVENT, reread);
    };
  }, []);

  /** Add a new custom agent. Returns the generated ID.
   *  `provenance` records HOW this agent was created, used by the
   *  share modal to pick the right LinkedIn pre-fill text. */
  const addAgent = useCallback((profile: AgentProfile, provenance?: AgentProvenance): string => {
    const hex = Math.random().toString(16).slice(2, 6);
    const id = `custom-${Date.now()}-${hex}`;
    const enrichedProfile: AgentProfile = {
      ...profile,
      role: id,
      optional: true,
      defaultSelected: false,
      provenance: provenance
        ? { ...provenance, createdAt: provenance.createdAt ?? new Date().toISOString() }
        : profile.provenance,
    };
    const agent: CustomAgent = {
      id,
      createdAt: new Date().toISOString(),
      profile: enrichedProfile,
    };
    // Read fresh from disk, NOT from React state, so we never resurrect
    // an agent that was deleted by a sibling instance.
    const current = readAgents();
    const next = [agent, ...current].slice(0, MAX_AGENTS);
    writeAgents(next);
    setAgents(next);
    return id;
  }, []);

  /** Generate (or rotate) a public share token for an agent. */
  const setShareToken = useCallback((agentId: string, token: string): void => {
    const current = readAgents();
    const next = current.map(a => a.id === agentId ? { ...a, shareToken: token } : a);
    writeAgents(next);
    setAgents(next);
  }, []);

  /** Revoke the public share token (URL stops working). */
  const clearShareToken = useCallback((agentId: string): void => {
    const current = readAgents();
    const next = current.map(a => a.id === agentId ? { ...a, shareToken: undefined } : a);
    writeAgents(next);
    setAgents(next);
  }, []);

  /** Remove a custom agent by ID. */
  const removeAgent = useCallback((agentId: string) => {
    const current = readAgents();
    const next = current.filter(a => a.id !== agentId);
    writeAgents(next);
    setAgents(next);
  }, []);

  /** Update an existing custom agent's profile. */
  const updateAgent = useCallback((agentId: string, profile: AgentProfile) => {
    const current = readAgents();
    const next = current.map(a =>
      a.id === agentId ? { ...a, profile: { ...profile, role: agentId } } : a,
    );
    writeAgents(next);
    setAgents(next);
  }, []);

  return {
    agents,
    addAgent,
    removeAgent,
    updateAgent,
    setShareToken,
    clearShareToken,
    isAtCap: agents.length >= MAX_AGENTS,
    maxAgents: MAX_AGENTS,
  };
}
