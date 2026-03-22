/**
 * Audit Log — Append-only action trail for Claw Mode.
 *
 * Records every significant action: document processed, pause/resume,
 * scan triggered, retry requested, errors. Stored as JSON lines at
 * ~/.lavern/audit.log. Rotated at 5MB.
 *
 * "The firm keeps records."
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { config } from '../config.js';
import { ensureDir } from '../utils/fs-helpers.js';

// ── Types ────────────────────────────────────────────────────────────────

export type AuditAction =
  | 'document_processed'
  | 'document_failed'
  | 'scan_triggered'
  | 'pause'
  | 'resume'
  | 'retry'
  | 'daemon_start'
  | 'daemon_stop'
  | 'config_change'
  | 'error'
  | 'telegram_command'
  | 'health_check';

export interface AuditEntry {
  timestamp: string;
  action: AuditAction;
  initiator: 'cli' | 'api' | 'telegram' | 'heartbeat' | 'daemon' | 'system';
  details?: Record<string, unknown>;
}

// ── Constants ───────────────────────────────────────────────────────────

const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_ROTATED = 3;

function logPath(): string {
  return path.join(config.claw.dir, 'audit.log');
}

// ── Write ───────────────────────────────────────────────────────────────

/**
 * Append an audit entry to the log. Fire-and-forget.
 */
export function audit(action: AuditAction, initiator: AuditEntry['initiator'], details?: Record<string, unknown>): void {
  try {
    const logFile = logPath();
    ensureDir(path.dirname(logFile));

    // Rotate if too large
    try {
      const stat = fs.statSync(logFile);
      if (stat.size > MAX_LOG_SIZE) {
        rotateAuditLog(logFile);
      }
    } catch { /* file doesn't exist yet */ }

    const entry: AuditEntry = {
      timestamp: new Date().toISOString(),
      action,
      initiator,
      ...(details ? { details } : {}),
    };

    fs.appendFileSync(logFile, JSON.stringify(entry) + '\n', 'utf-8');
  } catch {
    // Audit logging must never crash the system
  }
}

// ── Rotation ────────────────────────────────────────────────────────────

function rotateAuditLog(logFile: string): void {
  // Shift existing rotated files
  for (let i = MAX_ROTATED; i >= 1; i--) {
    const from = i === 1 ? logFile : `${logFile}.${i - 1}`;
    const to = `${logFile}.${i}`;
    try {
      if (fs.existsSync(from)) {
        if (i === MAX_ROTATED && fs.existsSync(to)) fs.unlinkSync(to); // Drop oldest
        fs.renameSync(from, to);
      }
    } catch { /* best effort */ }
  }
}

// ── Read ────────────────────────────────────────────────────────────────

/**
 * Read the last N audit entries.
 */
export function readAuditLog(limit = 100): AuditEntry[] {
  try {
    const logFile = logPath();
    if (!fs.existsSync(logFile)) return [];

    const content = fs.readFileSync(logFile, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);

    // Take last N lines
    const recent = lines.slice(-limit);

    return recent.map(line => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean) as AuditEntry[];
  } catch {
    return [];
  }
}
