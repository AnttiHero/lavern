/**
 * Precedent Board — Institutional Memory for Claw Mode.
 *
 * After each document is processed, significant findings are indexed
 * into the board. Before processing future documents, the board is
 * queried and matching precedents are injected as context.
 *
 * All logic is local (no LLM calls). Per-client isolated. Evidence-linked.
 * Confidence-decaying. Follows the DocumentRegistry persistence pattern.
 *
 * Persistence: `~/.lavern/precedents.json` (atomic writes).
 *
 * Hardened: dedup index, clamped scores, evidence guards, NaN-safe dates,
 * bounded outcomes, sanitized inputs.
 */

import * as crypto from 'node:crypto';
import * as path from 'node:path';
import { readJsonFile, writeJsonFileAtomic, ensureDir } from '../utils/fs-helpers.js';
import { config } from '../config.js';
import { createLogger } from '../utils/logger.js';
import type { PrecedentEntry, MemoryTags } from '../mcp/tools/memory-system.js';
import type { Finding } from '../types/debate.js';

const logger = createLogger('PRECEDENT-BOARD');

// ── Types ────────────────────────────────────────────────────────────────

export interface PrecedentBoardState {
  entries: Record<string, PrecedentEntry>;
  version: number;
  lastDecay: string;
}

export interface PrecedentQuery {
  findingType?: string;
  severity?: 'RED' | 'YELLOW' | 'GREEN';
  jurisdiction?: string;
  documentType?: string;
  textQuery?: string;
  limit?: number;
}

export interface PrecedentMatch {
  entry: PrecedentEntry;
  relevanceScore: number;
}

export interface PrecedentSummary {
  total: number;
  active: number;
  deprecated: number;
  topPatterns: string[];
}

// ── Helpers ──────────────────────────────────────────────────────────────

function emptyState(): PrecedentBoardState {
  return {
    entries: {},
    version: 1,
    lastDecay: new Date().toISOString(),
  };
}

/** Dedup key: full SHA-256 of normalized findingType + first evidence string. */
function dedupKey(findingType: string, evidence: string[]): string {
  const raw = `${findingType}:${(evidence[0] ?? '').toLowerCase().trim().slice(0, 200)}`;
  return crypto.createHash('sha256').update(raw).digest('hex');
}

/** Human-readable pattern name from finding type. */
function patternNameFromType(findingType: string): string {
  return findingType
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ') + ' Pattern';
}

/** Days between two ISO timestamps. Returns 0 on invalid dates. */
function daysBetween(a: string, b: string): number {
  const ta = new Date(a).getTime();
  const tb = new Date(b).getTime();
  if (isNaN(ta) || isNaN(tb)) return 0;
  return Math.abs(ta - tb) / (1000 * 60 * 60 * 24);
}

