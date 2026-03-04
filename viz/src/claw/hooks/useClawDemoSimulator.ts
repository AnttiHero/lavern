/**
 * useClawDemoSimulator — Choreographed ~30s simulation of the Claw pipeline.
 *
 * Progressively reveals documents being discovered, scanned, processed,
 * and delivered. Drives the same state setters that useClawData exposes.
 *
 * Pattern modeled on useDemoSimulator (Working View).
 */

import { useEffect, useRef, useCallback } from 'react';
import type { ClawStatus, ClawDocument, ClawDelivery } from './useClawData.js';

interface ClawDemoOptions {
  active: boolean;
  onStatusUpdate: (fn: (prev: ClawStatus) => ClawStatus) => void;
  onDocumentsUpdate: (fn: (prev: ClawDocument[]) => ClawDocument[]) => void;
  onDeliveriesUpdate: (fn: (prev: ClawDelivery[]) => ClawDelivery[]) => void;
  onComplete: () => void;
}

type Ctx = {
  setStatus: (fn: (s: ClawStatus) => ClawStatus) => void;
  setDocuments: (fn: (d: ClawDocument[]) => ClawDocument[]) => void;
  setDeliveries: (fn: (d: ClawDelivery[]) => ClawDelivery[]) => void;
};

function now() { return new Date().toISOString(); }

function buildClawDemoScript(): Array<{ delayMs: number; action: (ctx: Ctx) => void }> {
  const script: Array<{ delayMs: number; action: (ctx: Ctx) => void }> = [];
  let delay = 0;

  function add(ms: number, action: (ctx: Ctx) => void) {
    delay += ms;
    script.push({ delayMs: delay, action });
  }

  // ── Step 1: Reset — clean slate ──
  add(0, ({ setStatus, setDocuments, setDeliveries }) => {
    setDocuments(() => []);
    setDeliveries(() => []);
    setStatus(s => ({
      ...s,
      documents: { total: 0, reviewed: 0, flagged: 0, pending: 0, errors: 0, confidential: 0, frontier: 0 },
      sessions: { completed: 0, failed: 0 },
      budget: { ...s.budget, spentUsd: 0, remainingUsd: s.budget.totalUsd, exhausted: false },
      lastScan: now(),
      daemon: { installed: true, running: false },
    }));
  });

  // ── Step 2: Daemon starts ──
  add(1200, ({ setStatus }) => {
    setStatus(s => ({ ...s, daemon: { installed: true, running: true, pid: 42847 } }));
  });

  // ── Step 3: First document detected ──
  add(1500, ({ setDocuments, setStatus }) => {
    setDocuments(d => [...d, {
      name: 'vendor-nda-2025.pdf', path: '/Users/acme/Contracts/vendor-nda-2025.pdf',
      type: 'NDA', status: 'pending', sizeBytes: 84_200,
      lastModified: now(), lastReviewed: null, findings: null, costUsd: null, error: null, confidential: false,
    }]);
    setStatus(s => ({ ...s, documents: { ...s.documents, total: 1, pending: 1, frontier: 1 } }));
  });

  // ── Step 4: First document → processing ──
  add(2000, ({ setDocuments }) => {
    setDocuments(d => d.map(doc =>
      doc.name === 'vendor-nda-2025.pdf' ? { ...doc, status: 'processing' } : doc
    ));
  });

  // ── Step 5: Second document detected ──
  add(2000, ({ setDocuments, setStatus }) => {
    setDocuments(d => [...d, {
      name: 'cloud-services-msa.pdf', path: '/Users/acme/Contracts/cloud-services-msa.pdf',
      type: 'Master Service Agreement', status: 'pending', sizeBytes: 312_000,
      lastModified: now(), lastReviewed: null, findings: null, costUsd: null, error: null, confidential: false,
    }]);
    setStatus(s => ({
      ...s,
      documents: { ...s.documents, total: 2, pending: 2, frontier: 2 },
    }));
  });

  // ── Step 6: First document → reviewed ──
  add(2500, ({ setDocuments, setStatus }) => {
    setDocuments(d => d.map(doc =>
      doc.name === 'vendor-nda-2025.pdf'
        ? { ...doc, status: 'reviewed', lastReviewed: now(), findings: { critical: 0, major: 1, minor: 2 }, costUsd: 1.20 }
        : doc
    ));
    setStatus(s => ({
      ...s,
      documents: { ...s.documents, pending: 1, reviewed: 1 },
      budget: { ...s.budget, spentUsd: 1.20, remainingUsd: s.budget.totalUsd - 1.20 },
    }));
  });

  // ── Step 7: Second document → processing ──
  add(1500, ({ setDocuments, setStatus }) => {
    setDocuments(d => d.map(doc =>
      doc.name === 'cloud-services-msa.pdf' ? { ...doc, status: 'processing' } : doc
    ));
    setStatus(s => ({ ...s, documents: { ...s.documents, pending: 0 } }));
  });

  // ── Step 8: Third document detected (confidential!) ──
  add(2000, ({ setDocuments, setStatus }) => {
    setDocuments(d => [...d, {
      name: 'merger-agreement-draft.docx', path: '/Users/acme/Documents/Legal/merger-agreement-draft.docx',
      type: 'Merger Agreement', status: 'pending', sizeBytes: 445_000,
      lastModified: now(), lastReviewed: null, findings: null, costUsd: null, error: null, confidential: true,
    }]);
    setStatus(s => ({
      ...s,
      documents: { ...s.documents, total: 3, pending: 1, confidential: 1 },
    }));
  });

  // ── Step 9: Second document → flagged ──
  add(2500, ({ setDocuments, setStatus }) => {
    setDocuments(d => d.map(doc =>
      doc.name === 'cloud-services-msa.pdf'
        ? { ...doc, status: 'flagged', lastReviewed: now(), findings: { critical: 2, major: 3, minor: 1 }, costUsd: 3.40 }
        : doc
    ));
    setStatus(s => ({
      ...s,
      documents: { ...s.documents, pending: 1, flagged: 1 },
      budget: { ...s.budget, spentUsd: 4.60, remainingUsd: s.budget.totalUsd - 4.60 },
    }));
  });

  // ── Step 10: First delivery appears ──
  add(2000, ({ setDeliveries, setStatus }) => {
    setDeliveries(d => [...d, {
      sessionId: 'shem-demo-live-001', filename: 'vendor-nda-2025.pdf', type: 'NDA',
      workflow: 'review', status: 'completed', costUsd: 1.20, durationSeconds: 67,
      findings: { findingsCount: 3, criticalCount: 0, majorCount: 1, minorCount: 2, resolutionCount: 1 },
      completedAt: now(), confidential: false,
    }]);
    setStatus(s => ({ ...s, sessions: { ...s.sessions, completed: 1 } }));
  });

  // ── Step 11: Third document → processing (local analysis) ──
  add(1500, ({ setDocuments, setStatus }) => {
    setDocuments(d => d.map(doc =>
      doc.name === 'merger-agreement-draft.docx' ? { ...doc, status: 'processing' } : doc
    ));
    setStatus(s => ({ ...s, documents: { ...s.documents, pending: 0 } }));
  });

  // ── Step 12: Third document → flagged (local, $0 cost) ──
  add(3500, ({ setDocuments, setStatus }) => {
    setDocuments(d => d.map(doc =>
      doc.name === 'merger-agreement-draft.docx'
        ? { ...doc, status: 'flagged', lastReviewed: now(), findings: { critical: 3, major: 4, minor: 2 }, costUsd: 0 }
        : doc
    ));
    setStatus(s => ({
      ...s,
      documents: { ...s.documents, flagged: 2 },
    }));
  });

  // ── Step 13: Second delivery appears ──
  add(2500, ({ setDeliveries, setStatus }) => {
    setDeliveries(d => [...d, {
      sessionId: 'shem-demo-live-002', filename: 'cloud-services-msa.pdf', type: 'Master Service Agreement',
      workflow: 'roundtable', status: 'completed', costUsd: 3.40, durationSeconds: 142,
      findings: { findingsCount: 6, criticalCount: 2, majorCount: 3, minorCount: 1, resolutionCount: 2 },
      completedAt: now(), confidential: false,
    }]);
    setStatus(s => ({ ...s, sessions: { ...s.sessions, completed: 2 } }));
  });

  // ── Step 14: Third delivery (confidential, local) ──
  add(2000, ({ setDeliveries, setStatus }) => {
    setDeliveries(d => [...d, {
      sessionId: 'shem-demo-live-003', filename: 'merger-agreement-draft.docx', type: 'Merger Agreement',
      workflow: 'roundtable', status: 'completed', costUsd: 0, durationSeconds: 95,
      findings: { findingsCount: 9, criticalCount: 3, majorCount: 4, minorCount: 2, resolutionCount: 3 },
      completedAt: now(), confidential: true,
    }]);
    setStatus(s => ({
      ...s,
      sessions: { ...s.sessions, completed: 3 },
      lastScan: now(),
    }));
  });

  // ── Step 15: Final budget update ──
  add(1500, ({ setStatus }) => {
    setStatus(s => ({
      ...s,
      budget: { ...s.budget, spentUsd: 4.60, remainingUsd: s.budget.totalUsd - 4.60 },
      documents: { ...s.documents, frontier: 2 },
    }));
  });

  return script;
}

