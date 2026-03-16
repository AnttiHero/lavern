/**
 * useSessionMemory — Fetch session archive learnings for the Archive page.
 * Extracts topFindings and resolutions from recent completed sessions.
 */

import { useState, useEffect, useRef } from 'react';

export interface MemoryEntry {
  id: string;
  type: 'finding' | 'resolution' | 'pattern';
  content: string;
  severity?: string;
  agent?: string;
  sessionId: string;
  sessionTitle: string;
  completedAt: string;
}

// Demo entries shown when no backend
const DEMO_MEMORIES: MemoryEntry[] = [
  {
    id: 'demo-1',
    type: 'finding',
    content: 'Color contrast ratios fell below WCAG 2.1 AA thresholds in three sections, affecting readers with visual impairments.',
    severity: 'RED',
    agent: 'Ethics Auditor',
    sessionId: 'demo-session-preview',
    sessionTitle: 'Terms of Service Redesign',
    completedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
  },
  {
    id: 'demo-2',
    type: 'resolution',
    content: 'Heading hierarchy upgraded from cosmetic concern to structural accessibility issue — a distinction that changed the transformation approach.',
    sessionId: 'demo-session-preview',
    sessionTitle: 'Terms of Service Redesign',
    completedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
  },
  {
    id: 'demo-3',
    type: 'pattern',
    content: 'Plain language rewrites of liability clauses can reduce reading grade by 6+ levels without altering legal meaning when verified by independent cross-check.',
    sessionId: 'demo-session-preview',
    sessionTitle: 'Terms of Service Redesign',
    completedAt: new Date(Date.now() - 3 * 86400000).toISOString(),
  },
];

export function useSessionMemory() {
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [demoMode, setDemoMode] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;

    async function load() {
      try {
        // Fetch archive list
        const res = await fetch('/api/sessions/archive', { credentials: 'include' });
        if (!res.ok) throw new Error('No archive');
        const list = await res.json();
        if (cancelled) return;

        const sessions = Array.isArray(list) ? list : (list.sessions ?? []);
        if (sessions.length === 0) {
          setMemories([]);
          setLoading(false);
          return;
        }

        // Fetch detail for top 5 most recent
        const entries: MemoryEntry[] = [];
        const recent = sessions.slice(0, 5);

        for (const s of recent) {
          try {
            const detRes = await fetch(`/api/sessions/archive/${s.id}`, { credentials: 'include' });
            if (!detRes.ok) continue;
            const detail = await detRes.json();
            if (cancelled) return;

            let summary: Record<string, any>;
            if (typeof detail.summary === 'string') {
              try { summary = JSON.parse(detail.summary); } catch { summary = {}; }
            } else {
              summary = detail.summary ?? detail.summary_json ?? {};
            }
            const title = detail.title ?? s.title ?? 'Untitled';
            const completedAt = detail.completedAt ?? s.completedAt ?? s.created_at ?? '';

            // Extract findings
            const findings = summary.topFindings ?? [];
            for (const f of findings.slice(0, 3)) {
              entries.push({
                id: `${s.id}-f-${entries.length}`,
                type: 'finding',
                content: f.content,
                severity: f.severity,
                agent: f.agent,
                sessionId: s.id,
                sessionTitle: title,
                completedAt,
              });
            }

            // Extract resolutions
            const resolutions = summary.resolutions ?? [];
            for (const r of resolutions.slice(0, 2)) {
              entries.push({
                id: `${s.id}-r-${entries.length}`,
                type: 'resolution',
                content: r.resolution,
                sessionId: s.id,
                sessionTitle: title,
                completedAt,
              });
            }
          } catch { /* skip failed detail fetch */ }
        }

        if (mounted.current && !cancelled) {
          setMemories(entries);
          setLoading(false);
        }
      } catch {
        // Backend unreachable — show demo
        if (mounted.current && !cancelled) {
          setMemories(DEMO_MEMORIES);
          setDemoMode(true);
          setLoading(false);
        }
      }
    }

    load();
    return () => { cancelled = true; mounted.current = false; };
  }, []);

  return { memories, loading, demoMode };
}
