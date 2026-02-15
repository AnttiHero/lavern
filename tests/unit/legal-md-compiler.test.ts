/**
 * Tests for the LEGAL.md Compiler MCP Tool.
 *
 * Verifies:
 * - Generates valid markdown
 * - Includes institutional memory sorted by effectiveness
 * - Includes active and deprecated precedents
 * - Includes anti-patterns
 * - Handles empty state
 * - Reads back compiled LEGAL.md
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SessionState } from '../../src/session/session-state.js';
import { AutoApproveGateResolver } from '../../src/gates/gate-resolver.js';
import { createLegalMdTools } from '../../src/mcp/tools/legal-md-compiler.js';

// ── Helper ───────────────────────────────────────────────────────────────

async function invokeTool(tools: any[], name: string, args: Record<string, unknown> = {}) {
  const t = tools.find((t: any) => t.name === name);
  if (!t) throw new Error(`Tool not found: ${name}`);
  return (t as any).handler(args);
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('LEGAL.md Compiler', () => {
  let session: SessionState;
  let tools: ReturnType<typeof createLegalMdTools>;
  let tmpDir: string;
  let memoryDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shem-legal-md-'));
    memoryDir = path.join(tmpDir, '.shem', 'memory');
    fs.mkdirSync(memoryDir, { recursive: true });

    session = new SessionState('test-session', {
      gateResolver: new AutoApproveGateResolver(),
      memoryDir,
      baselinesDir: path.join(tmpDir, '.shem', 'baselines'),
      reportsDir: path.join(tmpDir, '.shem', 'reports'),
    });
    tools = createLegalMdTools(session);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('generates valid markdown with empty state', async () => {
    const result = await invokeTool(tools, 'compile_legal_md');
    expect(result.content[0].text).toContain('LEGAL.md Compiled');

    const legalMdPath = path.join(tmpDir, '.shem', 'LEGAL.md');
    expect(fs.existsSync(legalMdPath)).toBe(true);

    const content = fs.readFileSync(legalMdPath, 'utf-8');
    expect(content).toContain('# LEGAL.md');
    expect(content).toContain('Summary');
    expect(content).toContain('Institutional memories | 0');
  });

  it('includes institutional memory sorted by effectiveness', async () => {
    const memories = [
      {
        id: 'IM-001', category: 'rule', content: 'Always preserve governing law clause',
        source: 'ethics-auditor', addedAt: new Date().toISOString(), usageCount: 5,
        effectiveness: 0.9, usedInSessions: ['s1'], outcomes: [],
      },
      {
        id: 'IM-002', category: 'rule', content: 'Check for dark patterns in cancellation flow',
        source: 'design-reviewer', addedAt: new Date().toISOString(), usageCount: 2,
        effectiveness: 0.6, usedInSessions: [], outcomes: [],
      },
      {
        id: 'IM-003', category: 'lesson', content: 'Finnish law requires specific consent language',
        source: 'meaning-guardian', addedAt: new Date().toISOString(), usageCount: 1,
        effectiveness: 0.75, usedInSessions: [], outcomes: [],
      },
    ];
    fs.writeFileSync(path.join(memoryDir, 'institutional.json'), JSON.stringify(memories));

    await invokeTool(tools, 'compile_legal_md');

    const legalMdPath = path.join(tmpDir, '.shem', 'LEGAL.md');
    const content = fs.readFileSync(legalMdPath, 'utf-8');

    expect(content).toContain('Institutional Memory');
    expect(content).toContain('IM-001');
    expect(content).toContain('IM-002');
    expect(content).toContain('IM-003');
    expect(content).toContain('effectiveness: 90%');

    // IM-001 (90%) should appear before IM-002 (60%) in the Rules section
    const im001Pos = content.indexOf('IM-001');
    const im002Pos = content.indexOf('IM-002');
    expect(im001Pos).toBeLessThan(im002Pos);
  });

  it('includes active and deprecated precedents', async () => {
    const precedents = [
      {
        id: 'P-001', documentType: 'privacy_policy', jurisdiction: 'EU',
        patternName: 'Simplify consent', description: 'Plain language consent',
        beforeSnippet: '...', afterSnippet: '...', qualityScore: 3.5,
        addedAt: new Date().toISOString(), timesUsed: 5, timesQueried: 10,
        effectivenessScore: 0.85, outcomes: [], deprecated: false,
      },
      {
        id: 'P-002', documentType: 'privacy_policy', jurisdiction: 'EU',
        patternName: 'Remove all legalese', description: 'Too aggressive simplification',
        beforeSnippet: '...', afterSnippet: '...', qualityScore: 1.5,
        addedAt: new Date().toISOString(), timesUsed: 3, timesQueried: 3,
        effectivenessScore: 0.15, outcomes: [], deprecated: true,
        deprecationReason: 'Auto-deprecated: 3 consecutive poor outcomes',
      },
    ];
    fs.writeFileSync(path.join(memoryDir, 'precedents.json'), JSON.stringify(precedents));

    await invokeTool(tools, 'compile_legal_md');

    const legalMdPath = path.join(tmpDir, '.shem', 'LEGAL.md');
    const content = fs.readFileSync(legalMdPath, 'utf-8');

    expect(content).toContain('Active Precedents');
    expect(content).toContain('Deprecated Precedents');
    expect(content).toContain('P-001');
    expect(content).toContain('P-002');
    expect(content).toContain('Auto-deprecated');
  });

  it('includes anti-patterns sorted by severity', async () => {
    const antiPatterns = [
      {
        id: 'AP-001', documentType: 'privacy_policy', jurisdiction: 'EU',
        description: 'Minor style regression', source: 's1', category: 'regression',
        severity: 'GREEN', addedAt: new Date().toISOString(), occurrences: 1,
        lastSeenAt: new Date().toISOString(),
      },
      {
        id: 'AP-002', documentType: 'privacy_policy', jurisdiction: 'EU',
        description: 'Critical readability regression', source: 's2', category: 'regression',
        severity: 'RED', addedAt: new Date().toISOString(), occurrences: 3,
        lastSeenAt: new Date().toISOString(),
      },
    ];
    fs.writeFileSync(path.join(memoryDir, 'anti-patterns.json'), JSON.stringify(antiPatterns));

    await invokeTool(tools, 'compile_legal_md');

    const legalMdPath = path.join(tmpDir, '.shem', 'LEGAL.md');
    const content = fs.readFileSync(legalMdPath, 'utf-8');

    expect(content).toContain('Anti-Patterns');
    expect(content).toContain('AP-002'); // RED first

    // RED should appear before GREEN
    const redPos = content.indexOf('AP-002');
    const greenPos = content.indexOf('AP-001');
    expect(redPos).toBeLessThan(greenPos);
  });

  it('reads back compiled LEGAL.md', async () => {
    // First compile
    await invokeTool(tools, 'compile_legal_md');

    // Then read
    const result = await invokeTool(tools, 'get_legal_md');
    expect(result.content[0].text).toContain('# LEGAL.md');
  });

  it('returns not found when no LEGAL.md exists', async () => {
    const result = await invokeTool(tools, 'get_legal_md');
    expect(result.content[0].text).toContain('No LEGAL.md found');
  });

  it('emits legal_md_compiled event', async () => {
    const events: any[] = [];
    session.events.on('event', (e: any) => events.push(e));

    const memories = [
      {
        id: 'IM-001', category: 'rule', content: 'Test rule',
        source: 'test', addedAt: new Date().toISOString(), usageCount: 0,
        effectiveness: 0.5, usedInSessions: [], outcomes: [],
      },
    ];
    fs.writeFileSync(path.join(memoryDir, 'institutional.json'), JSON.stringify(memories));

    await invokeTool(tools, 'compile_legal_md');

    const compiledEvent = events.find(e => e.type === 'legal_md_compiled');
    expect(compiledEvent).toBeDefined();
    expect(compiledEvent.entriesCount).toBe(1);
  });
});
