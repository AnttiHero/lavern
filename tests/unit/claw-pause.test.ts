/**
 * Unit Tests — Claw Pause/Resume (src/claw/types.ts + profile handling)
 *
 * Tests the pause/resume type definitions and profile state management.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { writeJsonFileAtomic, readJsonFile } from '../../src/utils/fs-helpers.js';
import type { ClawProfile } from '../../src/claw/types.js';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'claw-pause-'));
}

function makeProfile(overrides: Partial<ClawProfile> = {}): ClawProfile {
  return {
    company: 'TestCorp',
    jurisdiction: 'Delaware',
    industry: 'Technology',
    size: 'Startup',
    concerns: [],
    preferences: {
      style: 'plain-language',
      intensity: 'standard',
      riskAppetite: 'balanced',
    },
    watchPaths: ['/tmp/test-docs'],
    budget: { totalUsd: 50, perDocumentMaxUsd: 10 },
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('ClawProfile pause/resume', () => {
  let dir: string;

  beforeEach(() => {
    dir = tmpDir();
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('accepts paused and pausedAt fields', () => {
    const profile = makeProfile({ paused: true, pausedAt: '2026-03-22T12:00:00Z' });
    expect(profile.paused).toBe(true);
    expect(profile.pausedAt).toBe('2026-03-22T12:00:00Z');
  });

  it('defaults paused to undefined (backward compatible)', () => {
    const profile = makeProfile();
    expect(profile.paused).toBeUndefined();
    expect(profile.pausedAt).toBeUndefined();
  });

  it('persists pause state to disk via writeJsonFileAtomic', () => {
    const profile = makeProfile({ paused: true, pausedAt: '2026-03-22T12:00:00Z' });
    const profilePath = path.join(dir, 'profile.json');

    writeJsonFileAtomic(profilePath, profile);

    const loaded = readJsonFile<ClawProfile>(profilePath, makeProfile());
    expect(loaded.paused).toBe(true);
    expect(loaded.pausedAt).toBe('2026-03-22T12:00:00Z');
  });

  it('resume clears paused and pausedAt', () => {
    const profile = makeProfile({ paused: true, pausedAt: '2026-03-22T12:00:00Z' });
    const profilePath = path.join(dir, 'profile.json');

    // Pause
    writeJsonFileAtomic(profilePath, profile);

    // Resume
    const loaded = readJsonFile<ClawProfile>(profilePath, makeProfile());
    loaded.paused = false;
    loaded.pausedAt = undefined;
    writeJsonFileAtomic(profilePath, loaded);

    const resumed = readJsonFile<ClawProfile>(profilePath, makeProfile());
    expect(resumed.paused).toBe(false);
    expect(resumed.pausedAt).toBeUndefined();
  });

  it('pause state survives read/write cycle (daemon restart)', () => {
    const profile = makeProfile({ paused: true, pausedAt: '2026-03-22T14:30:00Z' });
    const profilePath = path.join(dir, 'profile.json');

    writeJsonFileAtomic(profilePath, profile);

    // Simulate daemon restart — fresh read
    const reloaded = readJsonFile<ClawProfile>(profilePath, makeProfile());
    expect(reloaded.paused).toBe(true);
    expect(reloaded.pausedAt).toBe('2026-03-22T14:30:00Z');
  });

  it('old profiles without paused field load correctly', () => {
    // Simulate pre-v0.13 profile (no paused field)
    const oldProfile = {
      company: 'OldCorp',
      jurisdiction: 'California',
      industry: 'Finance',
      size: 'Large',
      concerns: [],
      preferences: { style: 'traditional', intensity: 'thorough', riskAppetite: 'conservative' },
      watchPaths: ['/tmp/old-docs'],
      budget: { totalUsd: 100, perDocumentMaxUsd: 20 },
      createdAt: '2025-01-01T00:00:00Z',
    };

    const profilePath = path.join(dir, 'profile.json');
    writeJsonFileAtomic(profilePath, oldProfile);

    const loaded = readJsonFile<ClawProfile>(profilePath, makeProfile());
    // paused should be undefined (not false) — backward compatible
    expect(loaded.paused).toBeUndefined();
  });
});
