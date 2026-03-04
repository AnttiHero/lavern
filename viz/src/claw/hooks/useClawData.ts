/**
 * useClawData — Unified fetch hook for Claw Mode.
 * Fetches status + documents + deliveries, polls every 10s.
 * Falls back to demo data when backend is unreachable.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { buildDemoStatus, buildDemoDocuments, buildDemoDeliveries } from '../data/demoData.js';

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
  daemon: {
    installed: boolean;
    running: boolean;
    pid?: number;
  };
}

export interface ClawDocument {
  name: string;
  path: string;
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
  completedAt: string;
  confidential?: boolean;
}

export interface ClawData {
  status: ClawStatus | null;
  documents: ClawDocument[];
  deliveries: ClawDelivery[];
  loading: boolean;
  error: string | null;
  demoMode: boolean;
  scanning: boolean;
  triggerScan: () => Promise<void>;
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [demoMode, setDemoMode] = useState(false);
  const [scanning, setScanning] = useState(false);
  const mounted = useRef(true);
  const demoRef = useRef(false);
  demoRef.current = demoMode;

  const goDemo = useCallback(() => {
    setStatus(buildDemoStatus());
    setDocuments(buildDemoDocuments());
    setDeliveries(buildDemoDeliveries());
    setDemoMode(true);
    setError(null);
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const [statusRes, docsRes, delRes] = await Promise.all([
        fetch('/api/claw/status', { credentials: 'include' }),
        fetch('/api/claw/documents', { credentials: 'include' }),
        fetch('/api/claw/deliveries', { credentials: 'include' }),
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
      setDemoMode(false);
      setError(null);
    } catch {
      if (!mounted.current) return;
      goDemo();
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [goDemo]);

  useEffect(() => {
    fetchData();

    // Poll every 10s in live mode only
    const interval = setInterval(() => {
      if (!demoRef.current) fetchData();
    }, 10_000);

    return () => {
      mounted.current = false;
      clearInterval(interval);
    };
  }, [fetchData]);

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

  return { status, documents, deliveries, loading, error, demoMode, scanning, triggerScan, setStatus, setDocuments, setDeliveries };
}
