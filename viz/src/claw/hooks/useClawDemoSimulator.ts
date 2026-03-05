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

// ── Activity log entry ──────────────────────────────────────────────────

export interface ClawLogEntry {
  id: string;
  icon: string;
  agent?: string;
  message: string;
  detail?: string;
  type: 'system' | 'agent' | 'finding' | 'complete';
}

interface ClawDemoOptions {
  active: boolean;
  onStatusUpdate: (fn: (prev: ClawStatus) => ClawStatus) => void;
  onDocumentsUpdate: (fn: (prev: ClawDocument[]) => ClawDocument[]) => void;
  onDeliveriesUpdate: (fn: (prev: ClawDelivery[]) => ClawDelivery[]) => void;
  onLogEntry: (entry: ClawLogEntry) => void;
  onComplete: () => void;
}

type Ctx = {
  setStatus: (fn: (s: ClawStatus) => ClawStatus) => void;
  setDocuments: (fn: (d: ClawDocument[]) => ClawDocument[]) => void;
  setDeliveries: (fn: (d: ClawDelivery[]) => ClawDelivery[]) => void;
  log: (entry: Omit<ClawLogEntry, 'id'>) => void;
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
  add(0, ({ setStatus, setDocuments, setDeliveries, log }) => {
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
    log({ icon: '\uD83D\uDD0D', message: 'Scanning watched directories...', type: 'system' });
  });

  // ── Step 2: Daemon starts ──
  add(1200, ({ setStatus, log }) => {
    setStatus(s => ({ ...s, daemon: { installed: true, running: true, pid: 42847 } }));
    log({ icon: '\u2699\uFE0F', message: 'Daemon started (PID 42847)', type: 'system' });
  });

  // ── Step 3: First document detected ──
  add(1500, ({ setDocuments, setStatus, log }) => {
    setDocuments(d => [...d, {
      name: 'vendor-nda-2025.pdf', path: '/Users/acme/Contracts/vendor-nda-2025.pdf',
      type: 'NDA', status: 'pending', sizeBytes: 84_200,
      lastModified: now(), lastReviewed: null, findings: null, costUsd: null, error: null, confidential: false,
    }]);
    setStatus(s => ({ ...s, documents: { ...s.documents, total: 1, pending: 1, frontier: 1 } }));
    log({ icon: '\uD83D\uDCC4', message: 'New document: vendor-nda-2025.pdf', detail: 'NDA \u00B7 82 KB \u00B7 queued for review', type: 'system' });
  });

  // ── Step 4: First document → processing ──
  add(2000, ({ setDocuments, log }) => {
    setDocuments(d => d.map(doc =>
      doc.name === 'vendor-nda-2025.pdf' ? { ...doc, status: 'processing' } : doc
    ));
    log({ icon: '\uD83E\uDD16', agent: 'Contract Analyst', message: 'Reviewing vendor-nda-2025.pdf...', detail: 'Checking non-compete scope, term limits, indemnification clauses', type: 'agent' });
  });

  // ── Step 5: Second document detected ──
  add(2000, ({ setDocuments, setStatus, log }) => {
    setDocuments(d => [...d, {
      name: 'cloud-services-msa.pdf', path: '/Users/acme/Contracts/cloud-services-msa.pdf',
      type: 'Master Service Agreement', status: 'pending', sizeBytes: 312_000,
      lastModified: now(), lastReviewed: null, findings: null, costUsd: null, error: null, confidential: false,
    }]);
    setStatus(s => ({
      ...s,
      documents: { ...s.documents, total: 2, pending: 2, frontier: 2 },
    }));
    log({ icon: '\uD83D\uDCC4', message: 'New document: cloud-services-msa.pdf', detail: 'Master Service Agreement \u00B7 305 KB \u00B7 queued for review', type: 'system' });
  });

  // ── Step 5b: Finding from first doc ──
  add(1200, ({ log }) => {
    log({ icon: '\u26A0\uFE0F', agent: 'Contract Analyst', message: '1 major finding in vendor-nda-2025.pdf', detail: 'Non-compete clause exceeds 2-year reasonable scope (currently 5 years)', type: 'finding' });
  });

  // ── Step 6: First document → reviewed ──
  add(1300, ({ setDocuments, setStatus, log }) => {
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
    log({ icon: '\u2705', message: 'Review complete \u2014 vendor-nda-2025.pdf', detail: '3 findings (0 critical, 1 major, 2 minor) \u00B7 $1.20', type: 'complete' });
  });

  // ── Step 7: Second document → processing ──
  add(1500, ({ setDocuments, setStatus, log }) => {
    setDocuments(d => d.map(doc =>
      doc.name === 'cloud-services-msa.pdf' ? { ...doc, status: 'processing' } : doc
    ));
    setStatus(s => ({ ...s, documents: { ...s.documents, pending: 0 } }));
    log({ icon: '\uD83E\uDD16', agent: 'Contract Reviewer', message: 'Analyzing cloud-services-msa.pdf...', detail: 'Checking liability caps, SLA obligations, data protection', type: 'agent' });
  });

  // ── Step 7b: Ethics auditor joins ──
  add(1000, ({ log }) => {
    log({ icon: '\uD83E\uDD16', agent: 'Ethics Auditor', message: 'Reviewing cloud-services-msa.pdf...', detail: 'Checking compliance obligations, regulatory language', type: 'agent' });
  });

  // ── Step 8: Third document detected (confidential!) ──
  add(1000, ({ setDocuments, setStatus, log }) => {
    setDocuments(d => [...d, {
      name: 'merger-agreement-draft.docx', path: '/Users/acme/Documents/Legal/merger-agreement-draft.docx',
      type: 'Merger Agreement', status: 'pending', sizeBytes: 445_000,
      lastModified: now(), lastReviewed: null, findings: null, costUsd: null, error: null, confidential: true,
    }]);
    setStatus(s => ({
      ...s,
      documents: { ...s.documents, total: 3, pending: 1, confidential: 1 },
    }));
    log({ icon: '\uD83D\uDD12', message: 'Confidential: merger-agreement-draft.docx', detail: 'Merger Agreement \u00B7 434 KB \u00B7 Routed to local analysis (Ollama)', type: 'system' });
  });

  // ── Step 8b: Critical findings from MSA ──
  add(1500, ({ log }) => {
    log({ icon: '\uD83D\uDD34', agent: 'Contract Reviewer', message: '2 critical findings in cloud-services-msa.pdf', detail: 'Unlimited liability exposure \u00B7 Missing data protection clause (GDPR Art. 28)', type: 'finding' });
  });

  // ── Step 9: Second document → flagged ──
  add(1000, ({ setDocuments, setStatus, log }) => {
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
    log({ icon: '\uD83D\uDEA9', message: 'Flagged \u2014 cloud-services-msa.pdf', detail: '6 findings (2 critical, 3 major, 1 minor) \u00B7 $3.40 \u00B7 Requires attention', type: 'complete' });
  });

  // ── Step 10: First delivery appears ──
  add(1500, ({ setDeliveries, setStatus, log }) => {
    setDeliveries(d => [...d, {
      sessionId: 'shem-demo-live-001', filename: 'vendor-nda-2025.pdf', type: 'NDA',
      workflow: 'review', status: 'completed', costUsd: 1.20, durationSeconds: 67,
      findings: { findingsCount: 3, criticalCount: 0, majorCount: 1, minorCount: 2, resolutionCount: 1 },
      completedAt: now(), confidential: false,
    }]);
    setStatus(s => ({ ...s, sessions: { ...s.sessions, completed: 1 } }));
    log({ icon: '\uD83D\uDCE6', message: 'Delivery: vendor-nda-2025.pdf', detail: '3 findings, 1 resolution \u00B7 67 seconds \u00B7 Ready for review', type: 'complete' });
  });

  // ── Step 11: Third document → processing (local analysis) ──
  add(1500, ({ setDocuments, setStatus, log }) => {
    setDocuments(d => d.map(doc =>
      doc.name === 'merger-agreement-draft.docx' ? { ...doc, status: 'processing' } : doc
    ));
    setStatus(s => ({ ...s, documents: { ...s.documents, pending: 0 } }));
    log({ icon: '\uD83D\uDD12', agent: 'Local Analyst (Ollama)', message: 'Analyzing merger-agreement-draft.docx on-device...', detail: 'Privilege preserved \u00B7 $0 cost \u00B7 No data leaves machine', type: 'agent' });
  });

  // ── Step 12: Third document → flagged (local, $0 cost) ──
  add(3000, ({ setDocuments, setStatus, log }) => {
    log({ icon: '\uD83D\uDD34', agent: 'Local Analyst', message: '3 critical findings in merger-agreement-draft.docx', detail: 'Vague consideration clause \u00B7 Missing MAC clause \u00B7 Unilateral termination right', type: 'finding' });
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

  // ── Step 12b: Flagged notice ──
  add(800, ({ log }) => {
    log({ icon: '\uD83D\uDEA9', message: 'Flagged \u2014 merger-agreement-draft.docx', detail: '9 findings (3 critical, 4 major, 2 minor) \u00B7 $0 \u00B7 Analyzed locally', type: 'complete' });
  });

  // ── Step 13: Second delivery appears ──
  add(1700, ({ setDeliveries, setStatus, log }) => {
    setDeliveries(d => [...d, {
      sessionId: 'shem-demo-live-002', filename: 'cloud-services-msa.pdf', type: 'Master Service Agreement',
      workflow: 'roundtable', status: 'completed', costUsd: 3.40, durationSeconds: 142,
      findings: { findingsCount: 6, criticalCount: 2, majorCount: 3, minorCount: 1, resolutionCount: 2 },
      completedAt: now(), confidential: false,
    }]);
    setStatus(s => ({ ...s, sessions: { ...s.sessions, completed: 2 } }));
    log({ icon: '\uD83D\uDCE6', message: 'Delivery: cloud-services-msa.pdf', detail: '6 findings, 2 resolutions \u00B7 2m 22s \u00B7 Ready for review', type: 'complete' });
  });

  // ── Step 14: Third delivery (confidential, local) ──
  add(2000, ({ setDeliveries, setStatus, log }) => {
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
    log({ icon: '\uD83D\uDCE6', message: 'Delivery: merger-agreement-draft.docx', detail: '9 findings, 3 resolutions \u00B7 1m 35s \u00B7 Confidential', type: 'complete' });
  });

  // ── Step 15: Final summary ──
  add(1500, ({ setStatus, log }) => {
    setStatus(s => ({
      ...s,
      budget: { ...s.budget, spentUsd: 4.60, remainingUsd: s.budget.totalUsd - 4.60 },
      documents: { ...s.documents, frontier: 2 },
    }));
    log({ icon: '\u2728', message: 'Night shift complete', detail: '3 documents \u00B7 18 findings \u00B7 $4.60 spent \u00B7 $45.40 remaining', type: 'complete' });
  });

  return script;
}

export function useClawDemoSimulator({
  active,
  onStatusUpdate,
  onDocumentsUpdate,
  onDeliveriesUpdate,
  onLogEntry,
  onComplete,
}: ClawDemoOptions) {
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Stable refs to avoid re-triggering effect on callback changes
  const cbRef = useRef({ onStatusUpdate, onDocumentsUpdate, onDeliveriesUpdate, onLogEntry, onComplete });
  cbRef.current = { onStatusUpdate, onDocumentsUpdate, onDeliveriesUpdate, onLogEntry, onComplete };

  const cleanup = useCallback(() => {
    for (const t of timersRef.current) clearTimeout(t);
    timersRef.current = [];
  }, []);

  let logCounter = 0;

  useEffect(() => {
    cleanup();
    if (!active) return;

    const script = buildClawDemoScript();
    const ctx: Ctx = {
      setStatus: fn => cbRef.current.onStatusUpdate(fn),
      setDocuments: fn => cbRef.current.onDocumentsUpdate(fn),
      setDeliveries: fn => cbRef.current.onDeliveriesUpdate(fn),
      log: entry => cbRef.current.onLogEntry({ ...entry, id: `claw-log-${++logCounter}` }),
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
