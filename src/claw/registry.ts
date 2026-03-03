/**
 * Document Registry — The firm's filing cabinet.
 *
 * Tracks every document across all watched locations.
 * Indexes by content hash (SHA-256) so the same file moved
 * between folders is still the same document. Detects changes
 * by comparing stored hash vs current file hash.
 *
 * Persistence: `~/.marble/state.json` (atomic writes).
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { readJsonFile, writeJsonFileAtomic, ensureDir } from '../utils/fs-helpers.js';
import { SUPPORTED_EXTENSIONS } from '../documents/parser.js';
import { config } from '../config.js';
import type { ClawState, DocumentEntry, DocumentStatus } from './types.js';

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

function hashFile(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
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

    this.state.lastScan = new Date().toISOString();
    this.save();

    return { newDocs, changedDocs };
  }

  /**
   * Index a single file. Returns 'new', 'changed', or 'unchanged'.
   */
  indexFile(filePath: string): 'new' | 'changed' | 'unchanged' {
    // SECURITY: Skip symlinks — prevent traversal outside watch paths
    const lstat = fs.lstatSync(filePath);
    if (lstat.isSymbolicLink()) {
      return 'unchanged';
    }

    const stat = fs.statSync(filePath);

    // SECURITY: Skip files exceeding size limit — prevent memory exhaustion
    if (stat.size > config.claw.maxFileSizeBytes) {
      console.warn(`[CLAW] Skipping ${filePath}: ${(stat.size / 1024 / 1024).toFixed(1)}MB exceeds ${(config.claw.maxFileSizeBytes / 1024 / 1024).toFixed(0)}MB limit`);
      return 'unchanged';
    }

    const hash = hashFile(filePath);
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
      existingByPath.sizeBytes = stat.size;
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
      sizeBytes: stat.size,
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
  ): void {
    const doc = this.state.documents[hash];
    if (!doc) return;

    doc.status = findings.critical > 0 ? 'flagged' : 'reviewed';
    doc.lastReviewed = new Date().toISOString();
    doc.lastReviewSession = sessionId;
    doc.findingsSummary = findings;
    doc.costUsd = costUsd;

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

  get totalDocuments(): number {
    return Object.keys(this.state.documents).length;
  }

  get summary(): {
    total: number;
    reviewed: number;
    flagged: number;
    pending: number;
    errors: number;
  } {
    const docs = Object.values(this.state.documents);
    return {
      total: docs.length,
      reviewed: docs.filter(d => d.status === 'reviewed').length,
      flagged: docs.filter(d => d.status === 'flagged').length,
      pending: docs.filter(d => ['new', 'queued', 'stale'].includes(d.status)).length,
      errors: docs.filter(d => d.status === 'error').length,
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
