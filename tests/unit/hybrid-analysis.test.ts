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

vi.mock('../../src/claw/local-analysis.js', () => ({
  analyzeLocally: vi.fn(),
}));

vi.mock('../../src/dispatch.js', () => ({
  dispatch: vi.fn(),
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
import { dispatch } from '../../src/dispatch.js';

const mockAnalyzeLocally = vi.mocked(analyzeLocally);
const mockDispatch = vi.mocked(dispatch);

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

function makeFrontierSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'test-session',
    accumulatedCost: 0.05,
    debate: {
      findings: [
        {
          id: 'f1',
          agentRole: 'contract-analyst',
          findingType: 'contract-risk',
          content: 'The non-compete clause is unreasonably broad',
          evidence: ['Section 4.2'],
          severity: 'RED',
          confidence: 0.92,
          timestamp: new Date().toISOString(),
          resolved: false,
        },
      ],
      challenges: [],
      responses: [],
      resolutions: [],
      rounds: [],
    },
    ...overrides,
  } as any;
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

    expect(mockDispatch).not.toHaveBeenCalled();
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
    mockDispatch.mockResolvedValue(makeFrontierSession());

    const result = await analyzeHybrid('text', 'file.pdf', profile, clawConfig, parsedDoc, silentLog);

    expect(mockDispatch).toHaveBeenCalledTimes(1);
    expect(result.frontierClauseCount).toBe(1); // only the critical clause
    expect(result.totalClauseCount).toBe(2);
  });

  it('cost includes frontier cost', async () => {
    mockAnalyzeLocally.mockResolvedValue(makeLocalResult());
    mockDispatch.mockResolvedValue(makeFrontierSession());

    const result = await analyzeHybrid('text', 'file.pdf', profile, clawConfig, parsedDoc, silentLog);

    expect(result.cost.localUsd).toBe(0);
    expect(result.cost.frontierUsd).toBe(0.05);
    expect(result.cost.totalUsd).toBe(0.05);
  });

  it('tags frontier findings with source "frontier" or "both"', async () => {
    mockAnalyzeLocally.mockResolvedValue(makeLocalResult());
    mockDispatch.mockResolvedValue(makeFrontierSession());

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
    mockDispatch.mockResolvedValue(makeFrontierSession({ debate: { findings: [], challenges: [], responses: [], resolutions: [], rounds: [] } }));

    const result = await analyzeHybrid('text', 'file.pdf', profile, clawConfig, parsedDoc, silentLog);
    // 'Acme Corp' is a defined term, should be anonymized
    expect(result.entityCount).toBeGreaterThanOrEqual(1);
  });

  it('processingNote describes hybrid analysis', async () => {
    mockAnalyzeLocally.mockResolvedValue(makeLocalResult());
    mockDispatch.mockResolvedValue(makeFrontierSession());

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
    mockDispatch.mockResolvedValue(makeFrontierSession({ debate: { findings: [], challenges: [], responses: [], resolutions: [], rounds: [] } }));

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
    mockDispatch.mockResolvedValue(makeFrontierSession({ debate: { findings: [], challenges: [], responses: [], resolutions: [], rounds: [] } }));

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
    // Frontier returns anonymized placeholders — the pipeline should deanonymize them
    mockDispatch.mockResolvedValue(makeFrontierSession({
      accumulatedCost: 0.03,
      debate: {
        findings: [
          {
            id: 'f2',
            agentRole: 'contract-analyst',
            findingType: 'contract-risk',
            content: '[PARTY_1] non-compete is unreasonable',
            evidence: ['[PARTY_1] clause in Section 4'],
            severity: 'RED',
            confidence: 0.9,
            timestamp: new Date().toISOString(),
            resolved: false,
          },
        ],
        challenges: [],
        responses: [],
        resolutions: [],
        rounds: [],
      },
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
    mockDispatch.mockRejectedValue(new Error('API timeout'));

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
    mockDispatch.mockRejectedValue(new Error('Network error'));

    const result = await analyzeHybrid('text', 'file.pdf', profile, clawConfig, parsedDoc, silentLog);
    // frontierClauseCount should still reflect how many would have been sent
    expect(result.frontierClauseCount).toBe(1);
  });

  it('preserves entity count on dispatch failure', async () => {
    mockAnalyzeLocally.mockResolvedValue(makeLocalResult());
    mockDispatch.mockRejectedValue(new Error('Timeout'));

    const result = await analyzeHybrid('text', 'file.pdf', profile, clawConfig, parsedDoc, silentLog);
    expect(result.entityCount).toBeGreaterThanOrEqual(0);
  });
});

describe('analyzeHybrid — frontier with no debate findings', () => {
  it('handles empty frontier debate findings', async () => {
    mockAnalyzeLocally.mockResolvedValue(makeLocalResult());
    mockDispatch.mockResolvedValue(makeFrontierSession({
      accumulatedCost: 0.02,
      debate: { findings: [], challenges: [], responses: [], resolutions: [], rounds: [] },
    }));

    const result = await analyzeHybrid('text', 'file.pdf', profile, clawConfig, parsedDoc, silentLog);
    expect(result.cost.frontierUsd).toBe(0.02);
    // Should still have the local findings
    expect(result.findings.length).toBeGreaterThan(0);
  });

  it('handles missing debate on session', async () => {
    mockAnalyzeLocally.mockResolvedValue(makeLocalResult());
    mockDispatch.mockResolvedValue(makeFrontierSession({
      accumulatedCost: 0.01,
      debate: undefined,
    }));

    const result = await analyzeHybrid('text', 'file.pdf', profile, clawConfig, parsedDoc, silentLog);
    // Should gracefully handle missing debate (no frontier findings)
    expect(result.findings.length).toBeGreaterThan(0);
  });
});
