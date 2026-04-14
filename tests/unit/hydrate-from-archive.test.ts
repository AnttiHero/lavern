import { describe, it, expect } from 'vitest';
import { hydrateSessionFromArchive, isHydratedFromArchive } from '../../src/session/hydrate-from-archive.js';
import type { ArchivedSession } from '../../src/db/database.js';

function makeArchived(overrides: Partial<ArchivedSession> = {}): ArchivedSession {
  return {
    id: 'shem-test-123',
    user_id: 'user-abc',
    title: 'Test Matter',
    status: 'completed',
    workflow_id: 'counsel',
    team_roles: '["managing-partner","contract-specialist"]',
    findings_count: 2,
    resolutions_count: 1,
    cost_usd: 1.14,
    budget_usd: 5,
    final_output: 'Process log...',
    assembled_document: '# Deliverable\n\nContent here.',
    summary_json: JSON.stringify({
      debate: { findingsCount: 2, challengesCount: 0, resolutionsCount: 1 },
      topFindings: [
        { severity: 'RED', content: 'Arbitration clause is one-sided', agent: 'contract-specialist' },
        { severity: 'YELLOW', content: 'Auto-renewal lacks clear disclosure', agent: 'ethics-auditor' },
      ],
      resolutions: [
        {
          debateTopic: 'Dispute resolution mechanism',
          resolution: 'Adopt mutual arbitration with class-action carve-out',
          winningPosition: 'contract-specialist',
          evidenceWeight: 'strong',
          escalationNeeded: false,
          confidence: 0.85,
        },
      ],
    }),
    created_at: '2026-04-14T19:20:00.000Z',
    completed_at: '2026-04-14T19:25:00.000Z',
    duration_ms: 300000,
    ...overrides,
  };
}

describe('hydrateSessionFromArchive', () => {
  it('maps basic fields straight through', () => {
    const h = hydrateSessionFromArchive(makeArchived());
    expect(h.id).toBe('shem-test-123');
    expect(h.workflowTemplateId).toBe('counsel');
    expect(h.accumulatedCost).toBe(1.14);
    expect(h.budgetUsd).toBe(5);
    expect(h.assembledDocument).toBe('# Deliverable\n\nContent here.');
    expect(h.userId).toBe('user-abc');
    expect(h.matterRecord?.title).toBe('Test Matter');
    expect(h.selectedTeam).toEqual(['managing-partner', 'contract-specialist']);
  });

  it('rebuilds findings from summary_json topFindings', () => {
    const h = hydrateSessionFromArchive(makeArchived());
    expect(h.debate.findings).toHaveLength(2);
    expect(h.debate.findings[0].severity).toBe('RED');
    expect(h.debate.findings[0].content).toBe('Arbitration clause is one-sided');
    expect(h.debate.findings[0].agentRole).toBe('contract-specialist');
    expect(h.debate.findings[0].resolved).toBe(true);
  });

  it('rebuilds resolutions from summary_json', () => {
    const h = hydrateSessionFromArchive(makeArchived());
    expect(h.debate.resolutions).toHaveLength(1);
    expect(h.debate.resolutions[0].debateTopic).toBe('Dispute resolution mechanism');
    expect(h.debate.resolutions[0].confidence).toBe(0.85);
    expect(h.debate.resolutions[0].escalationNeeded).toBe(false);
  });

  it('tolerates malformed summary_json', () => {
    const h = hydrateSessionFromArchive(makeArchived({ summary_json: 'not json' }));
    expect(h.debate.findings).toEqual([]);
    expect(h.debate.resolutions).toEqual([]);
  });

  it('tolerates malformed team_roles', () => {
    const h = hydrateSessionFromArchive(makeArchived({ team_roles: 'not json' }));
    expect(h.selectedTeam).toEqual([]);
  });

  it('handles missing/null assembled_document', () => {
    const h = hydrateSessionFromArchive(makeArchived({ assembled_document: null }));
    expect(h.assembledDocument).toBe('');
  });

  it('normalizes unknown severity to YELLOW', () => {
    const h = hydrateSessionFromArchive(makeArchived({
      summary_json: JSON.stringify({ topFindings: [{ severity: 'WAT', content: 'x', agent: 'a' }] }),
    }));
    expect(h.debate.findings[0].severity).toBe('YELLOW');
  });

  it('provides a no-op event bus', () => {
    const h = hydrateSessionFromArchive(makeArchived());
    // Should not throw
    expect(() => h.events.emitEvent({ type: 'test' })).not.toThrow();
  });

  it('flags hydrated sessions with _fromArchive', () => {
    const h = hydrateSessionFromArchive(makeArchived());
    expect(h._fromArchive).toBe(true);
    expect(isHydratedFromArchive(h)).toBe(true);
  });

  it('isHydratedFromArchive returns false for non-archived objects', () => {
    expect(isHydratedFromArchive({})).toBe(false);
    expect(isHydratedFromArchive(null)).toBe(false);
    expect(isHydratedFromArchive({ _fromArchive: false })).toBe(false);
  });

  it('rebuilds the exact shape buildFullContext reads', () => {
    // This test mirrors the fields accessed in buildFullContext()
    const h = hydrateSessionFromArchive(makeArchived());
    expect(h.matterRecord?.title).toBeDefined();
    expect(h.assembledDocument).toBeDefined();
    expect(h.debate.findings).toBeDefined();
    expect(h.debate.resolutions).toBeDefined();
    expect(h.beforeScores).toEqual([]);
    expect(h.afterScores).toEqual([]);
    expect(h.gateDecisions).toEqual([]);
    expect(h.verificationResults).toEqual([]);
    expect(typeof h.accumulatedCost).toBe('number');
    expect(typeof h.budgetUsd).toBe('number');
  });
});
