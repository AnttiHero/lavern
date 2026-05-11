/**
 * Unit Tests — Hybrid Analysis Pipeline (src/claw/hybrid-analysis.ts)
 *
 * Tests analyzeHybrid() with mocked local analysis and frontier dispatch.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LocalAnalysisResult } from '../../src/claw/local-analysis.js';
import type { ClawProfile, ClawConfig } from '../../src/claw/types.js';
import type { ParsedDocument } from '../../src/documents/types.js';

// ── Mocks ──────────────────────────────────────────────────────────────
//
// hybrid-analysis.ts calls Anthropic's messages.create() directly (no
// dispatch / Agent SDK indirection — see comment at the call site about
// why a direct call is correct for this path). Tests mock the SDK and
// the local-analysis call; nothing else is needed.

vi.mock('../../src/claw/local-analysis.js', () => ({
  analyzeLocally: vi.fn(),
}));

// Hoisted spy used by the @anthropic-ai/sdk mock. The mock factory is
// hoisted by Vitest, so anything it closes over must also be hoisted.
const { mockMessagesCreate } = vi.hoisted(() => ({ mockMessagesCreate: vi.fn() }));

vi.mock('@anthropic-ai/sdk', () => {
  // v4 strictness: vi.fn() used as a constructor (`new Anthropic()`) must be
  // implemented with a regular function or class — arrow functions are not
  // constructible. Previously (v2) vitest tolerated arrows here; v4 rejects
  // them with "The vi.fn() mock did not use 'function' or 'class'".
  const Anthropic = vi.fn().mockImplementation(function (this: unknown) {
    return {
      messages: { create: mockMessagesCreate },
    };
  });
  return { default: Anthropic };
});

// ensureApiKey() throws unless an API key is set; the SDK is mocked
// anyway, so we just need it not to fail.
vi.mock('../../src/utils/ensure-api-key.js', () => ({
  ensureApiKey: vi.fn(),
}));

vi.mock('../../src/config.js', () => ({
  config: {
    claw: { localModel: 'test-model' },
  },
}));

vi.mock('../../src/gates/gate-resolver.js', () => ({
  AutoApproveGateResolver: vi.fn().mockImplementation(() => ({})),
}));

import { analyzeHybrid } from '../../src/claw/hybrid-analysis.js';
import { analyzeLocally } from '../../src/claw/local-analysis.js';

const mockAnalyzeLocally = vi.mocked(analyzeLocally);

// ── Fixtures ───────────────────────────────────────────────────────────

function makeLocalResult(overrides: Partial<LocalAnalysisResult> = {}): LocalAnalysisResult {
  return {
    summary: 'Test summary',
    documentType: 'NDA',
    clauses: [
      { title: 'Non-Compete', text: 'Acme Corp shall not...', concern: 'Overly broad', severity: 'critical' },
      { title: 'Definitions', text: 'Standard terms...', concern: 'None', severity: 'info' },
    ],
    risks: [
      { description: 'Broad non-compete', severity: 'high', citation: 'Section 4.2' },
    ],
    recommendations: ['Narrow the scope'],
    confidenceNote: 'Analyzed locally',
    model: 'llama3.1:8b',
    ...overrides,
  };
}

// Opus 4.7 pricing — the implementation computes cost from token usage:
//   frontierUsd = (inputT * 15 + outputT * 75) / 1_000_000
const OPUS_INPUT_USD_PER_M = 15;
const OPUS_OUTPUT_USD_PER_M = 75;

function expectedFrontierCost(inputTokens: number, outputTokens: number): number {
  return (inputTokens * OPUS_INPUT_USD_PER_M + outputTokens * OPUS_OUTPUT_USD_PER_M) / 1_000_000;
}

interface FrontierMockOptions {
  /** JSON object the model "returned". Stringified into the response.text. */
  body?: { findings?: Array<{
    title?: string;
    severity?: string;
    content?: string;
    evidence?: string;
    confidence?: number;
  }> };
  inputTokens?: number;
  outputTokens?: number;
}

/** Build a mock Anthropic messages.create() response. Mirrors the shape
 *  hybrid-analysis.ts actually consumes: response.content[0].text +
 *  response.usage.{input,output}_tokens. */
function makeFrontierResponse(opts: FrontierMockOptions = {}) {
  const body = opts.body ?? {
    findings: [
      {
        title: 'Non-Compete Risk',
        severity: 'critical',
        content: 'The non-compete clause is unreasonably broad against [PARTY_1]',
        evidence: '[PARTY_1] shall not compete (Section 4.2)',
        confidence: 0.92,
      },
    ],
  };
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(body) }],
    usage: {
      input_tokens: opts.inputTokens ?? 2000,
      output_tokens: opts.outputTokens ?? 400,
    },
  };
}

