/**
 * Integration Tests — ClawWatcher (src/claw/watcher.ts)
 *
 * Exercises the file watcher: new file detection, debounce,
 * symlink rejection, file size limits, and extension filtering.
 *
 * These tests use real temp directories and fs.watch, so
 * callbacks are async. We use a Promise-with-timeout pattern
 * to await events.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, afterEach } from 'vitest';
import { ClawWatcher } from '../../src/claw/watcher.js';

// ── Helpers ──────────────────────────────────────────────────────────────

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'claw-watcher-'));
}

/**
 * Wait for the onChange callback to fire, with a timeout.
 * Resolves with { filePath, event } on success, rejects on timeout.
 */
function waitForChange(
  watcher: ClawWatcher,
  watchDir: string,
  opts: { debounceMs?: number; timeoutMs?: number } = {},
): { promise: Promise<{ filePath: string; event: string }>; triggerFile: (name: string, content?: string) => string } {
  const debounceMs = opts.debounceMs ?? 100;
  const timeoutMs = opts.timeoutMs ?? 5000;

  let resolve: (v: { filePath: string; event: string }) => void;
  let reject: (e: Error) => void;

  const promise = new Promise<{ filePath: string; event: string }>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  const timer = setTimeout(() => reject(new Error('Timed out waiting for watcher onChange')), timeoutMs);

  const w = new ClawWatcher({
    watchPaths: [watchDir],
    debounceMs,
    onChange: (filePath, event) => {
      clearTimeout(timer);
      resolve({ filePath, event });
    },
  });

  // Copy start into the passed ref so caller can stop it
  Object.assign(watcher, { _inner: w });
  w.start([watchDir]);

  const triggerFile = (name: string, content?: string): string => {
    const filePath = path.join(watchDir, name);
    fs.writeFileSync(filePath, content ?? '# Test\nSample.', 'utf-8');
    return filePath;
  };

  return { promise, triggerFile };
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('ClawWatcher Integration', () => {
  const cleanups: (() => void)[] = [];

  afterEach(() => {
    for (const fn of cleanups) {
      try { fn(); } catch { /* ignore */ }
    }
    cleanups.length = 0;
  });

  // ── New file detection ──────────────────────────────────────────────

  it('should detect a new supported file and fire onChange', async () => {
    const watchDir = createTempDir();
    cleanups.push(() => fs.rmSync(watchDir, { recursive: true, force: true }));

    const events: { filePath: string; event: string }[] = [];

    const watcher = new ClawWatcher({
      watchPaths: [watchDir],
      debounceMs: 100,
      onChange: (filePath, event) => {
        events.push({ filePath, event });
      },
    });
    watcher.start([watchDir]);
    cleanups.push(() => watcher.stop());

    // Create a supported file after the watcher is running
    const filePath = path.join(watchDir, 'new-contract.md');
    // Small delay to ensure watcher is initialized
    await new Promise(r => setTimeout(r, 200));
    fs.writeFileSync(filePath, '# New Contract\nTerms here.', 'utf-8');

    // Wait for debounce + processing
    await new Promise(r => setTimeout(r, 1000));

    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].filePath).toBe(filePath);
    expect(events[0].event).toBe('new');
  });

  // ── Debounce ────────────────────────────────────────────────────────

  it('should debounce rapid writes to the same file into a single onChange', async () => {
    const watchDir = createTempDir();
    cleanups.push(() => fs.rmSync(watchDir, { recursive: true, force: true }));

    const events: { filePath: string; event: string }[] = [];

    const watcher = new ClawWatcher({
      watchPaths: [watchDir],
      debounceMs: 300,
      onChange: (filePath, event) => {
        events.push({ filePath, event });
      },
    });
    watcher.start([watchDir]);
    cleanups.push(() => watcher.stop());

    await new Promise(r => setTimeout(r, 200));

    const filePath = path.join(watchDir, 'rapid-edits.md');
    // Rapid writes within debounce window
    fs.writeFileSync(filePath, 'Version 1', 'utf-8');
    await new Promise(r => setTimeout(r, 50));
    fs.writeFileSync(filePath, 'Version 2', 'utf-8');
    await new Promise(r => setTimeout(r, 50));
    fs.writeFileSync(filePath, 'Version 3', 'utf-8');

    // Wait for debounce to settle (300ms debounce + buffer)
    await new Promise(r => setTimeout(r, 1000));

    // Should fire exactly once despite 3 rapid writes
    expect(events).toHaveLength(1);
  });

  // ── Symlink rejection ──────────────────────────────────────────────

  it('should NOT fire onChange for symlinks', async () => {
    const watchDir = createTempDir();
    const sourceDir = createTempDir();
    cleanups.push(() => fs.rmSync(watchDir, { recursive: true, force: true }));
    cleanups.push(() => fs.rmSync(sourceDir, { recursive: true, force: true }));

    // Create a real file outside the watch dir
    const realFile = path.join(sourceDir, 'real-doc.md');
    fs.writeFileSync(realFile, '# Real Doc\nContent.', 'utf-8');

    const events: { filePath: string; event: string }[] = [];

    const watcher = new ClawWatcher({
      watchPaths: [watchDir],
      debounceMs: 100,
      onChange: (filePath, event) => {
        events.push({ filePath, event });
      },
    });
    watcher.start([watchDir]);
    cleanups.push(() => watcher.stop());

    await new Promise(r => setTimeout(r, 200));

    // Create a symlink in the watched dir
    const symPath = path.join(watchDir, 'linked-doc.md');
    fs.symlinkSync(realFile, symPath);

    // Wait for any potential debounce + processing
    await new Promise(r => setTimeout(r, 1000));

    // Symlinks should be silently ignored
    expect(events).toHaveLength(0);
  });

  // ── Non-supported extensions ────────────────────────────────────────

  it('should NOT fire onChange for unsupported file types (.jpg, .exe)', async () => {
    const watchDir = createTempDir();
    cleanups.push(() => fs.rmSync(watchDir, { recursive: true, force: true }));

    const events: { filePath: string; event: string }[] = [];

    const watcher = new ClawWatcher({
      watchPaths: [watchDir],
      debounceMs: 100,
      onChange: (filePath, event) => {
        events.push({ filePath, event });
      },
    });
    watcher.start([watchDir]);
    cleanups.push(() => watcher.stop());

    await new Promise(r => setTimeout(r, 200));

    // Create files with unsupported extensions
    fs.writeFileSync(path.join(watchDir, 'photo.jpg'), 'fake jpeg data', 'utf-8');
    fs.writeFileSync(path.join(watchDir, 'program.exe'), 'fake exe data', 'utf-8');
    fs.writeFileSync(path.join(watchDir, 'spreadsheet.xlsx'), 'fake xlsx data', 'utf-8');

    // Wait for potential callbacks
    await new Promise(r => setTimeout(r, 1000));

    // None of these should trigger onChange
    expect(events).toHaveLength(0);
  });

  // ── File size limit ─────────────────────────────────────────────────

  it('should NOT fire onChange for files exceeding the size limit', async () => {
    const watchDir = createTempDir();
    cleanups.push(() => fs.rmSync(watchDir, { recursive: true, force: true }));

    const events: { filePath: string; event: string }[] = [];

    const watcher = new ClawWatcher({
      watchPaths: [watchDir],
      debounceMs: 100,
      onChange: (filePath, event) => {
        events.push({ filePath, event });
      },
    });
    watcher.start([watchDir]);
    cleanups.push(() => watcher.stop());

    await new Promise(r => setTimeout(r, 200));

    // Create a file that exceeds the 10MB limit (config.claw.maxFileSizeBytes)
    // The watcher checks lstat.size > config.claw.maxFileSizeBytes in handleFileEvent
    const oversizedPath = path.join(watchDir, 'huge-contract.md');
    // Write ~11MB of data
    const chunk = 'x'.repeat(1024 * 1024); // 1MB
    const fd = fs.openSync(oversizedPath, 'w');
    for (let i = 0; i < 11; i++) {
      fs.writeSync(fd, chunk);
    }
    fs.closeSync(fd);

    // Wait for debounce + processing
    await new Promise(r => setTimeout(r, 1000));

    // Oversized file should be silently skipped
    expect(events).toHaveLength(0);
  });

  // ── start/stop lifecycle ────────────────────────────────────────────

  it('should report isRunning correctly after start and stop', () => {
    const watchDir = createTempDir();
    cleanups.push(() => fs.rmSync(watchDir, { recursive: true, force: true }));

    const watcher = new ClawWatcher({
      watchPaths: [watchDir],
      debounceMs: 100,
      onChange: () => {},
    });

    expect(watcher.isRunning).toBe(false);
    watcher.start([watchDir]);
    expect(watcher.isRunning).toBe(true);
    watcher.stop();
    expect(watcher.isRunning).toBe(false);
  });

  // ── Existing file detection (changed vs new) ────────────────────────

  it('should report "changed" for pre-existing files that are modified', async () => {
    const watchDir = createTempDir();
    cleanups.push(() => fs.rmSync(watchDir, { recursive: true, force: true }));

    // Create file BEFORE starting watcher (so it's in knownPaths)
    const filePath = path.join(watchDir, 'existing.md');
    fs.writeFileSync(filePath, '# Original\nContent.', 'utf-8');

    const events: { filePath: string; event: string }[] = [];

    const watcher = new ClawWatcher({
      watchPaths: [watchDir],
      debounceMs: 100,
      onChange: (fp, event) => {
        events.push({ filePath: fp, event });
      },
    });
    watcher.start([watchDir]);
    cleanups.push(() => watcher.stop());

    await new Promise(r => setTimeout(r, 200));

    // Modify the existing file
    fs.writeFileSync(filePath, '# Modified\nNew content.', 'utf-8');

    await new Promise(r => setTimeout(r, 1000));

    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].event).toBe('changed');
  });
});
