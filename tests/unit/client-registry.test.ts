/**
 * Unit Tests — Client Registry (src/claw/client-registry.ts)
 *
 * Tests multi-client isolation: add, list, activate/deactivate, directory creation.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { ClientRegistry } from '../../src/claw/client-registry.js';
import type { ClawProfile } from '../../src/claw/types.js';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'client-reg-'));
}

function makeProfile(name: string): ClawProfile {
  return {
    company: name,
    jurisdiction: 'Delaware',
    industry: 'Technology',
    size: 'Startup',
    concerns: [],
    preferences: { style: 'plain-language', intensity: 'standard', riskAppetite: 'balanced' },
    watchPaths: [],
    budget: { totalUsd: 50, perDocumentMaxUsd: 10 },
    createdAt: new Date().toISOString(),
  };
}

describe('ClientRegistry', () => {
  let dir: string;
  let registry: ClientRegistry;

  beforeEach(() => {
    dir = tmpDir();
    registry = new ClientRegistry(dir);
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('starts with empty client list', () => {
    expect(registry.listClients()).toHaveLength(0);
    expect(registry.summary.total).toBe(0);
  });

  it('adds a client and creates directory structure', () => {
    const entry = registry.addClient('Acme Corporation', makeProfile('Acme Corporation'));

    expect(entry.id).toBe('acme-corporation');
    expect(entry.name).toBe('Acme Corporation');
    expect(entry.active).toBe(true);
    expect(fs.existsSync(entry.dir)).toBe(true);
    expect(fs.existsSync(path.join(entry.dir, 'profile.json'))).toBe(true);
    expect(fs.existsSync(path.join(entry.dir, 'delivery'))).toBe(true);
  });

  it('rejects duplicate client IDs', () => {
    registry.addClient('Acme Corp', makeProfile('Acme Corp'));
    expect(() => registry.addClient('Acme Corp', makeProfile('Acme Corp'))).toThrow('already exists');
  });

  it('lists active clients only by default', () => {
    registry.addClient('Client A', makeProfile('A'));
    registry.addClient('Client B', makeProfile('B'));
    registry.deactivateClient('client-b');

    expect(registry.listClients()).toHaveLength(1);
    expect(registry.listClients(false)).toHaveLength(2);
  });

  it('deactivates and reactivates clients', () => {
    registry.addClient('Test Client', makeProfile('Test'));

    expect(registry.deactivateClient('test-client')).toBe(true);
    expect(registry.getClient('test-client')?.active).toBe(false);

    expect(registry.activateClient('test-client')).toBe(true);
    expect(registry.getClient('test-client')?.active).toBe(true);
  });

  it('returns false for unknown client deactivation', () => {
    expect(registry.deactivateClient('nonexistent')).toBe(false);
  });

  it('generates kebab-case IDs from names', () => {
    const entry = registry.addClient('Smith & Associates LLC', makeProfile('Smith'));
    expect(entry.id).toBe('smith-associates-llc');
  });

  it('persists to disk and loads on restart', () => {
    registry.addClient('Persist Corp', makeProfile('Persist'));

    // Create fresh registry from same directory
    const registry2 = new ClientRegistry(dir);
    expect(registry2.listClients()).toHaveLength(1);
    expect(registry2.getClient('persist-corp')?.name).toBe('Persist Corp');
  });

  it('returns correct summary counts', () => {
    registry.addClient('A', makeProfile('A'));
    registry.addClient('B', makeProfile('B'));
    registry.addClient('C', makeProfile('C'));
    registry.deactivateClient('c');

    const s = registry.summary;
    expect(s.total).toBe(3);
    expect(s.active).toBe(2);
    expect(s.inactive).toBe(1);
  });

  it('getClientDir falls back to base dir for default client', () => {
    expect(registry.getClientDir()).toBe(dir);
    expect(registry.getClientDir('default')).toBe(dir);
  });

  it('getClientDir returns client-specific dir', () => {
    const entry = registry.addClient('Specific Corp', makeProfile('Specific'));
    expect(registry.getClientDir('specific-corp')).toBe(entry.dir);
  });

  it('throws for unknown client dir', () => {
    expect(() => registry.getClientDir('nonexistent')).toThrow('Unknown client');
  });
});
