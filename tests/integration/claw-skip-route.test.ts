/**
 * Integration Test — Watchman Skip-Route Authority (processor.ts wiring)
 *
 * Lighthouse claim (per the article + plan): "the Watchman can say 'this
 * isn't worth reading' — a meeting agenda accidentally dropped in the
 * watched folder, an empty boilerplate, a duplicate. That decision saves
 * the Reader ~22 calls per skipped document."
 *
 * This test proves the wiring is real:
 *   - A meeting-agenda file gets indexed in the registry
 *   - Watchman heuristic routes it to 'skip'
 *   - processor.processDocument exits early
 *   - Registry status becomes 'skipped' (the soft-skip contract)
 *   - Reader is NEVER invoked (no clause-fan-out fetch calls)
 *   - The document costs $0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { processDocument } from '../../src/claw/processor.js';
import { DocumentRegistry } from '../../src/claw/registry.js';
import type { ClawProfile, ClawConfig } from '../../src/claw/types.js';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'claw-skip-test-'));
}

function makeProfile(overrides: Partial<ClawProfile> = {}): ClawProfile {
  return {
    company: 'Acme Holdings',
    jurisdiction: 'NSW',
    industry: 'mining',
    size: 'mid',
    concerns: [],
    preferences: { style: 'plain-language', intensity: 'standard', riskAppetite: 'conservative' },
    watchPaths: ['/tmp/test'],
    budget: { totalUsd: 100, perDocumentMaxUsd: 5 },
    processing: 'local',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

let dir: string;
let watchedDir: string;
let registry: DocumentRegistry;
let profile: ClawProfile;
let cfg: ClawConfig;

beforeEach(() => {
  dir = tmpDir();
  watchedDir = path.join(dir, 'watched');
  fs.mkdirSync(watchedDir, { recursive: true });
  registry = new DocumentRegistry(dir, 100);
  profile = makeProfile({ watchPaths: [watchedDir] });
  cfg = {
    dir, profile,
    budget: 100, perDocBudget: 5,
    intensity: 'standard', style: 'plain-language',
    formats: ['md'],
    scanIntervalMs: 60000, once: true, dryRun: false, debug: false,
    ethicalMode: false,
  };
});

afterEach(() => {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  vi.restoreAllMocks();
});

describe('processor · Watchman skip-route authority', () => {
  it('marks a meeting-agenda document as "skipped" without invoking the Reader', async () => {
    // 1. Drop a meeting-agenda file the heuristic Watchman recognises as skippable
    const filename = 'meeting_agenda_2026-05-12.md';
    const fp = path.join(watchedDir, filename);
    fs.writeFileSync(fp,
      `Meeting Agenda — Bondi Office\n` +
      `Date: 2026-05-12\n` +
      `Attendees: A. Singh, M. Tran, P. Dube\n\n` +
      `1. Q2 budget review\n` +
      `2. Hiring update\n` +
      `3. Office snacks vote\n` +
      `4. AOB\n`.padEnd(700, ' ')
    );

    const indexResult = registry.indexFile(fp);
    expect(indexResult).toBe('new');
    const doc = registry.getDocumentByPath(fp);
    expect(doc).toBeDefined();
    const hash = doc!.hash;

    // 2. Make all network calls fail — Watchman falls through to heuristic.
    //    The heuristic will skip "meeting_agenda" filenames.
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new Error('test: network disabled')
    );

    // 3. Run the full processor
    const result = await processDocument(fp, hash, profile, registry, cfg);

    // 4. Verify skip-route contract
    expect(result.success).toBe(true);
    expect(result.findings).toEqual({ critical: 0, major: 0, minor: 0 });
    expect(result.deliveryDir).toBe(''); // skip route doesn't write a delivery
    expect(result.costUsd).toBe(0);

    // 5. Registry status is 'skipped' (soft-skip: not 'reviewed', not 'flagged')
    const updated = registry.getDocument(hash);
    expect(updated).toBeDefined();
    expect(updated!.status).toBe('skipped');

    // 6. Reader was never invoked. Heuristic Watchman makes no network calls;
    //    a Reader fan-out would have made ~22+ calls. Allow at most a few
    //    Watchman/cloud probes (some fail-fast paths attempt local first).
    expect(fetchSpy.mock.calls.length).toBeLessThan(5);
  });

  it('does NOT mark a substantive contract as skipped', async () => {
    const filename = 'jv_agreement_v3.docx';
    const fp = path.join(watchedDir, filename);
    fs.writeFileSync(fp,
      `JOINT VENTURE AGREEMENT\n\n` +
      `This Joint Venture Agreement is made between Acme Holdings and ` +
      `Bellrock Minerals for the East Tenement project.\n\n` +
      `1. Contributions\nAcme contributes AUD 5,000,000.\n` +
      `2. Penalty\nLate contribution triggers AUD 500,000/week.\n`.padEnd(900, ' ')
    );

    const indexResult = registry.indexFile(fp);
    expect(indexResult).toBe('new');
    const doc = registry.getDocumentByPath(fp);
    const hash = doc!.hash;

    // Network disabled → heuristic Watchman classifies as JV / deep-read.
    // The Reader path will then attempt to call Ollama, which will also
    // fail under the mock — but we only care about the skip vs not-skip
    // decision here, not what happens after.
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('test: network disabled'));

    // Wrap to capture the intermediate status: processor sets 'processing'
    // before falling through to the local pipeline. We check that the
    // Watchman did NOT short-circuit via skip.
    const before = registry.getDocument(hash)!.status;
    expect(before).toBe('new');

    // Fire and forget — we expect this to throw/return failure because the
    // local Reader can't reach Ollama. The point is: the SKIP exit should
    // not have triggered.
    let errored = false;
    try {
      const result = await processDocument(fp, hash, profile, registry, cfg);
      // If somehow it succeeded (unlikely with no network), at minimum the
      // status is not 'skipped'.
      expect(result.success).toBe(true);
    } catch {
      errored = true;
    }

    const after = registry.getDocument(hash);
    // Status is anything EXCEPT 'skipped' — could be 'processing', 'error',
    // 'reviewed' if we somehow processed, but never the soft-skip path.
    expect(after!.status).not.toBe('skipped');
    // Sanity: either we errored or made progress out of 'new'
    expect(errored || after!.status !== 'new').toBe(true);
  });
});
