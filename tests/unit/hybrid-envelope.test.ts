/**
 * L04 / L05: the hybrid frontier envelope. Confidentiality (and ethical mode)
 * override a hybrid profile; the outbound request carries no client identity
 * and no invented role or jurisdiction — every fact traces to intake.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const spies = vi.hoisted(() => ({ cloud: vi.fn(), triage: vi.fn() }));
vi.mock('@anthropic-ai/sdk', () => ({ default: class { messages = { create: spies.cloud }; } }));
vi.mock('../../src/utils/ensure-api-key.js', () => ({ ensureApiKey: () => 'synthetic-key' }));
vi.mock('../../src/claw/local-analysis.js', async (original) => ({ ...(await original<any>()), analyzeLocally: spies.triage }));
vi.mock('../../src/claw/watchman.js', () => ({ watchmanTriage: async () => ({ documentType: 'NDA', route: 'deep-read', method: 'synthetic', confidence: 1, rationale: 'Synthetic NDA', costUsd: 0 }) }));
vi.mock('../../src/claw/notify.js', () => ({ notify: vi.fn() }));
import { config } from '../../src/config.js';
import { analyzeHybrid, assertNoIdentityLeak } from '../../src/claw/hybrid-analysis.js';
import { processDocument } from '../../src/claw/processor.js';
import { DocumentRegistry } from '../../src/claw/registry.js';
import { anonymize, deanonymize } from '../../src/claw/anonymize.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lavern-hybrid-env-'));
config.claw.dir = path.join(root, 'claw'); config.auditDir = path.join(root, 'audit');
const COMPANY = 'Synthetic Private Client Ltd';
const profile = { company: COMPANY, jurisdiction: 'Finland', industry: 'Software', processing: 'hybrid', preferences: { riskAppetite: 'conservative' } } as any;
const claw = { dir: root, perDocBudget: 5 } as any;
const document = { definedTerms: [COMPANY] } as any;
const response = (text: string) => ({ content: [{ type: 'text', text }], usage: { input_tokens: 1000, output_tokens: 100 }, stop_reason: 'end_turn' });

beforeEach(() => {
  vi.clearAllMocks();
  spies.cloud.mockResolvedValue(response('{"findings":[]}'));
  spies.triage.mockResolvedValue({ summary: 'Synthetic NDA review', documentType: 'NDA', clauses: [{ title: 'Confidentiality', text: `${COMPANY} shall keep data confidential.`, concern: 'Unlimited obligation', severity: 'critical' }], risks: [], recommendations: [], confidenceNote: 'Synthetic', model: 'mock' });
});

describe('hybrid outbound envelope', () => {
  it('carries no client identity anywhere, and no invented role or jurisdiction', async () => {
    await analyzeHybrid('synthetic NDA', 'nda.txt', profile, claw, document, () => {});
    expect(spies.cloud).toHaveBeenCalledOnce();
    const sent = spies.cloud.mock.calls[0][0];
    const whole = `${sent.system}\n${sent.messages[0].content}`;
    expect(whole).not.toContain(COMPANY);
    expect(sent.messages[0].content).toMatch(/Client: \[PARTY_\d+\]/);
    expect(sent.messages[0].content).toContain('[PARTY_1]'); // clause text anonymised with the SAME table
    expect(whole).not.toMatch(/joint venture|40%|non-operator|Australian|NSW/i);
    expect(whole).toContain('Finland');
    expect(sent.messages[0].content).toContain('not stated in intake');
  });

  it('confidential + hybrid profile -> zero external calls', async () => {
    const fullProfile = { ...profile, size: 'small', concerns: [], watchPaths: [root], budget: { totalUsd: 100, perDocumentMaxUsd: 5 }, createdAt: new Date().toISOString(), preferences: { ...profile.preferences, style: 'plain-language', intensity: 'standard' } } as any;
    const cfg = { dir: root, profile: fullProfile, budget: 100, perDocBudget: 5, intensity: 'standard', style: 'plain-language', formats: ['md'], scanIntervalMs: 60000, once: true, dryRun: false, debug: false, ethicalMode: false } as any;
    const file = path.join(root, 'confidential-nda.txt');
    fs.writeFileSync(file, `CONFIDENTIAL NDA\n${COMPANY} shall keep data confidential.`);
    const registry = new DocumentRegistry(root, 100); registry.indexFile(file);
    const hash = registry.getDocumentByPath(file)!.hash;
    await processDocument(file, hash, fullProfile, registry, cfg, () => {}, true);
    expect(spies.cloud).not.toHaveBeenCalled();
  });

  it('ethical mode + hybrid profile -> zero external calls', async () => {
    const fullProfile = { ...profile, size: 'small', concerns: [], watchPaths: [root], budget: { totalUsd: 100, perDocumentMaxUsd: 5 }, createdAt: new Date().toISOString(), preferences: { ...profile.preferences, style: 'plain-language', intensity: 'standard' } } as any;
    const cfg = { dir: root, profile: fullProfile, budget: 100, perDocBudget: 5, intensity: 'standard', style: 'plain-language', formats: ['md'], scanIntervalMs: 60000, once: true, dryRun: false, debug: false, ethicalMode: true } as any;
    const file = path.join(root, 'ethical-nda.txt');
    fs.writeFileSync(file, `NDA\n${COMPANY} shall keep data confidential.`);
    const registry = new DocumentRegistry(root, 100); registry.indexFile(file);
    const hash = registry.getDocumentByPath(file)!.hash;
    await processDocument(file, hash, fullProfile, registry, cfg, () => {}, false);
    expect(spies.cloud).not.toHaveBeenCalled();
  });

  it('assertNoIdentityLeak refuses an envelope that still names an identity', () => {
    expect(() => assertNoIdentityLeak({ system: 'x', messages: ['Client: Acme Oy'] }, ['Acme Oy'])).toThrow(/refusing to send/);
    expect(() => assertNoIdentityLeak({ system: 'x', messages: ['Client: [PARTY_1]'] }, ['Acme Oy'])).not.toThrow();
  });
});

describe('frontier accounting and budget (L06 / L07)', () => {
  it('a paid but unparseable response keeps its charge (L06)', async () => {
    spies.cloud.mockResolvedValue({ content: [{ type: 'text', text: 'not JSON' }], usage: { input_tokens: 10000, output_tokens: 2000 }, stop_reason: 'end_turn' });
    const r = await analyzeHybrid('synthetic NDA', 'nda.txt', profile, claw, document, () => {});
    expect(spies.cloud).toHaveBeenCalledOnce();
    expect(r.frontierStatus).toBe('unparseable');
    expect(r.cost.frontierUsd).toBeGreaterThan(0.1);
    expect(r.cost.totalUsd).toBe(r.cost.frontierUsd);
    expect(r.findings.length).toBeGreaterThan(0); // local findings still delivered
  });

  it('a refusal keeps its charge and is distinguished from a transport failure', async () => {
    spies.cloud.mockResolvedValue({ content: [], usage: { input_tokens: 500, output_tokens: 0 }, stop_reason: 'refusal' });
    const r = await analyzeHybrid('synthetic NDA', 'nda.txt', profile, claw, document, () => {});
    expect(r.frontierStatus).toBe('refused');
    expect(r.cost.frontierUsd).toBeGreaterThan(0);
    spies.cloud.mockRejectedValue(new Error('ECONNRESET'));
    const t = await analyzeHybrid('synthetic NDA', 'nda.txt', profile, claw, document, () => {});
    expect(t.frontierStatus).toBe('transport_failure');
    expect(t.cost.frontierUsd).toBe(0);
  });

  it('the advertised cap is enforced at the call boundary (L07)', async () => {
    // $0.10 per document -> $0.03 frontier cap: cannot cover a useful call -> no request
    const tiny = await analyzeHybrid('synthetic NDA', 'nda.txt', profile, { ...claw, perDocBudget: 0.1 }, document, () => {});
    expect(spies.cloud).not.toHaveBeenCalled();
    expect(tiny.frontierStatus).toBe('declined');
    expect(tiny.cost.totalUsd).toBe(0);
    // $0.5 -> $0.15 cap: affordable, but output is capped below the 16k default
    await analyzeHybrid('synthetic NDA', 'nda.txt', profile, { ...claw, perDocBudget: 0.5 }, document, () => {});
    const capped = spies.cloud.mock.calls[0][0].max_tokens;
    expect(capped).toBeLessThan(16_000); expect(capped).toBeGreaterThanOrEqual(1500);
    // $5 -> $1.5 cap: the full 16k budget fits
    vi.clearAllMocks(); spies.cloud.mockResolvedValue({ content: [{ type: 'text', text: '{"findings":[]}' }], usage: { input_tokens: 1000, output_tokens: 100 }, stop_reason: 'end_turn' });
    await analyzeHybrid('synthetic NDA', 'nda.txt', profile, { ...claw, perDocBudget: 5 }, document, () => {});
    expect(spies.cloud.mock.calls[0][0].max_tokens).toBe(16_000);
  });
});

describe('deanonymize is literal (L11)', () => {
  it('round-trips a party name containing replacement syntax', () => {
    const name = 'A$`B'; const original = `Before ${name} after.`;
    const r = anonymize(original, [name]);
    expect(deanonymize(r.anonymizedText, r.mappings)).toBe(original);
  });
  it('does not loop or re-expand when an original contains a placeholder-like token', () => {
    const r = { anonymizedText: 'See [PARTY_1].', mappings: [{ placeholder: '[PARTY_1]', original: 'Party [PARTY_1] Ltd', type: 'party' as const }] };
    expect(deanonymize(r.anonymizedText, r.mappings)).toBe('See Party [PARTY_1] Ltd.');
  });
});
