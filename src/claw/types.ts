/**
 * Claw Mode Types — The self-driving law firm.
 *
 * "Work for me. Always."
 */

import type { IntensityLevel } from '../types/engagement.js';
import type { DocumentStyle } from '../assembly/format-converter.js';

// ── Client Profile ──────────────────────────────────────────────────────

/** Created during `lavern claw init`. The firm's understanding of who you are. */
export interface ClawProfile {
  company: string;
  jurisdiction: string;
  industry: string;
  size: string;
  concerns: string[];
  preferences: {
    style: 'plain-language' | 'traditional' | 'accessible';
    intensity: IntensityLevel;
    riskAppetite: 'conservative' | 'balanced' | 'aggressive';
  };
  watchPaths: string[];
  budget: {
    totalUsd: number;
    perDocumentMaxUsd: number;
  };
  /** Glob patterns for filenames requiring local-only processing (privilege preservation) */
  sensitivityPatterns?: string[];
  /** Maximum ethical mode — EU provider, all-confidential, conservative risk. One toggle, full protection. */
  ethicalMode?: boolean;
  /** When true, the daemon accepts file changes but defers processing until resumed. */
  paused?: boolean;
  /** ISO 8601 timestamp when the daemon was paused. */
  pausedAt?: string;
  /** Scheduled periodic re-review of all documents. */
  reviewSchedule?: {
    enabled: boolean;
    intervalDays: number;   // e.g., 90
  };
  /** Processing mode for sensitive documents: 'local' (default), 'frontier', 'hybrid' */
  processing?: 'local' | 'frontier' | 'hybrid';
  createdAt: string;
}

// ── Document Registry ───────────────────────────────────────────────────

export type DocumentStatus =
  | 'new'           // Just discovered, not yet processed
  | 'queued'        // Waiting to be processed
  | 'processing'    // Currently being worked on
  | 'reviewed'      // Successfully processed
  | 'flagged'       // Processed but has critical findings
  | 'stale'         // Document changed since last review
  | 'skipped'       // Watchman triaged as not worth deep-reading (lighthouse soft-skip)
  | 'error';        // Failed to process

// ── Watchman / Lighthouse Architecture ──────────────────────────────────

/** Document type recognized by the Watchman. Drives Reader template selection. */
export type WatchmanDocumentType =
  | 'jv'            // Joint venture agreement
  | 'nda'           // Non-disclosure agreement
  | 'employment'    // Employment / offer letter
  | 'lease'         // Real-estate lease
  | 'loan'          // Credit / loan agreement
  | 'saas'          // SaaS / vendor agreement
  | 'policy'        // ToS / privacy policy / EULA
  | 'other';        // Unknown — Reader uses generic template

/** What the Watchman decides happens to a document next. */
export type WatchmanRoute =
  | 'skip'          // Not worth deep-reading (meeting agenda, empty boilerplate, duplicate)
  | 'quick-scan'    // Routine — single synthesis pass, no per-clause fan-out
  | 'deep-read';    // Full per-clause analysis (the default for substantive contracts)

/** Per-document triage decision. One LLM call, structured output, runs first. */
export interface WatchmanResult {
  documentType: WatchmanDocumentType;
  jurisdiction: string;          // best guess from defined terms / governing-law scan
  confidence: number;            // 0-1, how sure the Watchman is about the type
  urgency: 'routine' | 'elevated' | 'critical';
  route: WatchmanRoute;
  /** Reader template ID. Today this matches `documentType`; reserved as a separate
   *  field so a future template registry can diverge from the type taxonomy. */
  readerTemplate: string;
  rationale: string;
  /** How the Watchman reached its conclusion. */
  method: 'sidecar' | 'llm-local' | 'llm-cloud' | 'heuristic';
  /** Inference cost in USD (zero on local, ~$0.001 on Haiku cloud fallback). */
  costUsd: number;
}

// ── Reader (Phase 2) ────────────────────────────────────────────────────

