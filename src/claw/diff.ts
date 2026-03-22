/**
 * Findings Diff — Compare reviews across sessions.
 *
 * When a document is re-reviewed, computes the delta between the
 * previous and current findings. Matches by evidence text (first
 * citation, lowercased) to identify added, resolved, changed, and
 * unchanged findings.
 *
 * All logic is local — reads findings.json from delivery directories.
 */

import * as path from 'node:path';
import { readJsonFile } from '../utils/fs-helpers.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('CLAW-DIFF');

// ── Types ────────────────────────────────────────────────────────────────

export interface DiffFinding {
  id: string;
  category: string;
  severity: string;
  content: string;
  evidence: string[];
  previousSeverity?: string;
}

export interface FindingsDiff {
  added: DiffFinding[];
  resolved: DiffFinding[];
  changed: DiffFinding[];
  unchanged: number;
  previousSessionId: string;
}

export interface FindingRecord {
  id: string;
  agent?: string;
  category: string;
  severity: string;
  confidence?: number;
  content: string;
  evidence: string[];
  timestamp?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────

/** Normalize evidence text for matching. */
function evidenceKey(finding: FindingRecord): string {
  const first = (finding.evidence?.[0] ?? '').toLowerCase().trim();
  // Also include category to prevent cross-type false matches
  return `${finding.category}:${first}`;
}

function toDiffFinding(f: FindingRecord, previousSeverity?: string): DiffFinding {
  return {
    id: f.id,
    category: f.category,
    severity: f.severity,
    content: f.content,
    evidence: f.evidence,
    ...(previousSeverity ? { previousSeverity } : {}),
  };
}

// ── Core ─────────────────────────────────────────────────────────────────

/**
 * Load findings from a previous delivery session.
 * Returns empty array if session directory or findings.json doesn't exist.
 */
export function loadPreviousFindings(clawDir: string, previousSessionId: string): FindingRecord[] {
  const findingsPath = path.join(clawDir, 'delivery', previousSessionId, 'findings.json');
  const findings = readJsonFile<FindingRecord[]>(findingsPath, []);
  if (!Array.isArray(findings)) return [];
  return findings;
}

/**
 * Compute diff between previous and current findings.
 *
 * Matching strategy: evidence key (category + first evidence text, lowercased).
 * - Added: in current, no match in previous
 * - Resolved: in previous, no match in current
 * - Changed: matched by evidence, different severity
 * - Unchanged: matched by evidence, same severity
 */
export function computeDiff(
  previousFindings: FindingRecord[],
  currentFindings: FindingRecord[],
  previousSessionId: string,
): FindingsDiff {
  const added: DiffFinding[] = [];
  const resolved: DiffFinding[] = [];
  const changed: DiffFinding[] = [];
  let unchanged = 0;

  // Index previous findings by evidence key
  const prevMap = new Map<string, FindingRecord>();
  for (const f of previousFindings) {
    const key = evidenceKey(f);
    if (key && key !== ':') {
      prevMap.set(key, f);
    }
  }

  // Track which previous findings were matched
  const matchedPrevKeys = new Set<string>();

  for (const current of currentFindings) {
    const key = evidenceKey(current);
    const prev = (key && key !== ':') ? prevMap.get(key) : undefined;

    if (prev) {
      matchedPrevKeys.add(key);
      if (prev.severity !== current.severity) {
        changed.push(toDiffFinding(current, prev.severity));
      } else {
        unchanged++;
      }
    } else {
      added.push(toDiffFinding(current));
    }
  }

  // Previous findings not matched → resolved
  for (const [key, prev] of prevMap) {
    if (!matchedPrevKeys.has(key)) {
      resolved.push(toDiffFinding(prev));
    }
  }

  return { added, resolved, changed, unchanged, previousSessionId };
}

/**
 * Summarize a diff into counts for the manifest.
 */
export function diffSummary(diff: FindingsDiff): {
  added: number;
  resolved: number;
  changed: number;
  unchanged: number;
  previousSessionId: string;
} {
  return {
    added: diff.added.length,
    resolved: diff.resolved.length,
    changed: diff.changed.length,
    unchanged: diff.unchanged,
    previousSessionId: diff.previousSessionId,
  };
}
