/**
 * useClawData — Unified fetch hook for Claw Mode.
 * Fetches status + documents + deliveries, polls every 10s.
 * Falls back to demo data when backend is unreachable.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { buildDemoStatus, buildDemoDocuments, buildDemoDeliveries, buildDemoPrecedents, type DemoPrecedentSummary } from '../data/demoData.js';
import { useClawWebSocket } from './useClawWebSocket.js';

// ── Types ───────────────────────────────────────────────────────────────

export interface ClawProfile {
  company: string;
  jurisdiction: string;
  industry: string;
  size?: string;
  concerns?: string[];
  style: string;
  intensity: string;
  riskAppetite: string;
  createdAt: string;
}

export interface ClawStatus {
  profile: ClawProfile;
  /** Maximum ethical mode — EU provider, all-confidential, conservative. */
  ethicalMode: boolean;
  /** When true, the daemon defers processing until resumed. */
  paused: boolean;
  pausedAt: string | null;
  watchPaths: string[];
  budget: {
    totalUsd: number;
    spentUsd: number;
    remainingUsd: number;
    exhausted: boolean;
  };
  documents: {
    total: number;
    reviewed: number;
    flagged: number;
    pending: number;
    errors: number;
    confidential: number;
    frontier: number;
  };
  sessions: {
    completed: number;
    failed: number;
  };
  lastScan: string;
  lastHeartbeat?: string;
  forecast?: {
    pendingCount: number;
    estimatedCostUsd: number;
    budgetAfterUsd: number;
    confidentialCount: number;
    skippedCount: number;
  };
  portfolio?: {
    totalDocuments: number;
    findings: { critical: number; major: number; minor: number; total: number };
    topDocumentTypes: Array<{ type: string; count: number }>;
    criticalDocuments: Array<{ name: string; critical: number }>;
    topPatterns: string[];
    budgetUtilization: number;
  };
  daemon: {
    installed: boolean;
    running: boolean;
    pid?: number;
  };
}

export interface ClawDocument {
  name: string;
  path: string;
  hash: string;
  type: string;
  status: string;
  sizeBytes: number;
  lastModified: string;
  lastReviewed: string | null;
  findings: { critical: number; major: number; minor: number } | null;
  costUsd: number | null;
  error: string | null;
  confidential: boolean;
}

export interface ClawDelivery {
  sessionId: string;
  filename: string;
  type: string;
  workflow: string;
  status: 'completed' | 'failed' | 'partial';
  costUsd: number;
  durationSeconds: number;
  findings: {
    findingsCount: number;
    criticalCount: number;
    majorCount: number;
    minorCount: number;
    resolutionCount: number;
  };
  diff?: {
    added: number;
    resolved: number;
    changed: number;
    unchanged: number;
    previousSessionId: string;
  } | null;
  completedAt: string;
  confidential?: boolean;
}

export interface ClawPrecedent {
  id: string;
  patternName: string;
  description: string;
  documentType: string;
  jurisdiction: string;
  qualityScore: number;
  effectivenessScore: number;
  timesUsed: number;
  timesQueried: number;
  addedAt: string;
  deprecated: boolean;
  relevanceScore: number;
  evidence: string;
  lastOutcome: { sessionId: string; timestamp: string } | null;
}

export interface ClawPrecedentSummary {
  total: number;
  active: number;
  deprecated: number;
  topPatterns: string[];
}

export interface ClawData {
  status: ClawStatus | null;
  documents: ClawDocument[];
  deliveries: ClawDelivery[];
  precedents: ClawPrecedent[];
  precedentSummary: ClawPrecedentSummary | null;
  loading: boolean;
  error: string | null;
  demoMode: boolean;
  scanning: boolean;
  paused: boolean;
  wsConnected: boolean;
  triggerScan: () => Promise<void>;
  /** Toggle maximum ethical mode via PATCH /api/claw/ethical. */
  toggleEthicalMode: (enabled: boolean) => Promise<void>;
  /** Toggle pause/resume. */
  togglePause: () => Promise<void>;
  // Exposed for demo simulator
  setStatus: React.Dispatch<React.SetStateAction<ClawStatus | null>>;
  setDocuments: React.Dispatch<React.SetStateAction<ClawDocument[]>>;
  setDeliveries: React.Dispatch<React.SetStateAction<ClawDelivery[]>>;
}

// ── Hook ────────────────────────────────────────────────────────────────

