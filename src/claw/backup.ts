/**
 * Backup — Daily snapshots of critical Claw state.
 *
 * Copies state.json and precedents.json to ~/.lavern/backups/
 * with dated filenames. Retains 30 days of backups.
 *
 * Called from heartbeat (once per day).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { config } from '../config.js';
import { ensureDir } from '../utils/fs-helpers.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('BACKUP');

const RETENTION_DAYS = 30;
const BACKUP_FILES = ['state.json', 'precedents.json', 'profile.json'];

/**
 * Create a daily backup of critical state files.
 * No-op if today's backup already exists.
 */
export function createDailyBackup(dir?: string): void {
  const baseDir = dir ?? config.claw.dir;
  const backupDir = path.join(baseDir, 'backups');
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  ensureDir(backupDir);

  for (const file of BACKUP_FILES) {
    const source = path.join(baseDir, file);
    const dest = path.join(backupDir, `${today}-${file}`);

    if (fs.existsSync(dest)) continue; // Already backed up today
    if (!fs.existsSync(source)) continue; // Nothing to back up

    try {
      fs.copyFileSync(source, dest);
    } catch (err) {
      logger.warn('Backup failed', { file, error: err });
    }
  }

  // Prune old backups
  try {
    const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const entries = fs.readdirSync(backupDir);
    for (const entry of entries) {
      // Parse date from filename: YYYY-MM-DD-filename
      const dateStr = entry.slice(0, 10);
      const date = new Date(dateStr).getTime();
      if (!isNaN(date) && date < cutoff) {
        try {
          fs.unlinkSync(path.join(backupDir, entry));
        } catch { /* best effort */ }
      }
    }
  } catch { /* backup dir read failed — non-fatal */ }

  logger.info('Daily backup complete', { dir: backupDir, date: today });
}