/** Single finding emitted by the Reader. */
export interface ReaderFinding {
  id: string;
  clauseRef: string;             // e.g. "§4.2" or "cl 18.3"
  severity: 'red' | 'yellow' | 'green';
  title: string;
  evidence: string;              // verbatim quote from the document
  rationale: string;
  /** PREC-id of the precedent this finding reconciled with, if any. */
  precedentMatch?: string;
  confidence: number;
  /** Set to true when the grounding pass could not anchor this finding to
   *  document text. Such findings are stripped from the deliverable but
   *  retained in the audit trail. */
  unanchored?: boolean;
}

export interface ReaderResult {
  findings: ReaderFinding[];
  documentSummary: string;
  documentType: string;          // confirms or revises Watchman's guess
  jurisdictionGuess: string;
  precedentsConsulted: string[]; // PREC-ids surfaced during the per-clause sweep
  /** Number of findings stripped by the grounding pass. */
  unanchoredStripped: number;
  model: string;
}

// ── Curator (Phase 3+) ──────────────────────────────────────────────────

/** What the Curator decides to do at a heartbeat tick. */
export interface CuratorDecision {
  /** Document hashes the Curator wants re-read because precedents changed. */
  reReadQueue: string[];
  /** Single consolidated user-facing notification, if anything is worth saying. */
  surface?: {
    title: string;
    message: string;
    severity: 'info' | 'warning' | 'critical';
  };
  /** Precedent IDs the Curator wants promoted from 'tentative' to 'confirmed'. */
  promoteToConfirmed: string[];
  /** Precedent IDs flagged for drift (inconsistent verdicts over time). */
  driftDetected: string[];
  /** When the Curator's confidence is low and frontier escalation is permitted,
   *  list the document hashes that should be sent through hybrid analysis. */
  requestFrontierEscalation: string[];
}

export interface DocumentEntry {
  path: string;
  name: string;
  type: string;               // Inferred document type: "NDA", "Terms of Service", etc.
  hash: string;                // SHA-256 of file content
  sizeBytes: number;
  firstSeen: string;           // ISO 8601
  lastModified: string;        // ISO 8601
  lastReviewed?: string;       // ISO 8601
  lastReviewSession?: string;  // Session ID
  status: DocumentStatus;
  findingsSummary?: {
    critical: number;
    major: number;
    minor: number;
  };
  costUsd?: number;            // Cost of last review
  error?: string;              // Error message if status === 'error'
  confidential?: boolean;      // Processed via local model (privilege preservation)
}

/** Persistent state tracked across Claw Mode sessions. */
export interface ClawState {
  documents: Record<string, DocumentEntry>;  // Keyed by hash
  budget: {
    totalUsd: number;
    spentUsd: number;
  };
  lastScan: string;            // ISO 8601
  sessionsCompleted: number;
  sessionsFailed: number;
}

// ── Cost Forecast ────────────────────────────────────────────────────────

/** Read-only cost estimate for pending documents (no registry mutation). */
export interface CostForecast {
  pendingCount: number;
  estimatedCostUsd: number;
  budgetAfterUsd: number;
  confidentialCount: number;
  skippedCount: number;
}

// ── Job ─────────────────────────────────────────────────────────────────

export interface ClawJob {
  id: string;                  // Session ID
  documentPath: string;
  documentName: string;
  documentHash: string;
  trigger: 'new' | 'changed' | 'sidecar' | 'manual';
  status: 'queued' | 'processing' | 'completed' | 'failed';
  /** When true, process with local model only — no data leaves the machine */
  confidential?: boolean;
  /** Processing mode override */
  processing?: 'local' | 'frontier' | 'hybrid';
  /** Sensitivity pattern that matched */
  matchedPattern?: string;
  startedAt?: string;
  completedAt?: string;
  costUsd?: number;
  error?: string;
}

// ── Sidecar ─────────────────────────────────────────────────────────────