export function useClawData(): ClawData {
  const [status, setStatus] = useState<ClawStatus | null>(null);
  const [documents, setDocuments] = useState<ClawDocument[]>([]);
  const [deliveries, setDeliveries] = useState<ClawDelivery[]>([]);
  const [precedents, setPrecedents] = useState<ClawPrecedent[]>([]);
  const [precedentSummary, setPrecedentSummary] = useState<ClawPrecedentSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [demoMode, setDemoMode] = useState(false);
  const [scanning, setScanning] = useState(false);
  const mounted = useRef(true);
  const demoRef = useRef(false);
  demoRef.current = demoMode;
  // Ref for fetchData so WebSocket callbacks can call it without circular deps
  const fetchDataRef = useRef<(() => Promise<void>) | undefined>(undefined);

  // WebSocket — real-time push from Claw daemon (must be before any useEffect/useCallback that references it)
  const wsState = useClawWebSocket(!demoMode, {
    onScanCompleted: () => fetchDataRef.current?.(),
    onJobCompleted: () => fetchDataRef.current?.(),
    onJobFailed: () => fetchDataRef.current?.(),
    onPauseChange: (paused) => {
      setStatus(prev => prev ? { ...prev, paused, pausedAt: paused ? new Date().toISOString() : null } : prev);
    },
  });

  const goDemo = useCallback(() => {
    setStatus(buildDemoStatus());
    setDocuments(buildDemoDocuments());
    setDeliveries(buildDemoDeliveries());
    const demoPrec = buildDemoPrecedents();
    setPrecedents(demoPrec.precedents);
    setPrecedentSummary(demoPrec.summary);
    setDemoMode(true);
    setError(null);
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const [statusRes, docsRes, delRes, precRes, portfolioRes] = await Promise.all([
        fetch('/api/claw/status', { credentials: 'include' }),
        fetch('/api/claw/documents', { credentials: 'include' }),
        fetch('/api/claw/deliveries', { credentials: 'include' }),
        fetch('/api/claw/precedents', { credentials: 'include' }),
        fetch('/api/claw/portfolio', { credentials: 'include' }),
      ]);

      if (!mounted.current) return;

      // Any non-OK or non-JSON response → demo mode
      if (!statusRes.ok || !statusRes.headers.get('content-type')?.includes('json')) {
        goDemo();
        return;
      }

      // Parse — any failure → demo mode
      try {
        setStatus(await statusRes.json());
      } catch {
        if (mounted.current) goDemo();
        return;
      }

      if (docsRes.ok) {
        try {
          const data = await docsRes.json();
          setDocuments(data.documents ?? []);
        } catch { /* keep empty */ }
      }
      if (delRes.ok) {
        try {
          const data = await delRes.json();
          setDeliveries(data.deliveries ?? []);
        } catch { /* keep empty */ }
      }
      if (precRes.ok) {
        try {
          const data = await precRes.json();
          setPrecedents(data.precedents ?? []);
          setPrecedentSummary(data.summary ?? null);
        } catch { /* keep empty */ }
      }
      if (portfolioRes.ok) {
        try {
          const data = await portfolioRes.json();
          setStatus(prev => prev ? { ...prev, portfolio: data.portfolio } : prev);
        } catch { /* keep empty */ }
      }
      setDemoMode(false);
      setError(null);
    } catch {
      if (!mounted.current) return;
      goDemo();
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [goDemo]);

  fetchDataRef.current = fetchData;

  useEffect(() => {
    mounted.current = true;          // reset on remount (React strict mode)
    fetchData();

    // Poll: 60s when WebSocket connected, 10s otherwise
    const pollMs = wsState.connected ? 60_000 : 10_000;
    const interval = setInterval(() => {
      if (!demoRef.current) fetchData();
    }, pollMs);

    return () => {
      mounted.current = false;
      clearInterval(interval);
    };
  }, [fetchData, wsState.connected]);

  const triggerScan = useCallback(async () => {
    if (demoMode) return;
    setScanning(true);
    try {
      await fetch('/api/claw/scan', { method: 'POST', credentials: 'include' });
      await fetchData();
    } finally {
      if (mounted.current) setScanning(false);
    }
  }, [demoMode, fetchData]);

  const toggleEthicalMode = useCallback(async (enabled: boolean) => {
    if (demoMode) {
      setStatus(prev => prev ? { ...prev, ethicalMode: enabled } : prev);
      return;
    }
    try {
      await fetch('/api/claw/ethical', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ enabled }),
      });
      await fetchData();
    } catch { /* ignore — will refresh on next poll */ }
  }, [demoMode, fetchData]);

  const togglePause = useCallback(async () => {
    if (demoMode) {
      setStatus(prev => prev ? { ...prev, paused: !prev.paused, pausedAt: prev.paused ? null : new Date().toISOString() } : prev);
      return;
    }
    const endpoint = status?.paused ? '/api/claw/resume' : '/api/claw/pause';
    try {
      await fetch(endpoint, { method: 'PATCH', credentials: 'include' });
      await fetchData();
    } catch { /* ignore — will refresh on next poll */ }
  }, [demoMode, status?.paused, fetchData]);

  return {
    status, documents, deliveries, precedents, precedentSummary, loading, error, demoMode, scanning,
    paused: status?.paused ?? false,
    wsConnected: wsState.connected,
    triggerScan, toggleEthicalMode, togglePause,
    setStatus, setDocuments, setDeliveries,
  };
}
