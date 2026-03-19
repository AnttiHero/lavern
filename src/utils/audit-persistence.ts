/**
 * Audit Persistence — JSONL file-based audit trail with SHA-256 checksum chain.
 *
 * v3: Refactored to use SessionState — no more module-level vars.
 * Each session has its own audit file path and hash chain.
 *
 * Every audit event is appended to a .jsonl file immediately (crash-safe).
 * Each entry includes SHA-256 hash of the previous entry (tamper-evident chain).
 * Session end compiles a full AuditTrail summary.
 *
 * File location: {auditDir}/{sessionId}.jsonl
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import type { AuditEntry } from '../types/audit.js';
import type { SessionState } from '../session/session-state.js';
import { createLogger } from './logger.js';

const logger = createLogger('AUDIT');

function computeHash(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function appendLine(session: SessionState, data: unknown): void {
  if (!session.auditCurrentFile) return;

  const line = JSON.stringify(data);
  session.auditLastHash = computeHash(line + session.auditLastHash);

  try {
    fs.appendFileSync(session.auditCurrentFile, line + '\n', 'utf-8');
  } catch (err) {
    // On write failure (disk full, permissions, etc.), write a corruption marker
    // so verifyAuditChain can identify the exact break point.
    logger.error('Failed to append to audit file', { file: session.auditCurrentFile, error: err instanceof Error ? err.message : err });
    try {
      fs.appendFileSync(session.auditCurrentFile, `\n{"type":"corruption_marker","reason":"write_failed","timestamp":"${new Date().toISOString()}"}\n`, 'utf-8');
    } catch { /* best-effort — if even the marker fails, we can't do anything */ }
  }
}

export function initPersistentAudit(session: SessionState): void {
  if (!fs.existsSync(session.auditDir)) {
    fs.mkdirSync(session.auditDir, { recursive: true });
  }
  session.auditCurrentFile = path.join(session.auditDir, `${session.id}.jsonl`);
  session.auditLastHash = '';

  // Write session start marker
  const startEntry = {
    type: 'session_start',
    sessionId: session.id,
    timestamp: new Date().toISOString(),
    previousHash: '',
  };
  appendLine(session, startEntry);
}

export function persistAuditEntry(session: SessionState, entry: AuditEntry): void {
  if (!session.auditCurrentFile) return;

  const persistedEntry = {
    ...entry,
    previousHash: session.auditLastHash,
  };
  appendLine(session, persistedEntry);
}

export function finalizePersistentAudit(session: SessionState, summary: Record<string, unknown>): void {
  if (!session.auditCurrentFile) return;

  const endEntry = {
    type: 'session_end',
    timestamp: new Date().toISOString(),
    previousHash: session.auditLastHash,
    summary,
  };
  appendLine(session, endEntry);
}

/**
 * Verify the checksum chain of an audit file.
 * Returns true if the chain is intact (no tampering), false otherwise.
 */
export function verifyAuditChain(filePath: string): { valid: boolean; entries: number; error?: string } {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.trim().split('\n').filter(l => l.length > 0);

    let prevHash = '';
    for (let i = 0; i < lines.length; i++) {
      const parsed = JSON.parse(lines[i]);
      if (i > 0 && parsed.previousHash !== prevHash) {
        return {
          valid: false,
          entries: lines.length,
          error: `Chain broken at entry ${i}: expected hash ${prevHash.slice(0, 16)}..., got ${(parsed.previousHash || '').slice(0, 16)}...`,
        };
      }
      prevHash = computeHash(lines[i] + (i === 0 ? '' : prevHash));
    }

    return { valid: true, entries: lines.length };
  } catch (e) {
    return { valid: false, entries: 0, error: `Failed to read audit file: ${e}` };
  }
}

/**
 * Read all entries from a session audit file.
 */
export function readAuditFile(filePath: string): unknown[] {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return content.trim().split('\n').filter(l => l.length > 0).map(l => JSON.parse(l));
  } catch {
    return [];
  }
}

/**
 * Read lightweight metadata from an audit file without parsing every entry.
 * Only parses the first and last lines for timestamps/type.
 */
export function readAuditFileMeta(filePath: string): {
  entries: number;
  first: Record<string, unknown> | undefined;
  last: Record<string, unknown> | undefined;
} {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.trim().split('\n').filter(l => l.length > 0);
    if (lines.length === 0) return { entries: 0, first: undefined, last: undefined };

    const first = JSON.parse(lines[0]) as Record<string, unknown>;
    const last = lines.length > 1
      ? JSON.parse(lines[lines.length - 1]) as Record<string, unknown>
      : first;

    return { entries: lines.length, first, last };
  } catch {
    return { entries: 0, first: undefined, last: undefined };
  }
}
