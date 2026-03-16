/**
 * Unit Tests — FS Helpers (src/utils/fs-helpers.ts)
 *
 * Tests atomic writes, backup recovery, and edge cases.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { ensureDir, readJsonFile, writeJsonFile, writeJsonFileAtomic } from '../../src/utils/fs-helpers.js';

let testDir: string;

beforeEach(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shem-fs-test-'));
});

afterEach(() => {
  fs.rmSync(testDir, { recursive: true, force: true });
});

describe('ensureDir', () => {
  it('creates a directory that does not exist', () => {
    const target = path.join(testDir, 'new', 'nested', 'dir');
    expect(fs.existsSync(target)).toBe(false);
    ensureDir(target);
    expect(fs.existsSync(target)).toBe(true);
  });

  it('does nothing if directory already exists', () => {
    ensureDir(testDir);
    expect(fs.existsSync(testDir)).toBe(true);
  });
});

describe('readJsonFile', () => {
  it('reads valid JSON file', () => {
    const filePath = path.join(testDir, 'data.json');
    fs.writeFileSync(filePath, JSON.stringify({ key: 'value' }));
    const result = readJsonFile(filePath, {});
    expect(result).toEqual({ key: 'value' });
  });

  it('returns default when file does not exist', () => {
    const result = readJsonFile(path.join(testDir, 'missing.json'), { fallback: true });
    expect(result).toEqual({ fallback: true });
  });

  it('returns default when file is corrupted', () => {
    const filePath = path.join(testDir, 'bad.json');
    fs.writeFileSync(filePath, 'not valid json {{{');
    const result = readJsonFile(filePath, { fallback: true });
    expect(result).toEqual({ fallback: true });
  });

  it('recovers from backup when primary is corrupted', () => {
    const filePath = path.join(testDir, 'recoverable.json');
    const backupPath = filePath + '.bak';

    fs.writeFileSync(filePath, 'corrupted!!!');
    fs.writeFileSync(backupPath, JSON.stringify({ recovered: true }));

    const result = readJsonFile(filePath, { fallback: true });
    expect(result).toEqual({ recovered: true });

    // Verify it restored the primary file from backup
    const restored = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    expect(restored).toEqual({ recovered: true });
  });

  it('returns default when both primary and backup are corrupted', () => {
    const filePath = path.join(testDir, 'double-bad.json');
    const backupPath = filePath + '.bak';

    fs.writeFileSync(filePath, 'bad1');
    fs.writeFileSync(backupPath, 'bad2');

    const result = readJsonFile(filePath, { fallback: true });
    expect(result).toEqual({ fallback: true });
  });
});

describe('writeJsonFile', () => {
  it('writes JSON to file', () => {
    const filePath = path.join(testDir, 'output.json');
    writeJsonFile(filePath, { hello: 'world' });
    const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    expect(content).toEqual({ hello: 'world' });
  });

  it('creates parent directories', () => {
    const filePath = path.join(testDir, 'deep', 'nested', 'output.json');
    writeJsonFile(filePath, { nested: true });
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('overwrites existing file', () => {
    const filePath = path.join(testDir, 'overwrite.json');
    writeJsonFile(filePath, { version: 1 });
    writeJsonFile(filePath, { version: 2 });
    const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    expect(content).toEqual({ version: 2 });
  });
});

describe('writeJsonFileAtomic', () => {
  it('writes valid JSON atomically', () => {
    const filePath = path.join(testDir, 'atomic.json');
    writeJsonFileAtomic(filePath, { atomic: true });
    const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    expect(content).toEqual({ atomic: true });
  });

  it('creates backup of existing file', () => {
    const filePath = path.join(testDir, 'backup-test.json');
    const backupPath = filePath + '.bak';

    writeJsonFileAtomic(filePath, { version: 1 });
    writeJsonFileAtomic(filePath, { version: 2 });

    const backup = JSON.parse(fs.readFileSync(backupPath, 'utf-8'));
    expect(backup).toEqual({ version: 1 });

    const current = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    expect(current).toEqual({ version: 2 });
  });

  it('does not leave temp file on success', () => {
    const filePath = path.join(testDir, 'clean.json');
    writeJsonFileAtomic(filePath, { clean: true });
    expect(fs.existsSync(filePath + '.tmp')).toBe(false);
  });

  it('creates parent directories', () => {
    const filePath = path.join(testDir, 'deep', 'atomic.json');
    writeJsonFileAtomic(filePath, { deep: true });
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('handles complex nested data', () => {
    const filePath = path.join(testDir, 'complex.json');
    const data = {
      array: [1, 2, 3],
      nested: { a: { b: { c: true } } },
      special: 'unicode: \u00e9\u00e8\u00ea',
      nullVal: null,
    };
    writeJsonFileAtomic(filePath, data);
    const result = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    expect(result).toEqual(data);
  });
});