export interface SidecarConfig {
  task?: string;               // Free-text instructions
  request?: string;            // Specific request text
  workflow?: string;           // Force a specific workflow
  intensity?: IntensityLevel;
  budget?: number;             // Per-document budget override
  context?: {
    audience?: string;
    jurisdiction?: string;
    moment?: string;
    focus?: string;
  };
  output?: {
    formats?: string[];        // ['markdown', 'docx']
    style?: string;            // 'traditional' | 'elegant' | 'accessible'
  };
}

// ── Manifest ────────────────────────────────────────────────────────────

export interface ClawManifest {
  sessionId: string;
  version: string;

  input: {
    filename: string;
    path: string;
    extension: string;
    sizeBytes: number;
    detectedType: string;
    sidecarUsed: boolean;
  };

  task: {
    requestText: string;
    workflow: string;
    intensity: string;
    inferenceMethod: 'sidecar' | 'llm' | 'heuristic';
  };

  execution: {
    startedAt: string;
    completedAt: string;
    durationSeconds: number;
    model: string;
    totalCostUsd: number;
    budgetUsd: number;
    agentsUsed: string[];
  };

  analysis: {
    findingsCount: number;
    criticalCount: number;
    majorCount: number;
    minorCount: number;
    resolutionCount: number;
    debateRounds: number;
    verificationPassed: boolean | null;
  };

  outputs: {
    markdown: string;          // Relative path
    docx?: string;
    html?: string;
    findings: string;
  };

  /** Change detection: diff against previous review (if re-reviewed). */
  diff?: {
    added: number;
    resolved: number;
    changed: number;
    unchanged: number;
    previousSessionId: string;
  };

  /** Processing mode used */
  processing?: 'local' | 'frontier' | 'hybrid';

  /** For hybrid: breakdown of local vs frontier findings */
  hybridStats?: {
    localFindings: number;
    frontierFindings: number;
    mergedFindings: number;
    clausesSentToFrontier: number;
    totalClauses: number;
    entityCount: number;
  };

  status: 'completed' | 'failed' | 'partial';
  /** True when document was analyzed entirely on-device (privilege preservation) */
  confidential?: boolean;
  error?: string;
}

// ── Config ──────────────────────────────────────────────────────────────

export interface ClawConfig {
  dir: string;                 // Root directory (~/.lavern)
  profile: ClawProfile;
  budget: number;              // Override budget
  perDocBudget: number;
  intensity: IntensityLevel;
  style: DocumentStyle;
  formats: string[];
  scanIntervalMs: number;
  once: boolean;               // Batch mode: process once, then exit
  dryRun: boolean;
  debug: boolean;
  /** When true, use EU provider for all frontier processing + treat all docs as confidential. */
  ethicalMode: boolean;
  /** LLM model for document processing (default: Sonnet for batch efficiency). */
  model?: string;
}

// ── Shared Helpers ─────────────────────────────────────────────────────

export interface FindingsSummary {
  critical: number;
  major: number;
  minor: number;
}

/**
 * Extract findings counts from a session's debate state.
 * Used by both processor.ts and delivery.ts.
 */
export function extractSessionFindings(session: {
  debate?: { findings?: Array<{ severity?: string }> };
  verificationResults?: Array<{ passed?: boolean }>;
}): FindingsSummary {
  const findings = session.debate?.findings ?? [];
  let critical = 0;
  let major = 0;
  let minor = 0;

  for (const f of findings) {
    const sev = (f.severity ?? '').toUpperCase();
    if (sev === 'RED' || sev === 'CRITICAL') critical++;
    else if (sev === 'YELLOW' || sev === 'MAJOR') major++;
    else minor++;
  }

  // If no debate findings, check verification results
  if (findings.length === 0 && session.verificationResults) {
    for (const v of session.verificationResults) {
      if (!v.passed) critical++;
    }
  }

  return { critical, major, minor };
}