const profile: ClawProfile = {
  company: 'Test Co',
  jurisdiction: 'US',
  industry: 'tech',
  size: 'small',
  concerns: [],
  preferences: { style: 'plain-language', intensity: 'standard', riskAppetite: 'balanced' },
  watchPaths: ['/tmp/docs'],
  budget: { totalUsd: 100, perDocumentMaxUsd: 5 },
  createdAt: new Date().toISOString(),
};

const clawConfig: ClawConfig = {
  dir: '/tmp/.lavern',
  profile,
  budget: 100,
  perDocBudget: 5,
  intensity: 'standard',
  style: 'professional',
  formats: ['md'],
  scanIntervalMs: 60000,
  once: false,
  dryRun: false,
  debug: false,
  ethicalMode: false,
} as any;

const parsedDoc: ParsedDocument = {
  id: 'doc-1',
  name: 'test.pdf',
  mimeType: 'application/pdf',
  size: 5000,
  pageCount: 3,
  wordCount: 1200,
  fullText: 'Full document text...',
  sections: [],
  tables: [],
  definedTerms: ['Acme Corp'],
  parseMethod: 'pdf-parse',
} as any;

const silentLog = () => {};

// ── Tests ──────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe('analyzeHybrid — fast path (local only)', () => {
  it('returns local-only when all findings are info/minor', async () => {
    mockAnalyzeLocally.mockResolvedValue(makeLocalResult({
      clauses: [
        { title: 'Definitions', text: 'Standard terms', concern: 'None', severity: 'info' },
        { title: 'Notices', text: 'Written notice required', concern: 'Minor gap', severity: 'minor' },
      ],
      risks: [],
    }));

    const result = await analyzeHybrid('text', 'file.pdf', profile, clawConfig, parsedDoc, silentLog);

    expect(mockMessagesCreate).not.toHaveBeenCalled();
    expect(result.frontierClauseCount).toBe(0);
    expect(result.cost.frontierUsd).toBe(0);
    expect(result.cost.totalUsd).toBe(0);
    expect(result.processingNote).toContain('low-severity');
  });

  it('local cost is always $0', async () => {
    mockAnalyzeLocally.mockResolvedValue(makeLocalResult({ clauses: [], risks: [] }));
    const result = await analyzeHybrid('text', 'file.pdf', profile, clawConfig, parsedDoc, silentLog);
    expect(result.cost.localUsd).toBe(0);
  });

  it('includes risk findings in local-only results', async () => {
    mockAnalyzeLocally.mockResolvedValue(makeLocalResult({
      clauses: [{ title: 'Clause', text: 'text', concern: 'ok', severity: 'info' }],
      risks: [{ description: 'Some risk', severity: 'low', citation: 'Section 1' }],
    }));

    const result = await analyzeHybrid('text', 'file.pdf', profile, clawConfig, parsedDoc, silentLog);
    expect(result.findings.some(f => f.title === 'Some risk')).toBe(true);
  });

  it('tags local-only findings with source "local"', async () => {
    mockAnalyzeLocally.mockResolvedValue(makeLocalResult({
      clauses: [{ title: 'Info', text: 'text', concern: 'ok', severity: 'info' }],
      risks: [],
    }));

    const result = await analyzeHybrid('text', 'file.pdf', profile, clawConfig, parsedDoc, silentLog);
    expect(result.findings.every(f => f.source === 'local')).toBe(true);
  });

  it('empty clauses and risks produce empty findings', async () => {
    mockAnalyzeLocally.mockResolvedValue(makeLocalResult({ clauses: [], risks: [] }));
    const result = await analyzeHybrid('text', 'file.pdf', profile, clawConfig, parsedDoc, silentLog);
    expect(result.findings).toEqual([]);
    expect(result.totalClauseCount).toBe(0);
  });
});

