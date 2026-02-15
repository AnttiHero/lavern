/**
 * Unit tests for the Audit Persistence system.
 *
 * v3: Uses SessionState instead of module-level setAuditDir/getAuditFilePath.
 *
 * Tests: JSONL writing, SHA-256 checksum chain, session markers,
 * chain verification, tamper detection.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  initPersistentAudit,
  persistAuditEntry,
  finalizePersistentAudit,
  verifyAuditChain,
  readAuditFile,
} from '../../src/utils/audit-persistence.js';
import { SessionState } from '../../src/session/session-state.js';
import { AutoApproveGateResolver } from '../../src/gates/gate-resolver.js';

const TEST_AUDIT_DIR = path.join(import.meta.dirname || '.', '..', '.test-audit-logs');
const TEST_SESSION_ID = 'test-session-001';

describe('Audit Persistence', () => {
  let session: SessionState;

  beforeEach(() => {
    // Clean up any previous test data
    if (fs.existsSync(TEST_AUDIT_DIR)) {
      fs.rmSync(TEST_AUDIT_DIR, { recursive: true });
    }

    // Create a fresh session with test audit directory
    session = new SessionState(TEST_SESSION_ID, {
      gateResolver: new AutoApproveGateResolver(),
      auditDir: TEST_AUDIT_DIR,
    });
  });

  afterEach(() => {
    // Clean up test data
    if (fs.existsSync(TEST_AUDIT_DIR)) {
      fs.rmSync(TEST_AUDIT_DIR, { recursive: true });
    }
  });

  describe('Session Initialization', () => {
    it('should create audit directory if it does not exist', () => {
      initPersistentAudit(session);
      expect(fs.existsSync(TEST_AUDIT_DIR)).toBe(true);
    });

    it('should create a JSONL file for the session', () => {
      initPersistentAudit(session);
      expect(session.auditCurrentFile).not.toBeNull();
      expect(fs.existsSync(session.auditCurrentFile!)).toBe(true);
    });

    it('should write a session_start marker', () => {
      initPersistentAudit(session);
      const entries = readAuditFile(session.auditCurrentFile!);
      expect(entries).toHaveLength(1);
      expect((entries[0] as Record<string, unknown>).type).toBe('session_start');
      expect((entries[0] as Record<string, unknown>).sessionId).toBe(TEST_SESSION_ID);
    });
  });

  describe('Entry Persistence', () => {
    it('should append entries to the JSONL file', () => {
      initPersistentAudit(session);

      persistAuditEntry(session, {
        timestamp: new Date().toISOString(),
        sessionId: TEST_SESSION_ID,
        agentRole: 'orchestrator',
        action: 'PostToolUse: get_current_step',
      });

      persistAuditEntry(session, {
        timestamp: new Date().toISOString(),
        sessionId: TEST_SESSION_ID,
        agentRole: 'design-reviewer',
        action: 'PostToolUse: post_finding',
      });

      const entries = readAuditFile(session.auditCurrentFile!);
      // 1 session_start + 2 entries = 3
      expect(entries).toHaveLength(3);
    });

    it('should include previousHash in persisted entries', () => {
      initPersistentAudit(session);

      persistAuditEntry(session, {
        timestamp: new Date().toISOString(),
        sessionId: TEST_SESSION_ID,
        agentRole: 'orchestrator',
        action: 'test entry',
      });

      const entries = readAuditFile(session.auditCurrentFile!);
      const lastEntry = entries[entries.length - 1] as Record<string, unknown>;
      expect(lastEntry).toHaveProperty('previousHash');
      expect(typeof lastEntry.previousHash).toBe('string');
      expect((lastEntry.previousHash as string).length).toBe(64); // SHA-256 hex length
    });
  });

  describe('Session Finalization', () => {
    it('should write a session_end marker', () => {
      initPersistentAudit(session);
      persistAuditEntry(session, {
        timestamp: new Date().toISOString(),
        sessionId: TEST_SESSION_ID,
        agentRole: 'orchestrator',
        action: 'test',
      });

      finalizePersistentAudit(session, {
        sessionId: TEST_SESSION_ID,
        documentName: 'test-doc.txt',
        totalCostUsd: 1.23,
        totalTurns: 42,
      });

      const entries = readAuditFile(session.auditCurrentFile!);
      const lastEntry = entries[entries.length - 1] as Record<string, unknown>;
      expect(lastEntry.type).toBe('session_end');
      expect(lastEntry.summary).toBeDefined();
    });
  });

  describe('Checksum Chain Verification', () => {
    it('should verify a valid chain', () => {
      initPersistentAudit(session);

      for (let i = 0; i < 5; i++) {
        persistAuditEntry(session, {
          timestamp: new Date().toISOString(),
          sessionId: TEST_SESSION_ID,
          agentRole: 'orchestrator',
          action: `action-${i}`,
        });
      }

      finalizePersistentAudit(session, { sessionId: TEST_SESSION_ID });

      const result = verifyAuditChain(session.auditCurrentFile!);
      expect(result.valid).toBe(true);
      expect(result.entries).toBe(7); // 1 start + 5 entries + 1 end
    });

    it('should detect tampering', () => {
      initPersistentAudit(session);

      persistAuditEntry(session, {
        timestamp: new Date().toISOString(),
        sessionId: TEST_SESSION_ID,
        agentRole: 'orchestrator',
        action: 'original action',
      });

      persistAuditEntry(session, {
        timestamp: new Date().toISOString(),
        sessionId: TEST_SESSION_ID,
        agentRole: 'orchestrator',
        action: 'another action',
      });

      // Tamper with the file: modify the second line
      const filePath = session.auditCurrentFile!;
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      // Modify the second entry (index 1)
      if (lines[1]) {
        const parsed = JSON.parse(lines[1]);
        parsed.action = 'TAMPERED ACTION';
        lines[1] = JSON.stringify(parsed);
      }
      fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');

      const result = verifyAuditChain(filePath);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Chain broken');
    });

    it('should handle empty or missing files', () => {
      const result = verifyAuditChain('/nonexistent/path/file.jsonl');
      expect(result.valid).toBe(false);
      expect(result.entries).toBe(0);
    });
  });

  describe('Read Audit File', () => {
    it('should parse all JSONL entries', () => {
      initPersistentAudit(session);
      persistAuditEntry(session, {
        timestamp: '2024-01-01T00:00:00Z',
        sessionId: TEST_SESSION_ID,
        agentRole: 'orchestrator',
        action: 'test',
      });

      const entries = readAuditFile(session.auditCurrentFile!);
      expect(Array.isArray(entries)).toBe(true);
      expect(entries.length).toBeGreaterThan(0);
    });

    it('should return empty array for missing files', () => {
      const entries = readAuditFile('/nonexistent.jsonl');
      expect(entries).toEqual([]);
    });
  });
});
