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
  | 'error';        // Failed to process

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
