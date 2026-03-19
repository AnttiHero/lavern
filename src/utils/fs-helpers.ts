/**
 * Shared filesystem helpers for JSON persistence.
 *
 * Used by: memory-system, feedback-loop, baselines, report-card,
 * legal-md-compiler, session-replay-testing.
 *
 * v7: Added atomic writes and integrity checking for memory files.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createLogger } from './logger.js';

const logger = createLogger('FS');

export function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export function readJsonFile<T>(filePath: string, defaultValue: T): T {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(content);
      return parsed;
    }
  } catch (error) {
    // Corrupted file — try backup before returning default
    const backupPath = filePath + '.bak';
    try {
      if (fs.existsSync(backupPath)) {
        logger.warn('Corrupted file, recovering from backup', { filePath });
        const backupContent = fs.readFileSync(backupPath, 'utf-8');
        const backupParsed = JSON.parse(backupContent);
        // Restore from backup
        fs.writeFileSync(filePath, backupContent, 'utf-8');
        return backupParsed;
      }
    } catch {
      // Backup also corrupted
    }
    logger.warn('Corrupted file, no backup available — using default', { filePath });
  }
  return defaultValue;
}

/**
 * Simple (non-atomic) JSON write. Use for non-critical files.
 */
export function writeJsonFile(filePath: string, data: unknown): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Atomic JSON write — safe for memory/precedent files.
 *
 * Strategy: write to .tmp → backup existing → rename .tmp to final.
 * This prevents partial writes from corrupting the file if the
 * process crashes mid-write.
 */
export function writeJsonFileAtomic(filePath: string, data: unknown): void {
  ensureDir(path.dirname(filePath));

  const content = JSON.stringify(data, null, 2);
  const tmpPath = filePath + '.tmp';
  const backupPath = filePath + '.bak';

  // 1. Write to temp file
  fs.writeFileSync(tmpPath, content, 'utf-8');

  // 2. Verify the temp file is valid JSON (catch serialization issues)
  try {
    JSON.parse(fs.readFileSync(tmpPath, 'utf-8'));
  } catch {
    // Clean up invalid temp file
    try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
    throw new Error(`[fs-helpers] Atomic write verification failed for ${filePath}`);
  }

  // 3. Backup existing file (if it exists)
  if (fs.existsSync(filePath)) {
    try {
      fs.copyFileSync(filePath, backupPath);
    } catch {
      // Non-fatal — proceed without backup
    }
  }

  // 4. Rename temp → final (atomic on most filesystems)
  fs.renameSync(tmpPath, filePath);
}
