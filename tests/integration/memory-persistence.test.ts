/**
 * Integration Tests — Memory Persistence Integrity
 *
 * Tests atomic writes, backup recovery, and corruption handling
 * for the fs-helpers module.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { readJsonFile, writeJsonFile, writeJsonFileAtomic, ensureDir } from '../../src/utils/fs-helpers.js';

describe('Memory Persistence Integrity', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shem-persist-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── Basic Read/Write ──────────────────────────────────────────────

  describe('readJsonFile', () => {
    it('should return default for non-existent file', () => {
      const result = readJsonFile(path.join(tmpDir, 'missing.json'), []);
      expect(result).toEqual([]);
    });

    it('should read valid JSON file', () => {
      const filePath = path.join(tmpDir, 'test.json');
      fs.writeFileSync(filePath, JSON.stringify({ hello: 'world' }));
      const result = readJsonFile(filePath, {});
      expect(result).toEqual({ hello: 'world' });
    });

    it('should return default for corrupted JSON', () => {
      const filePath = path.join(tmpDir, 'corrupt.json');
      fs.writeFileSync(filePath, '{ invalid json!!!');
      const result = readJsonFile(filePath, { fallback: true });
      expect(result).toEqual({ fallback: true });
    });

    it('should recover from backup if main file is corrupted', () => {
      const filePath = path.join(tmpDir, 'recoverable.json');
      const backupPath = filePath + '.bak';

      // Write valid backup
      fs.writeFileSync(backupPath, JSON.stringify({ recovered: true }));
      // Write corrupted main file
      fs.writeFileSync(filePath, 'CORRUPTED DATA');

      const result = readJsonFile(filePath, { fallback: true });
      expect(result).toEqual({ recovered: true });

      // Should have restored the main file
      const restored = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(restored).toEqual({ recovered: true });
    });

    it('should return default if both main and backup are corrupted', () => {
      const filePath = path.join(tmpDir, 'double-corrupt.json');
      const backupPath = filePath + '.bak';

      fs.writeFileSync(filePath, 'CORRUPTED');
      fs.writeFileSync(backupPath, 'ALSO CORRUPTED');

      const result = readJsonFile(filePath, { ultimate_fallback: true });
      expect(result).toEqual({ ultimate_fallback: true });
    });
  });

  // ── Simple Write ──────────────────────────────────────────────────

  describe('writeJsonFile', () => {
    it('should write valid JSON', () => {
      const filePath = path.join(tmpDir, 'simple.json');
      writeJsonFile(filePath, { test: true });

      const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(content).toEqual({ test: true });
    });

    it('should create parent directories', () => {
      const filePath = path.join(tmpDir, 'nested', 'deep', 'file.json');
      writeJsonFile(filePath, { nested: true });

      expect(fs.existsSync(filePath)).toBe(true);
    });
  });

  // ── Atomic Write ──────────────────────────────────────────────────

  describe('writeJsonFileAtomic', () => {
    it('should write valid JSON atomically', () => {
      const filePath = path.join(tmpDir, 'atomic.json');
      writeJsonFileAtomic(filePath, { atomic: true, count: 42 });

      const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(content).toEqual({ atomic: true, count: 42 });
    });

    it('should create .bak backup of existing file', () => {
      const filePath = path.join(tmpDir, 'backed-up.json');
      const backupPath = filePath + '.bak';

      // Write initial content
      writeJsonFileAtomic(filePath, { version: 1 });
      expect(fs.existsSync(backupPath)).toBe(false); // No backup for first write

      // Write again — should create backup of version 1
      writeJsonFileAtomic(filePath, { version: 2 });
      expect(fs.existsSync(backupPath)).toBe(true);

      const backup = JSON.parse(fs.readFileSync(backupPath, 'utf-8'));
      expect(backup).toEqual({ version: 1 });

      const current = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(current).toEqual({ version: 2 });
    });

    it('should not leave .tmp files on success', () => {
      const filePath = path.join(tmpDir, 'clean.json');
      writeJsonFileAtomic(filePath, { clean: true });

      const tmpPath = filePath + '.tmp';
      expect(fs.existsSync(tmpPath)).toBe(false);
    });

    it('should create parent directories', () => {
      const filePath = path.join(tmpDir, 'atomic', 'nested', 'file.json');
      writeJsonFileAtomic(filePath, { deep: true });

      expect(fs.existsSync(filePath)).toBe(true);
    });

    it('should handle arrays', () => {
      const filePath = path.join(tmpDir, 'array.json');
      const data = [
        { id: 'P-001', pattern: 'Use plain language', effectiveness: 0.85 },
        { id: 'P-002', pattern: 'Remove legalese', effectiveness: 0.92 },
      ];

      writeJsonFileAtomic(filePath, data);

      const result = readJsonFile(filePath, []);
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('P-001');
    });

    it('should survive write→read cycle for complex nested data', () => {
      const filePath = path.join(tmpDir, 'complex.json');
      const data = {
        memories: [
          {
            id: 'M-001',
            category: 'lesson',
            content: 'Always check indemnification clauses',
            addedAt: new Date().toISOString(),
            tags: ['indemnification', 'lesson'],
            metadata: {
              effectiveness: 0.85,
              usageCount: 3,
              nested: { deep: true },
            },
          },
        ],
        version: 2,
        lastUpdated: new Date().toISOString(),
      };

      writeJsonFileAtomic(filePath, data);
      const result = readJsonFile(filePath, {});
      expect(result).toEqual(data);
    });
  });

  // ── ensureDir ─────────────────────────────────────────────────────

  describe('ensureDir', () => {
    it('should create directory if not exists', () => {
      const dirPath = path.join(tmpDir, 'new-dir');
      expect(fs.existsSync(dirPath)).toBe(false);
      ensureDir(dirPath);
      expect(fs.existsSync(dirPath)).toBe(true);
    });

    it('should not fail if directory already exists', () => {
      const dirPath = path.join(tmpDir, 'existing-dir');
      fs.mkdirSync(dirPath);
      expect(() => ensureDir(dirPath)).not.toThrow();
    });

    it('should create nested directories', () => {
      const dirPath = path.join(tmpDir, 'a', 'b', 'c');
      ensureDir(dirPath);
      expect(fs.existsSync(dirPath)).toBe(true);
    });
  });
});