/** Clamp a number to [min, max]. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ── Board ────────────────────────────────────────────────────────────────

export class PrecedentBoard {
  private state: PrecedentBoardState;
  private statePath: string;
  private archivePath: string;
  /** O(1) dedup index: SHA-256 key → precedent ID */
  private dedupIndex: Map<string, string>;

  constructor(dir: string) {
    this.statePath = path.join(dir, 'precedents.json');
    this.archivePath = path.join(dir, 'precedents-archive.json');
    ensureDir(dir);
    this.state = readJsonFile<PrecedentBoardState>(this.statePath, emptyState());
    this.dedupIndex = this.buildDedupIndex();
  }

  /** Build dedup index from current state. */
  private buildDedupIndex(): Map<string, string> {
    const index = new Map<string, string>();
    for (const [id, entry] of Object.entries(this.state.entries)) {
      const key = dedupKey(
        entry.tags?.custom?.[0] ?? entry.patternName,
        [entry.beforeSnippet],
      );
      index.set(key, id);
    }
    return index;
  }

  // ── Persistence ────────────────────────────────────────────────────────

  save(): void {
    writeJsonFileAtomic(this.statePath, this.state);
  }

  getState(): PrecedentBoardState {
    return this.state;
  }

  // ── Indexing ───────────────────────────────────────────────────────────

  /**
   * Index significant findings from a completed session.
   * Only RED/YELLOW findings with confidence >= 0.7 and non-empty evidence are indexed.
   * Deduplicates by finding type + first evidence text via O(1) index lookup.
   */
  indexFindings(
    documentHash: string,
    documentType: string,
    jurisdiction: string,
    findings: Finding[],
  ): number {
    if (!Array.isArray(findings) || findings.length === 0) return 0;

    const significant = findings.filter(
      f => (f.severity === 'RED' || f.severity === 'YELLOW')
        && f.confidence >= 0.7
        && Array.isArray(f.evidence) && f.evidence.length > 0
        && f.evidence[0].length > 0
        && typeof f.findingType === 'string' && f.findingType.length > 0
        && typeof f.content === 'string' && f.content.length > 0,
    );

    if (significant.length === 0) return 0;

    let indexed = 0;
    const now = new Date().toISOString();

    for (const finding of significant) {
      const key = dedupKey(finding.findingType, finding.evidence);

      // O(1) dedup check
      const existingId = this.dedupIndex.get(key);
      if (existingId && this.state.entries[existingId]) {
        this.reinforce(existingId, documentHash, 0.1);
      } else {
        const id = `PREC-${crypto.randomBytes(4).toString('hex')}`;
        const tags: MemoryTags = {
          documentType,
          jurisdiction,
          engagementType: 'review',
          custom: [finding.findingType],
        };

        const entry: PrecedentEntry = {
          id,
          documentType,
          jurisdiction,
          patternName: patternNameFromType(finding.findingType),
          description: finding.content.slice(0, 300),
          beforeSnippet: finding.evidence[0],
          afterSnippet: '',
          qualityScore: finding.confidence,
          addedAt: now,
          timesUsed: 1,
          timesQueried: 0,
          effectivenessScore: clamp(finding.confidence / 4, 0, 1),
          outcomes: [{
            sessionId: documentHash,
            timestamp: now,
            applied: true,
            scoreDelta: 0,
            verificationPassed: true,
          }],
          deprecated: false,
          tags,
        };

        this.state.entries[id] = entry;
        this.dedupIndex.set(key, id);
        indexed++;
        logger.info('Precedent indexed', { id, findingType: finding.findingType, severity: finding.severity });
      }
    }

    if (indexed > 0 || significant.length > 0) {
      this.save();
    }

    return indexed;
  }

  // ── Search ────────────────────────────────────────────────────────────

  search(query: PrecedentQuery): PrecedentMatch[] {
    const limit = query.limit ?? 10;
    const now = new Date().toISOString();
    const entries = Object.values(this.state.entries).filter(e => !e.deprecated);

    if (entries.length === 0) return [];

    // Single-pass filtering
    const ftLower = query.findingType?.toLowerCase();
    const jLower = query.jurisdiction?.toLowerCase();
    const dtLower = query.documentType?.toLowerCase();
    const qLower = query.textQuery?.toLowerCase();

    const filtered = entries.filter(e => {
      if (ftLower && !(
        e.patternName.toLowerCase().includes(ftLower) ||
        (e.tags?.custom ?? []).some(c => c.toLowerCase().includes(ftLower))
      )) return false;
      if (jLower && !(e.tags?.jurisdiction ?? e.jurisdiction).toLowerCase().includes(jLower)) return false;
      if (dtLower && !(e.tags?.documentType ?? e.documentType).toLowerCase().includes(dtLower)) return false;
      if (qLower && !(
        e.description.toLowerCase().includes(qLower) ||
        e.beforeSnippet.toLowerCase().includes(qLower) ||
        e.patternName.toLowerCase().includes(qLower)
      )) return false;
      return true;
    });

    if (filtered.length === 0) return [];

    // Score and sort
    const maxUsed = Math.max(1, ...filtered.map(e => e.timesUsed));

    const scored: PrecedentMatch[] = filtered.map(e => {
      const usageScore = e.timesUsed / maxUsed;
      const lastActivity = e.outcomes.length > 0
        ? e.outcomes[e.outcomes.length - 1].timestamp
        : e.addedAt;
      const recencyScore = 1 / (1 + daysBetween(lastActivity, now) / 90);
      const relevanceScore = clamp(usageScore * 0.3 + e.effectivenessScore * 0.4 + recencyScore * 0.3, 0, 1);

      return { entry: e, relevanceScore };
    });

    scored.sort((a, b) => b.relevanceScore - a.relevanceScore);

    const results = scored.slice(0, limit);

    // Increment query counts
    if (results.length > 0) {
      for (const match of results) {
        match.entry.timesQueried++;
      }
      this.save();
    }

    return results;
  }

  // ── Status (Phase 5: confirmed-precedent reinforcement) ──────────────

  /**
   * Promote a precedent from 'tentative' to 'confirmed'. Called by the
   * Curator's consolidation pass when the precedent has been seen
   * ≥ CONFIRM_THRESHOLD times with consistent verdicts.
   *
   * Confirmed precedents are weighted higher in Reader prompts — the
   * model is told "the firm has confirmed this position across N matters"
   * rather than "the firm has tentatively flagged this pattern."
   *
   * Returns true when the status actually changed.
   */
  markConfirmed(precedentId: string): boolean {
    const entry = this.state.entries[precedentId];
    if (!entry) return false;
    if (entry.deprecated) return false;
    if (entry.status === 'confirmed') return false;
    entry.status = 'confirmed';
    entry.statusUpdatedAt = new Date().toISOString();
    this.save();
    logger.info('Precedent confirmed', { id: precedentId, timesUsed: entry.timesUsed });
    return true;
  }

  /** Count of precedents per lifecycle status. Useful for ops + heartbeat. */
  statusCounts(): { tentative: number; confirmed: number; deprecated: number } {
    let tentative = 0, confirmed = 0, deprecated = 0;
    for (const entry of Object.values(this.state.entries)) {
      const s = entry.status ?? (entry.deprecated ? 'deprecated' : 'tentative');
      if (s === 'confirmed') confirmed++;
      else if (s === 'deprecated' || entry.deprecated) deprecated++;
      else tentative++;
    }
    return { tentative, confirmed, deprecated };
  }

  // ── Reinforcement ─────────────────────────────────────────────────────

  reinforce(precedentId: string, sessionId: string, scoreDelta: number): void {
    const entry = this.state.entries[precedentId];
    if (!entry) return;

    entry.timesUsed++;

    // Incremental update: adds 20% of delta, clamped to [0, 1]
    entry.effectivenessScore = clamp(
      entry.effectivenessScore + scoreDelta * 0.2,
      0,
      1,
    );

    // Cap outcomes BEFORE push to prevent memory spikes
    const maxOutcomes = config.claw.precedentMaxOutcomes;
    if (entry.outcomes.length >= maxOutcomes) {
      entry.outcomes.shift();
    }

    entry.outcomes.push({
      sessionId,
      timestamp: new Date().toISOString(),
      applied: true,
      scoreDelta,
      verificationPassed: true,
    });

    this.save();
  }

  // ── Decay ─────────────────────────────────────────────────────────────

  /**
   * Apply time-based decay to precedent effectiveness.
   * Runs at most once per day. Called from heartbeat.
   */
  decay(): void {
    const now = new Date().toISOString();
    if (daysBetween(this.state.lastDecay, now) < 1) return;

    const decayDays = config.claw.precedentDecayDays;
    let changed = false;

    for (const entry of Object.values(this.state.entries)) {
      if (entry.deprecated) continue;

      const lastActivity = entry.outcomes.length > 0
        ? entry.outcomes[entry.outcomes.length - 1].timestamp
        : entry.addedAt;

      const daysInactive = daysBetween(lastActivity, now);

      // Deprecate if unreinforced for 6x the decay window
      if (daysInactive > decayDays * 6) {
        entry.deprecated = true;
        entry.deprecationReason = `Unreinforced for ${Math.floor(daysInactive)} days`;
        changed = true;
        logger.info('Precedent deprecated', { id: entry.id, daysInactive: Math.floor(daysInactive) });
        continue;
      }

      // Gradual decay after the configured threshold
      if (daysInactive > decayDays) {
        entry.effectivenessScore = clamp(entry.effectivenessScore * 0.95, 0, 1);
        changed = true;
      }
    }

    this.state.lastDecay = now;
    this.save();
  }

  // ── Compaction ────────────────────────────────────────────────────────

  /**
   * Archive deprecated and old entries to keep active state lean.
   */
  compact(maxAgeDays?: number): void {
    const threshold = maxAgeDays ?? config.claw.precedentArchiveDays;
    const now = new Date();
    const toArchive: PrecedentEntry[] = [];
    const idsToRemove: string[] = [];

    for (const [id, entry] of Object.entries(this.state.entries)) {
      const addedTime = new Date(entry.addedAt).getTime();
      const ageDays = isNaN(addedTime) ? 0 : (now.getTime() - addedTime) / (1000 * 60 * 60 * 24);

      if (entry.deprecated || ageDays > threshold) {
        toArchive.push(entry);
        idsToRemove.push(id);
      }
    }

    if (toArchive.length === 0) return;

    // Merge with existing archive
    const archive = readJsonFile<PrecedentEntry[]>(this.archivePath, []);
    archive.push(...toArchive);
    writeJsonFileAtomic(this.archivePath, archive);

    // Remove from active state and dedup index
    for (const id of idsToRemove) {
      const entry = this.state.entries[id];
      if (entry) {
        const key = dedupKey(
          entry.tags?.custom?.[0] ?? entry.patternName,
          [entry.beforeSnippet],
        );
        this.dedupIndex.delete(key);
      }
      delete this.state.entries[id];
    }

    this.save();
    logger.info('Precedent board compacted', { archived: toArchive.length, remaining: Object.keys(this.state.entries).length });
  }

  // ── Summary ───────────────────────────────────────────────────────────

  get summary(): PrecedentSummary {
    const entries = Object.values(this.state.entries);
    const active = entries.filter(e => !e.deprecated);
    const deprecated = entries.filter(e => e.deprecated);

    // Top patterns by usage
    const patternCounts = new Map<string, number>();
    for (const e of active) {
      patternCounts.set(e.patternName, (patternCounts.get(e.patternName) ?? 0) + e.timesUsed);
    }

    const topPatterns = [...patternCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name]) => name);

    return {
      total: entries.length,
      active: active.length,
      deprecated: deprecated.length,
      topPatterns,
    };
  }
}

// ── Singleton ───────────────────────────────────────────────────────────

const _instances = new Map<string, PrecedentBoard>();

export function getPrecedentBoard(dir?: string): PrecedentBoard {
  const resolvedDir = dir ?? config.claw.dir;
  let instance = _instances.get(resolvedDir);
  if (!instance) {
    instance = new PrecedentBoard(resolvedDir);
    _instances.set(resolvedDir, instance);
  }
  return instance;
}

/** Reset all instances (for testing). */
export function resetPrecedentBoard(): void {
  _instances.clear();
}