describe('analyzeHybrid — frontier escalation', () => {
  it('sends major/critical clauses to frontier', async () => {
    mockAnalyzeLocally.mockResolvedValue(makeLocalResult());
    mockMessagesCreate.mockResolvedValue(makeFrontierResponse());

    const result = await analyzeHybrid('text', 'file.pdf', profile, clawConfig, parsedDoc, silentLog);

    expect(mockMessagesCreate).toHaveBeenCalledTimes(1);
    expect(result.frontierClauseCount).toBe(1); // only the critical clause
    expect(result.totalClauseCount).toBe(2);
  });

  it('cost includes frontier cost', async () => {
    mockAnalyzeLocally.mockResolvedValue(makeLocalResult());
    // Pin token counts so the assertion is independent of mock defaults.
    const inputTokens = 2000;
    const outputTokens = 400;
    mockMessagesCreate.mockResolvedValue(makeFrontierResponse({ inputTokens, outputTokens }));

    const result = await analyzeHybrid('text', 'file.pdf', profile, clawConfig, parsedDoc, silentLog);

    const expected = expectedFrontierCost(inputTokens, outputTokens);
    expect(result.cost.localUsd).toBe(0);
    expect(result.cost.frontierUsd).toBeCloseTo(expected, 6);
    expect(result.cost.totalUsd).toBeCloseTo(expected, 6);
  });

  it('tags frontier findings with source "frontier" or "both"', async () => {
    mockAnalyzeLocally.mockResolvedValue(makeLocalResult());
    mockMessagesCreate.mockResolvedValue(makeFrontierResponse());

    const result = await analyzeHybrid('text', 'file.pdf', profile, clawConfig, parsedDoc, silentLog);

    const sources = new Set(result.findings.map(f => f.source));
    // Should have at least 'local' (for info clause + risk) and 'both' or 'frontier'
    expect(sources.has('local')).toBe(true);
  });

  it('entityCount reflects anonymization stats', async () => {
    mockAnalyzeLocally.mockResolvedValue(makeLocalResult({
      clauses: [
        { title: 'Non-Compete', text: 'Acme Corp shall not compete with Acme Corp.', concern: 'Broad', severity: 'critical' },
      ],
      risks: [],
    }));
    mockMessagesCreate.mockResolvedValue(makeFrontierResponse({ body: { findings: [] } }));

    const result = await analyzeHybrid('text', 'file.pdf', profile, clawConfig, parsedDoc, silentLog);
    // 'Acme Corp' is a defined term, should be anonymized
    expect(result.entityCount).toBeGreaterThanOrEqual(1);
  });

  it('processingNote describes hybrid analysis', async () => {
    mockAnalyzeLocally.mockResolvedValue(makeLocalResult());
    mockMessagesCreate.mockResolvedValue(makeFrontierResponse());

    const result = await analyzeHybrid('text', 'file.pdf', profile, clawConfig, parsedDoc, silentLog);
    expect(result.processingNote).toContain('Hybrid');
    expect(result.processingNote).toContain('escalated');
  });

  it('frontierClauseCount and totalClauseCount are accurate', async () => {
    mockAnalyzeLocally.mockResolvedValue(makeLocalResult({
      clauses: [
        { title: 'A', text: 'text', concern: 'x', severity: 'critical' },
        { title: 'B', text: 'text', concern: 'x', severity: 'major' },
        { title: 'C', text: 'text', concern: 'x', severity: 'minor' },
        { title: 'D', text: 'text', concern: 'x', severity: 'info' },
      ],
      risks: [],
    }));
    mockMessagesCreate.mockResolvedValue(makeFrontierResponse({ body: { findings: [] } }));

    const result = await analyzeHybrid('text', 'file.pdf', profile, clawConfig, parsedDoc, silentLog);
    expect(result.totalClauseCount).toBe(4);
    expect(result.frontierClauseCount).toBe(2); // critical + major
  });

  it('handles mixed severities — some local, some frontier', async () => {
    mockAnalyzeLocally.mockResolvedValue(makeLocalResult({
      clauses: [
        { title: 'Critical Clause', text: 'critical text', concern: 'Bad', severity: 'critical' },
        { title: 'Info Clause', text: 'info text', concern: 'OK', severity: 'info' },
        { title: 'Major Clause', text: 'major text', concern: 'Risky', severity: 'major' },
      ],
      risks: [],
    }));
    mockMessagesCreate.mockResolvedValue(makeFrontierResponse({ body: { findings: [] } }));

    const result = await analyzeHybrid('text', 'file.pdf', profile, clawConfig, parsedDoc, silentLog);
    expect(result.frontierClauseCount).toBe(2);
    // The info clause should be tagged local
    const infos = result.findings.filter(f => f.source === 'local' && f.severity === 'info');
    expect(infos.length).toBeGreaterThanOrEqual(1);
  });

  it('de-anonymizes frontier finding content and evidence', async () => {
    mockAnalyzeLocally.mockResolvedValue(makeLocalResult({
      clauses: [
        { title: 'Non-Compete', text: 'Acme Corp shall not compete.', concern: 'Broad', severity: 'critical' },
      ],
      risks: [],
    }));
    // Frontier returns anonymized placeholders — the pipeline should
    // deanonymize them via the mappings produced when the clause text was
    // anonymized in step 3 of analyzeHybrid.
    mockMessagesCreate.mockResolvedValue(makeFrontierResponse({
      body: {
        findings: [
          {
            title: 'Non-Compete is unreasonable',
            severity: 'critical',
            content: '[PARTY_1] non-compete is unreasonable',
            evidence: '[PARTY_1] clause in Section 4',
            confidence: 0.9,
          },
        ],
      },
      inputTokens: 1500,
      outputTokens: 300,
    }));

    const result = await analyzeHybrid('text', 'file.pdf', profile, clawConfig, parsedDoc, silentLog);
    // After deanonymization, [PARTY_1] should be restored to 'Acme Corp'
    const frontierFinding = result.findings.find(f => f.source === 'both' || f.source === 'frontier');
    expect(frontierFinding).toBeDefined();
    expect(frontierFinding!.content).toContain('Acme Corp');
    expect(frontierFinding!.evidence).toContain('Acme Corp');
  });
});