export function useClawDemoSimulator({
  active,
  onStatusUpdate,
  onDocumentsUpdate,
  onDeliveriesUpdate,
  onComplete,
}: ClawDemoOptions) {
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Stable refs to avoid re-triggering effect on callback changes
  const cbRef = useRef({ onStatusUpdate, onDocumentsUpdate, onDeliveriesUpdate, onComplete });
  cbRef.current = { onStatusUpdate, onDocumentsUpdate, onDeliveriesUpdate, onComplete };

  const cleanup = useCallback(() => {
    for (const t of timersRef.current) clearTimeout(t);
    timersRef.current = [];
  }, []);

  useEffect(() => {
    cleanup();
    if (!active) return;

    const script = buildClawDemoScript();
    const ctx: Ctx = {
      setStatus: fn => cbRef.current.onStatusUpdate(fn),
      setDocuments: fn => cbRef.current.onDocumentsUpdate(fn),
      setDeliveries: fn => cbRef.current.onDeliveriesUpdate(fn),
    };

    for (const { delayMs, action } of script) {
      const timer = setTimeout(() => action(ctx), delayMs);
      timersRef.current.push(timer);
    }

    // Fire onComplete after the last step
    const lastDelay = script[script.length - 1]?.delayMs ?? 0;
    const completeTimer = setTimeout(() => cbRef.current.onComplete(), lastDelay + 800);
    timersRef.current.push(completeTimer);

    return cleanup;
  }, [active, cleanup]);
}
