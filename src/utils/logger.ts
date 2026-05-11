/**
 * Structured Logger — Console + optional file transport with daily rotation.
 *
 * Adds ISO timestamps, component context, and structured metadata.
 * Drop-in replacement for console.error/warn/log/debug — same API surface.
 *
 * File transport (enabled via SHEM_LOG_DIR):
 *   - Daily rotation: lavern-YYYY-MM-DD.log
 *   - Separate error log: lavern-error-YYYY-MM-DD.log
 *   - 14-day retention, auto-cleanup
 *   - Gzip compression of rotated files (if available)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as zlib from 'node:zlib';
import { config } from '../config.js';

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

interface LogEntry {
  ts: string;
  level: LogLevel;
  component: string;
  msg: string;
  data?: unknown;
}

// ── File Transport ──────────────────────────────────────────────────────

const LOG_DIR = config.logDir;
const LOG_RETAIN_DAYS = config.logRetainDays;

/** Current date string for log filenames (YYYY-MM-DD). */
function dateString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Active log file handles, keyed by date. Reopened daily. */
let currentDate = '';
let logStream: fs.WriteStream | null = null;
let errorStream: fs.WriteStream | null = null;

function ensureLogDir(): void {
  if (!LOG_DIR) return;
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function getStreams(): { logStream: fs.WriteStream | null; errorStream: fs.WriteStream | null } {
  if (!LOG_DIR) return { logStream: null, errorStream: null };

  const today = dateString();
  if (today !== currentDate) {
    // Close old streams
    if (logStream) { logStream.end(); logStream = null; }
    if (errorStream) { errorStream.end(); errorStream = null; }

    ensureLogDir();
    currentDate = today;
    logStream = fs.createWriteStream(path.join(LOG_DIR, `lavern-${today}.log`), { flags: 'a' });
    errorStream = fs.createWriteStream(path.join(LOG_DIR, `lavern-error-${today}.log`), { flags: 'a' });

    // Rotate old files on day change
    rotateLogFiles();
  }

  return { logStream, errorStream };
}

/**
 * Delete log files older than LOG_RETAIN_DAYS.
 * Compress files older than 1 day that haven't been compressed yet.
 */
function rotateLogFiles(): void {
  if (!LOG_DIR || !fs.existsSync(LOG_DIR)) return;

  try {
    const files = fs.readdirSync(LOG_DIR);
    const now = Date.now();
    const retainMs = LOG_RETAIN_DAYS * 24 * 60 * 60 * 1000;
    const compressAfterMs = 24 * 60 * 60 * 1000; // Compress after 1 day

    for (const file of files) {
      const filePath = path.join(LOG_DIR, file);
      const stat = fs.statSync(filePath);
      const age = now - stat.mtimeMs;

      // Delete old files (including .gz)
      if (age > retainMs) {
        fs.unlinkSync(filePath);
        continue;
      }

      // Compress .log files older than 1 day (skip today's logs)
      if (file.endsWith('.log') && age > compressAfterMs) {
        try {
          const content = fs.readFileSync(filePath);
          const compressed = zlib.gzipSync(content);
          fs.writeFileSync(`${filePath}.gz`, compressed);
          fs.unlinkSync(filePath);
        } catch { /* compression failure is non-fatal */ }
      }
    }
  } catch { /* rotation failure is non-fatal */ }
}

// ── Formatter ───────────────────────────────────────────────────────────

function formatEntry(entry: LogEntry): string {
  const prefix = `[${entry.ts}] [${entry.level.toUpperCase()}] [${entry.component}]`;
  return entry.data !== undefined
    ? `${prefix} ${entry.msg} ${typeof entry.data === 'string' ? entry.data : JSON.stringify(entry.data)}`
    : `${prefix} ${entry.msg}`;
}

// ── Logger Factory ──────────────────────────────────────────────────────

/**
 * Create a scoped logger for a specific component/module.
 *
 * Usage:
 *   const log = createLogger('ENGAGE');
 *   log.error('Session failed', { sessionId, error: err.message });
 *   log.warn('Budget exceeded');
 *   log.info('Session created', sessionId);
 */
export function createLogger(component: string) {
  const ts = () => new Date().toISOString();

  function writeToFile(formatted: string, isError: boolean): void {
    const streams = getStreams();
    if (streams.logStream) {
      streams.logStream.write(formatted + '\n');
    }
    if (isError && streams.errorStream) {
      streams.errorStream.write(formatted + '\n');
    }
  }

  return {
    error(msg: string, data?: unknown) {
      const entry: LogEntry = { ts: ts(), level: 'error', component, msg, data };
      const formatted = formatEntry(entry);
      console.error(formatted);
      writeToFile(formatted, true);
    },
    warn(msg: string, data?: unknown) {
      const entry: LogEntry = { ts: ts(), level: 'warn', component, msg, data };
      const formatted = formatEntry(entry);
      console.warn(formatted);
      writeToFile(formatted, true);
    },
    info(msg: string, data?: unknown) {
      const entry: LogEntry = { ts: ts(), level: 'info', component, msg, data };
      const formatted = formatEntry(entry);
      console.log(formatted);
      writeToFile(formatted, false);
    },
    debug(msg: string, data?: unknown) {
      if (config.logLevel !== 'debug') return;
      const entry: LogEntry = { ts: ts(), level: 'debug', component, msg, data };
      const formatted = formatEntry(entry);
      console.log(formatted);
      writeToFile(formatted, false);
    },
  };
}