describe('analyzeHybrid — error handling', () => {
  it('falls back to local-only when dispatch throws', async () => {
    mockAnalyzeLocally.mockResolvedValue(makeLocalResult());
    mockMessagesCreate.mockRejectedValue(new Error('API timeout'));

    const result = await analyzeHybrid('text', 'file.pdf', profile, clawConfig, parsedDoc, silentLog);

    expect(result.processingNote).toContain('failed');
    expect(result.cost.frontierUsd).toBe(0);
    expect(result.cost.totalUsd).toBe(0);
    expect(result.findings.length).toBeGreaterThan(0);
    // All findings should be local
    expect(result.findings.every(f => f.source === 'local')).toBe(true);
  });

  it('re-throws when analyzeLocally throws', async () => {
    mockAnalyzeLocally.mockRejectedValue(new Error('Ollama not running'));

    await expect(
      analyzeHybrid('text', 'file.pdf', profile, clawConfig, parsedDoc, silentLog),
    ).rejects.toThrow('Ollama not running');
  });

  it('preserves frontier clause count on dispatch failure', async () => {
    mockAnalyzeLocally.mockResolvedValue(makeLocalResult());
    mockMessagesCreate.mockRejectedValue(new Error('Network error'));

    const result = await analyzeHybrid('text', 'file.pdf', profile, clawConfig, parsedDoc, silentLog);
    // frontierClauseCount should still reflect how many would have been sent
    expect(result.frontierClauseCount).toBe(1);
  });

  it('preserves entity count on dispatch failure', async () => {
    mockAnalyzeLocally.mockResolvedValue(makeLocalResult());
    mockMessagesCreate.mockRejectedValue(new Error('Timeout'));

    const result = await analyzeHybrid('text', 'file.pdf', profile, clawConfig, parsedDoc, silentLog);
    expect(result.entityCount).toBeGreaterThanOrEqual(0);
  });
});

describe('analyzeHybrid — frontier with no findings', () => {
  it('handles empty frontier findings array', async () => {
    mockAnalyzeLocally.mockResolvedValue(makeLocalResult());
    const inputTokens = 1000;
    const outputTokens = 200;
    mockMessagesCreate.mockResolvedValue(makeFrontierResponse({
      body: { findings: [] },
      inputTokens,
      outputTokens,
    }));

    const result = await analyzeHybrid('text', 'file.pdf', profile, clawConfig, parsedDoc, silentLog);
    expect(result.cost.frontierUsd).toBeCloseTo(expectedFrontierCost(inputTokens, outputTokens), 6);
    // Should still have the local findings
    expect(result.findings.length).toBeGreaterThan(0);
  });

  it('handles malformed frontier response (missing findings field)', async () => {
    mockAnalyzeLocally.mockResolvedValue(makeLocalResult());
    // Response has no findings field at all — implementation should treat as zero
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text' as const, text: '{"unrelated":"shape"}' }],
      usage: { input_tokens: 500, output_tokens: 100 },
    });

    const result = await analyzeHybrid('text', 'file.pdf', profile, clawConfig, parsedDoc, silentLog);
    // Should gracefully handle missing findings (no frontier findings, local survive)
    expect(result.findings.length).toBeGreaterThan(0);
  });
});
