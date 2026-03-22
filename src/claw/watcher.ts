/**
 * File Watcher — Eyes on the corridors.
 *
 * Watches all configured paths using Node.js `fs.watch`.
 * Debounces events (files often trigger multiple events on save),
 * filters to supported document types, and emits callbacks
 * for new/changed files.
 *
 * Also performs a full startup scan so the registry is current
 * before the watcher begins.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { SUPPORTED_EXTENSIONS } from '../documents/parser.js';
import { config } from '../config.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('CLAW-WATCHER');

// ── Types ────────────────────────────────────────────────────────────────

export type WatchEvent = 'new' | 'changed';

export interface WatcherOptions {
  /** Paths to watch (supports ~ for home directory) */
  watchPaths: string[];
  /** Debounce interval in ms (default: 2000) */
  debounceMs?: number;
  /** Callback when a document file is detected as new or changed */
  onChange: (filePath: string, event: WatchEvent) => void;
  /** Debug logging */
  debug?: boolean;
}

// ── Watcher ──────────────────────────────────────────────────────────────

export class ClawWatcher {
  private watchers: fs.FSWatcher[] = [];
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private debounceMs: number;
  private onChange: (filePath: string, event: WatchEvent) => void;
  private knownPaths = new Set<string>();
  private debug: boolean;
  private running = false;

  constructor(options: WatcherOptions) {
    this.debounceMs = options.debounceMs ?? 2000;
    this.onChange = options.onChange;
    this.debug = options.debug ?? false;
  }

  /**
   * Resolve a path — expand ~ and resolve to absolute.
   */
  private resolvePath(p: string): string {
    const resolved = path.resolve(p.replace(/^~/, os.homedir()));
    // Security: reject path traversal attempts
    if (p.includes('..')) {
      logger.warn('Rejected watch path with traversal', { path: p });
      return ''; // Will fail existsSync check
    }
    return resolved;
  }

  /**
   * Check if a file is a supported document type.
   */
  private isSupported(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return SUPPORTED_EXTENSIONS.has(ext);
  }

  /**
   * Start watching all configured paths.
   * Also records currently existing files so we can distinguish
   * new files from changes.
   */
  start(watchPaths: string[]): void {
    if (this.running) return;
    this.running = true;

    for (const wp of watchPaths) {
      const resolved = this.resolvePath(wp);
      if (!fs.existsSync(resolved)) {
        if (this.debug) logger.info('Watch path does not exist', { path: resolved });
        continue;
      }

      // Record existing files
      this.recordExisting(resolved);

      try {
        const watcher = fs.watch(resolved, { recursive: true }, (eventType, filename) => {
          if (!filename) return;
          const full = path.join(resolved, filename);

          // Skip non-documents, hidden files, node_modules
          if (!this.isSupported(full)) return;
          const basename = filename.split('/').pop() ?? filename;
          if (basename.startsWith('.') || filename.includes('node_modules')) return;

          // Debounce: many editors trigger multiple events per save
          const existing = this.debounceTimers.get(full);
          if (existing) clearTimeout(existing);

          this.debounceTimers.set(full, setTimeout(() => {
            this.debounceTimers.delete(full);
            this.handleFileEvent(full);
          }, this.debounceMs));
        });

        this.watchers.push(watcher);
        if (this.debug) logger.info('Watching', { path: resolved });
      } catch (err) {
        logger.error('Failed to watch path', { path: resolved, error: err });
      }
    }
  }

  /**
   * Stop all watchers and clear timers.
   */
  stop(): void {
    this.running = false;
    for (const w of this.watchers) {
      try { w.close(); } catch { /* ignore */ }
    }
    this.watchers = [];

    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }

  /**
   * Whether the watcher is currently active.
   */
  get isRunning(): boolean {
    return this.running;
  }

  // ── Private ────────────────────────────────────────────────────────────

  private handleFileEvent(filePath: string): void {
    try {
      // Single lstatSync call replaces existsSync + lstatSync (removes TOCTOU window).
      // lstatSync throws ENOENT if the file was deleted, caught by outer try/catch.
      const lstat = fs.lstatSync(filePath);

      // SECURITY: Skip symlinks — prevent traversal outside watch paths
      if (lstat.isSymbolicLink()) return;
      if (!lstat.isFile()) return;

      // SECURITY: Skip oversized files — prevent memory exhaustion
      if (lstat.size > config.claw.maxFileSizeBytes) {
        if (this.debug) logger.info('Skipping oversized file', { filePath, sizeMB: (lstat.size / 1024 / 1024).toFixed(1) });
        return;
      }

      const event: WatchEvent = this.knownPaths.has(filePath) ? 'changed' : 'new';
      this.knownPaths.add(filePath);

      if (this.debug) logger.info('File event', { event, filePath });
      // Catch async callback errors to prevent unhandled rejections crashing the daemon
      Promise.resolve(this.onChange(filePath, event)).catch(err => {
        logger.error('Error processing file', { filePath, error: err });
      });
    } catch (err) {
      // ENOENT is expected — file deleted between event and stat
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.warn('Unexpected error processing file', { filePath, error: err });
      }
    }
  }

  private recordExisting(dir: string): void {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        // SECURITY: Skip symlinks
        if (entry.isSymbolicLink()) continue;

        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          this.recordExisting(full);
        } else if (entry.isFile() && this.isSupported(full)) {
          this.knownPaths.add(full);
        }
      }
    } catch {
      // Permission denied — skip
    }
  }
}
