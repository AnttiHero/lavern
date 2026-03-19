/**
 * Document Registry — The firm's filing cabinet.
 *
 * Tracks every document across all watched locations.
 * Indexes by content hash (SHA-256) so the same file moved
 * between folders is still the same document. Detects changes
 * by comparing stored hash vs current file hash.
 *
 * Persistence: `~/.lavern/state.json` (atomic writes).
 */

import * as fs from 'node:fs';
import { constants } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { readJsonFile, writeJsonFileAtomic, ensureDir } from '../utils/fs-helpers.js';
import { SUPPORTED_EXTENSIONS } from '../documents/parser.js';
import { config } from '../config.js';
import type { ClawState, DocumentEntry, DocumentStatus } from './types.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('CLAW-REGISTRY');

// ── Defaults ──────────────────────────────────────────────────────────────

function emptyState(budgetUsd: number): ClawState {
  return {
    documents: {},
    budget: { totalUsd: budgetUsd, spentUsd: 0 },
    lastScan: new Date().toISOString(),
    sessionsCompleted: 0,
    sessionsFailed: 0,
  };
}

// ── Hash ──────────────────────────────────────────────────────────────────

/**
 * Hash a file's contents using SHA-256.
 * SECURITY: Uses O_NOFOLLOW (when available) + fstat on the fd to eliminate
 * the TOCTOU window between lstat and readFileSync. If O_NOFOLLOW is not
 * available on the platform, falls back to O_RDONLY (lstat guard in indexFile
 * still provides first-line defense against symlinks).
 */
function hashFile(filePath: string, maxSize?: number): string {
  // O_NOFOLLOW may not be defined on all platforms (e.g., Windows)
  const openFlags = (constants as Record<string, number>).O_NOFOLLOW !== undefined
    ? constants.O_RDONLY | (constants as Record<string, number>).O_NOFOLLOW
    : constants.O_RDONLY;

  const fd = fs.openSync(filePath, openFlags);
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile()) {
      throw new Error(`Not a regular file: ${filePath}`);
    }
    if (maxSize !== undefined && stat.size > maxSize) {
      throw new Error(`File exceeds size limit: ${filePath}`);
    }
    const content = fs.readFileSync(fd);
    return crypto.createHash('sha256').update(content).digest('hex');
  } finally {
    fs.closeSync(fd);
  }
}

// ── Registry ──────────────────────────────────────────────────────────────

export class DocumentRegistry {
  private state: ClawState;
  private statePath: string;

  constructor(dir: string, budgetUsd: number) {
    this.statePath = path.join(dir, 'state.json');
    ensureDir(dir);
    this.state = readJsonFile<ClawState>(this.statePath, emptyState(budgetUsd));
    // Sync budget total from config (may have changed)
    this.state.budget.totalUsd = budgetUsd;
  }

  // ── Persistence ────────────────────────────────────────────────────────

  save(): void {
    writeJsonFileAtomic(this.statePath, this.state);
  }

  getState(): ClawState {
    return this.state;
  }

  // ── Scanning ───────────────────────────────────────────────────────────

  /**
   * Scan all watch paths and reconcile with the registry.
   * Returns arrays of new and changed document paths.
   */
  scan(watchPaths: string[]): { newDocs: string[]; changedDocs: string[] } {
    const newDocs: string[] = [];
    const changedDocs: string[] = [];
    const seenPaths = new Set<string>();

    for (const watchPath of watchPaths) {
      const resolved = path.resolve(watchPath.replace(/^~/, os.homedir()));
      if (!fs.existsSync(resolved)) continue;

      const files = this.walkDir(resolved);
      for (const filePath of files) {
        seenPaths.add(filePath);
        const result = this.indexFile(filePath);
        if (result === 'new') newDocs.push(filePath);
        else if (result === 'changed') changedDocs.push(filePath);
      }
    }

    // Prune entries for files that no longer exist on disk
    for (const [hash, doc] of Object.entries(this.state.documents)) {
      if (!seenPaths.has(doc.path)) {
        delete this.state.documents[hash];
      }
    }

    this.state.lastScan = new Date().toISOString();
    this.save();

    return { newDocs, changedDocs };
  }

