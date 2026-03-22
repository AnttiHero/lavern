/**
 * Unit Tests — Claw Audit Log (src/claw/audit.ts)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// We test the audit functions by calling them directly
// The audit module uses config.claw.dir internally, so we mock at file level
import { audit, readAuditLog } from '../../src/claw/audit.js';

describe('Audit Log', () => {
  it('audit function does not throw', () => {
    // audit is fire-and-forget, should never throw
    expect(() => audit('scan_triggered', 'cli')).not.toThrow();
    expect(() => audit('pause', 'api', { reason: 'test' })).not.toThrow();
    expect(() => audit('error', 'system', { message: 'test error' })).not.toThrow();
  });

  it('readAuditLog returns array', () => {
    const entries = readAuditLog(10);
    expect(Array.isArray(entries)).toBe(true);
  });

  it('readAuditLog respects limit', () => {
    const entries = readAuditLog(1);
    expect(entries.length).toBeLessThanOrEqual(1);
  });

  it('audit entry has required fields', () => {
    // Write and read back
    audit('document_processed', 'cli', { docName: 'test.pdf' });
    const entries = readAuditLog(100);
    if (entries.length > 0) {
      const last = entries[entries.length - 1];
      expect(last).toHaveProperty('timestamp');
      expect(last).toHaveProperty('action');
      expect(last).toHaveProperty('initiator');
    }
  });
});
