/**
 * Hydrate a read-only session shape from a session_archive row.
 *
 * Problem: post-delivery features (derivatives, conversation, reassemble,
 * download) live behind endpoints that do `sessionManager.getSession(id)`
 * and 404 if the session is not in memory. But sessions evict after TTL
 * (4h) and die entirely on server restart — while the full record sits
 * safely in SQLite (`session_archive`).
 *
 * Solution: when the in-memory session is gone, reconstruct a minimal
 * read-only SessionState-compatible object from the archive row. The
 * reconstructed object is sufficient for endpoints that only READ from
 * session state (derivatives, conversation). Endpoints that MUTATE state
 * (reassemble) must detect the hydrated-from-archive case and handle it
 * appropriately.
 *
 * This module is read-only: it never calls session methods, never emits
 * events (no-op event bus), and never touches billing. The object is
 * shaped to match what `buildFullContext()` and `derivativeType.buildContext()`
 * read — no more, no less.
 */

import type { ArchivedSession } from '../db/database.js';
import type { Finding, DebateResolution } from '../types/debate.js';
import type { AgentRole } from '../types/index.js';

/**
 * The subset of SessionState fields that read-only post-delivery endpoints
 * need. Keep this surface small so it's easy to maintain.
 */
export interface HydratedSession {
  id: string;
  workflowTemplateId: string | null;
  accumulatedCost: number;
  budgetUsd: number;
  assembledDocument: string;
  finalOutput: string;
  /** Tabulate workflow structured result, if any. Hydrated sessions don't
   *  preserve this (it lives in memory only) — null on hydrated paths. */
  tabulateResult: unknown;
  matterRecord: {
    title: string;
    matterNumber?: string;
    status?: string;
  } | null;
  debate: {
    findings: Finding[];
    challenges: [];
    responses: [];
    resolutions: DebateResolution[];
    rounds: [];
  };
  beforeScores: never[];
  afterScores: never[];
  gateDecisions: never[];
  verificationResults: never[];
  selectedTeam: string[];
  userId: string | null;
  soul?: string;
  documents: never[];
  events: { emitEvent: (_e: unknown) => void };
  /** Flag so callers can detect hydrated sessions and reject mutations. */
  readonly _fromArchive: true;
}

interface SummaryJson {
  topFindings?: Array<{
    severity?: string;
    content?: string;
    agent?: string;
  }>;
  resolutions?: Array<{
    debateTopic?: string;
    resolution?: string;
    winningPosition?: string;
    evidenceWeight?: string;
    escalationNeeded?: boolean;
    confidence?: number;
  }>;
  debate?: {
    findingsCount?: number;
    challengesCount?: number;
    resolutionsCount?: number;
  };
}

function safeParseSummary(raw: string): SummaryJson {
  try {
    const parsed = JSON.parse(raw) as SummaryJson;
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function safeParseTeam(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** Normalize severity string to Severity union, defaulting to YELLOW. */
function normalizeSeverity(s: string | undefined): Finding['severity'] {
  const upper = (s ?? '').toUpperCase();
  if (upper === 'RED' || upper === 'YELLOW' || upper === 'GREEN') return upper;
  return 'YELLOW';
}

export function hydrateSessionFromArchive(archived: ArchivedSession): HydratedSession {
  const summary = safeParseSummary(archived.summary_json ?? '{}');
  const team = safeParseTeam(archived.team_roles ?? '[]');

  // Rebuild findings from topFindings. The archive only stores the top 10, which
  // is fine for derivatives/conversation (they surface headline issues, not an
  // exhaustive list). Fill in minimal required fields.
  const findings: Finding[] = (summary.topFindings ?? []).map((f, i) => ({
    id: `archived-finding-${i}`,
    agentRole: (f.agent ?? 'corporate-generalist') as AgentRole,
    findingType: 'contract-risk',
    content: f.content ?? '',
    severity: normalizeSeverity(f.severity),
    evidence: [],
    confidence: 0.7,
    timestamp: archived.completed_at ?? archived.created_at,
    resolved: true,
  }));

  const resolutions: DebateResolution[] = (summary.resolutions ?? []).map((r, i) => ({
    id: `archived-resolution-${i}`,
    debateTopic: r.debateTopic ?? '',
    findingIds: [],
    resolution: r.resolution ?? '',
    winningPosition: r.winningPosition ?? '',
    evidenceWeight: r.evidenceWeight ?? '',
    confidence: typeof r.confidence === 'number' ? r.confidence : 0.7,
    escalationNeeded: Boolean(r.escalationNeeded),
    resolvedBy: 'managing-partner' as AgentRole,
    timestamp: archived.completed_at ?? archived.created_at,
  }));

  return {
    id: archived.id,
    workflowTemplateId: archived.workflow_id ?? null,
    accumulatedCost: archived.cost_usd ?? 0,
    budgetUsd: archived.budget_usd ?? 0,
    assembledDocument: archived.assembled_document ?? '',
    finalOutput: archived.final_output ?? '',
    tabulateResult: null,
    matterRecord: archived.title ? { title: archived.title, status: archived.status } : null,
    debate: {
      findings,
      challenges: [],
      responses: [],
      resolutions,
      rounds: [],
    },
    beforeScores: [],
    afterScores: [],
    gateDecisions: [],
    verificationResults: [],
    selectedTeam: team,
    userId: archived.user_id ?? null,
    soul: undefined,
    documents: [],
    events: { emitEvent: () => { /* no-op for archived sessions */ } },
    _fromArchive: true,
  };
}

/** Type guard for code that needs to distinguish live vs. hydrated sessions. */
export function isHydratedFromArchive(s: unknown): s is HydratedSession {
  return typeof s === 'object' && s !== null && (s as { _fromArchive?: boolean })._fromArchive === true;
}