  /**
   * Index a single file. Returns 'new', 'changed', or 'unchanged'.
   */
  indexFile(filePath: string): 'new' | 'changed' | 'unchanged' {
    // SECURITY: Use lstat as a first-line guard against symlinks.
    // The real symlink + size + regular-file check happens atomically inside
    // hashFile via O_NOFOLLOW + fstat on the fd (eliminates TOCTOU window).
    const lstat = fs.lstatSync(filePath);
    if (lstat.isSymbolicLink() || !lstat.isFile()) {
      return 'unchanged';
    }

    // Quick pre-check with lstat size (may race, but hashFile re-checks atomically)
    if (lstat.size > config.claw.maxFileSizeBytes) {
      logger.warn('Skipping oversized file', { filePath, sizeMB: (lstat.size / 1024 / 1024).toFixed(1), limitMB: (config.claw.maxFileSizeBytes / 1024 / 1024).toFixed(0) });
      return 'unchanged';
    }

    let hash: string;
    try {
      // SECURITY: hashFile opens with O_NOFOLLOW and re-validates via fstat on the fd,
      // closing the TOCTOU window between the lstat above and the actual read.
      hash = hashFile(filePath, config.claw.maxFileSizeBytes);
    } catch (err) {
      logger.warn('Skipping file', { filePath, error: (err as Error).message });
      return 'unchanged';
    }

    const name = path.basename(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const now = new Date().toISOString();

    // Check if we already know this document by path
    const existingByPath = Object.values(this.state.documents).find(d => d.path === filePath);

    if (existingByPath) {
      if (existingByPath.hash === hash) {
        return 'unchanged';
      }
      // Content changed — mark stale
      existingByPath.hash = hash;
      existingByPath.sizeBytes = lstat.size;
      existingByPath.lastModified = now;
      existingByPath.status = 'stale';
      this.save();
      return 'changed';
    }

    // New document
    const entry: DocumentEntry = {
      path: filePath,
      name,
      type: this.inferDocumentType(name, ext),
      hash,
      sizeBytes: lstat.size,
      firstSeen: now,
      lastModified: now,
      status: 'new',
    };
    this.state.documents[hash] = entry;
    this.save();
    return 'new';
  }

  // ── Status Updates ─────────────────────────────────────────────────────

  updateStatus(hash: string, status: DocumentStatus): void {
    const doc = this.state.documents[hash];
    if (doc) {
      doc.status = status;
      this.save();
    }
  }

  markReviewed(
    hash: string,
    sessionId: string,
    findings: { critical: number; major: number; minor: number },
    costUsd: number,
    confidential?: boolean,
  ): void {
    const doc = this.state.documents[hash];
    if (!doc) return;

    doc.status = findings.critical > 0 ? 'flagged' : 'reviewed';
    doc.lastReviewed = new Date().toISOString();
    doc.lastReviewSession = sessionId;
    doc.findingsSummary = findings;
    doc.costUsd = costUsd;
    if (confidential) doc.confidential = true;

    this.state.sessionsCompleted++;
    this.state.budget.spentUsd += costUsd;
    this.save();
  }

  markFailed(hash: string, error: string): void {
    const doc = this.state.documents[hash];
    if (!doc) return;
    doc.status = 'error';
    doc.error = error;
    this.state.sessionsFailed++;
    this.save();
  }

  // ── Budget ─────────────────────────────────────────────────────────────

  get budgetRemaining(): number {
    return Math.max(0, this.state.budget.totalUsd - this.state.budget.spentUsd);
  }

  get budgetExhausted(): boolean {
    return this.budgetRemaining <= 0;
  }

  canAfford(estimatedCost: number): boolean {
    return this.budgetRemaining >= estimatedCost;
  }

  // ── Queries ────────────────────────────────────────────────────────────

  getDocument(hash: string): DocumentEntry | undefined {
    return this.state.documents[hash];
  }

  getDocumentByPath(filePath: string): DocumentEntry | undefined {
    return Object.values(this.state.documents).find(d => d.path === filePath);
  }

  getDocumentsByStatus(...statuses: DocumentStatus[]): DocumentEntry[] {
    return Object.values(this.state.documents).filter(d => statuses.includes(d.status));
  }

  /** Recover documents stuck in 'processing' state (from prior crashes). Resets to 'queued'. */
  recoverStuckDocuments(): number {
    const stuck = this.getDocumentsByStatus('processing');
    for (const doc of stuck) {
      doc.status = 'queued';
      doc.error = undefined;
    }
    if (stuck.length > 0) this.save();
    return stuck.length;
  }

  /** Reset error documents to 'new' for reprocessing. Returns count of reset documents. */
  retryFailed(hash?: string): number {
    const targets = hash
      ? [this.state.documents[hash]].filter(d => d && d.status === 'error')
      : this.getDocumentsByStatus('error');
    for (const doc of targets) {
      doc.status = 'new';
      doc.error = undefined;
    }
    if (targets.length > 0) this.save();
    return targets.length;
  }

  /** Reset stale documents to 'new' for reprocessing. Returns count of reset documents. */
  retryStale(): number {
    const targets = this.getDocumentsByStatus('stale');
    for (const doc of targets) {
      doc.status = 'new';
    }
    if (targets.length > 0) this.save();
    return targets.length;
  }

  get totalDocuments(): number {
    return Object.keys(this.state.documents).length;
  }

  get summary(): {
    total: number;
    reviewed: number;
    flagged: number;
    pending: number;
    errors: number;
    confidential: number;
    frontier: number;
  } {
    const docs = Object.values(this.state.documents);
    const reviewed = docs.filter(d => d.status === 'reviewed' || d.status === 'flagged');
    const confidentialCount = reviewed.filter(d => d.confidential).length;
    return {
      total: docs.length,
      reviewed: docs.filter(d => d.status === 'reviewed').length,
      flagged: docs.filter(d => d.status === 'flagged').length,
      pending: docs.filter(d => ['new', 'queued', 'stale'].includes(d.status)).length,
      errors: docs.filter(d => d.status === 'error').length,
      confidential: confidentialCount,
      frontier: reviewed.length - confidentialCount,
    };
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  private walkDir(dir: string, maxDocs?: number): string[] {
    const results: string[] = [];
    const limit = maxDocs ?? config.claw.maxDocsPerScan;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (results.length >= limit) break;

        // Skip hidden files/dirs and node_modules
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;

        // SECURITY: Skip symlinks — prevent traversal outside watch paths
        if (entry.isSymbolicLink()) continue;

        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          const remaining = limit - results.length;
          results.push(...this.walkDir(full, remaining));
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (SUPPORTED_EXTENSIONS.has(ext)) {
            results.push(full);
          }
        }
      }
    } catch {
      // Permission denied or other fs error — skip
    }
    return results;
  }

  // ── State Compaction ──────────────────────────────────────────────────

  /**
   * Compact the state by archiving old completed entries.
   *
   * Long-running Claw daemons can accumulate thousands of document entries
   * in state.json. This method moves entries with terminal statuses
   * (reviewed, flagged, error) older than `maxAgeDays` to a separate archive
   * file, keeping the active state lean.
   *
   * Returns the number of entries archived.
   */
  compact(maxAgeDays: number = 30): number {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - maxAgeDays);
    const cutoffIso = cutoff.toISOString();

    const archiveEntries: Record<string, DocumentEntry> = {};
    const terminalStatuses: DocumentStatus[] = ['reviewed', 'flagged', 'error'];
    let archivedCount = 0;

    for (const [hash, doc] of Object.entries(this.state.documents)) {
      // Only archive terminal-status docs older than cutoff
      if (!terminalStatuses.includes(doc.status)) continue;

      const lastActivity = doc.lastReviewed ?? doc.lastModified;
      if (lastActivity < cutoffIso) {
        archiveEntries[hash] = doc;
        delete this.state.documents[hash];
        archivedCount++;
      }
    }

    if (archivedCount > 0) {
      // Write archive first, then save active state.
      // If archive write fails, entries are restored to active state.
      const archivePath = this.statePath.replace('state.json', 'state-archive.json');
      try {
        let existingArchive: Record<string, DocumentEntry> = {};
        try {
          existingArchive = readJsonFile<Record<string, DocumentEntry>>(archivePath, {});
        } catch { /* no archive yet */ }

        const merged = { ...existingArchive, ...archiveEntries };
        writeJsonFileAtomic(archivePath, merged);
        this.save();
        logger.info('Compacted state', { archivedCount, maxAgeDays, activeCount: Object.keys(this.state.documents).length });
      } catch (err) {
        // Restore archived entries to active state on failure
        for (const [hash, doc] of Object.entries(archiveEntries)) {
          this.state.documents[hash] = doc;
        }
        logger.error('Compaction failed, restored entries', { archivedCount, error: err });
        archivedCount = 0;
      }
    }

    return archivedCount;
  }

  /**
   * Get total document count including archived entries (for reporting).
   */
  get totalDocumentsIncludingArchive(): number {
    const archivePath = this.statePath.replace('state.json', 'state-archive.json');
    let archiveCount = 0;
    try {
      const archive = readJsonFile<Record<string, DocumentEntry>>(archivePath, {});
      archiveCount = Object.keys(archive).length;
    } catch { /* no archive */ }
    return this.totalDocuments + archiveCount;
  }

  private inferDocumentType(name: string, ext: string): string {
    const lower = name.toLowerCase();
    if (lower.includes('nda') || lower.includes('non-disclosure')) return 'NDA';
    if (lower.includes('tos') || lower.includes('terms')) return 'Terms of Service';
    if (lower.includes('privacy')) return 'Privacy Policy';
    if (lower.includes('employment') || lower.includes('offer')) return 'Employment Agreement';
    if (lower.includes('contract') || lower.includes('agreement')) return 'Contract';
    if (lower.includes('lease')) return 'Lease Agreement';
    if (lower.includes('license') || lower.includes('licence')) return 'License Agreement';
    if (lower.includes('memo')) return 'Memorandum';
    if (lower.includes('brief')) return 'Brief';
    if (lower.includes('policy') || lower.includes('policies')) return 'Policy Document';
    if (ext === '.pdf') return 'PDF Document';
    if (ext === '.docx' || ext === '.doc') return 'Word Document';
    return 'Document';
  }
}
