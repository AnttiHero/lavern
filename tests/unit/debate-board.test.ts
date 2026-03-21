/**
 * Unit tests for the Debate Board MCP tools.
 *
 * Tests: Post findings with confidence, post challenges, post responses,
 * resolve debates, get unresolved debates, state management.
 *
 * v3: Refactored to test the actual createDebateBoardTools function
 * instead of replicating the logic.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SessionState } from '../../src/session/session-state.js';
import { createDebateBoardTools } from '../../src/mcp/tools/debate-board.js';

describe('Debate Board', () => {
  let session: SessionState;
  let tools: any[];
  let postFinding: any;
  let postChallenge: any;
  let resolveDebate: any;
  let getUnresolvedDebates: any;

  beforeEach(() => {
    session = new SessionState('test-debate-board');
    tools = createDebateBoardTools(session);

    // Extract tools by name
    postFinding = tools.find(t => t.name === 'post_finding');
    postChallenge = tools.find(t => t.name === 'post_challenge');
    resolveDebate = tools.find(t => t.name === 'resolve_debate');
    getUnresolvedDebates = tools.find(t => t.name === 'get_unresolved_debates');
  });

  describe('Post Findings', () => {
    it('should assign sequential IDs', async () => {
      const result1 = await postFinding.handler({
        agent_role: 'design-reviewer',
        finding_type: 'score',
        content: 'Test',
        severity: 'GREEN',
        evidence: ['quote'],
      });

      const result2 = await postFinding.handler({
        agent_role: 'ethics-auditor',
        finding_type: 'dark-pattern',
        content: 'Test 2',
        severity: 'RED',
        evidence: ['quote'],
      });

      expect(result1.content[0].text).toContain('F-001');
      expect(result2.content[0].text).toContain('F-002');
      expect(session.debate.findings).toHaveLength(2);
      expect(session.debate.findings[0].id).toBe('F-001');
      expect(session.debate.findings[1].id).toBe('F-002');
    });

    it('should default confidence to 0.8', async () => {
      await postFinding.handler({
        agent_role: 'design-reviewer',
        finding_type: 'score',
        content: 'Test',
        severity: 'GREEN',
        evidence: [],
      });

      expect(session.debate.findings[0].confidence).toBe(0.8);
    });

    it('should allow custom confidence scores', async () => {
      await postFinding.handler({
        agent_role: 'design-reviewer',
        finding_type: 'score',
        content: 'Test',
        severity: 'GREEN',
        evidence: [],
        confidence: 0.95,
      });

      expect(session.debate.findings[0].confidence).toBe(0.95);
    });

    it('should start findings as unresolved', async () => {
      await postFinding.handler({
        agent_role: 'design-reviewer',
        finding_type: 'score',
        content: 'Test',
        severity: 'RED',
        evidence: [],
      });

      expect(session.debate.findings[0].resolved).toBe(false);
    });
  });

  describe('Post Challenges', () => {
    it('should reference the target finding', async () => {
      await postFinding.handler({
        agent_role: 'design-reviewer',
        finding_type: 'score',
        content: 'Ethics looks GREEN',
        severity: 'GREEN',
        evidence: ['Section 3'],
      });

      const result = await postChallenge.handler({
        challenger_role: 'ethics-auditor',
        target_finding_id: 'F-001',
        challenge_text: 'Dark pattern detected in Section 3',
        evidence: ['Quote from section 3'],
      });

      expect(result.content[0].text).toContain('C-001');
      expect(result.content[0].text).toContain('F-001');
      expect(session.debate.challenges).toHaveLength(1);
      expect(session.debate.challenges[0].targetFindingId).toBe('F-001');
    });

    it('should return error for invalid finding ID', async () => {
      const result = await postChallenge.handler({
        challenger_role: 'ethics-auditor',
        target_finding_id: 'F-999',
        challenge_text: 'This does not exist',
        evidence: [],
      });

      expect(result.content[0].text).toContain('Error');
      expect(result.content[0].text).toContain('F-999');
      expect(session.debate.challenges).toHaveLength(0);
    });
  });

  describe('Debate Resolution', () => {
    it('should create resolution records with IDs', async () => {
      await postFinding.handler({
        agent_role: 'design-reviewer',
        finding_type: 'score',
        content: 'Test',
        severity: 'GREEN',
        evidence: [],
      });

      const result = await resolveDebate.handler({
        debate_topic: 'Ethics scoring disagreement',
        finding_ids: ['F-001'],
        resolution: 'Design reviewer was correct',
        winning_position: 'GREEN classification maintained',
        evidence_weight: 'Section 3 does not constitute a dark pattern',
        confidence: 0.85,
        escalation_needed: false,
        resolved_by: 'orchestrator',
      });

      expect(result.content[0].text).toContain('DR-001');
      expect(result.content[0].text).toContain('85%');
      expect(session.debate.resolutions).toHaveLength(1);
      expect(session.debate.resolutions[0].id).toBe('DR-001');
      expect(session.debate.resolutions[0].confidence).toBe(0.85);
    });

    it('should mark related findings as resolved', async () => {
      await postFinding.handler({
        agent_role: 'design-reviewer',
        finding_type: 'score',
        content: 'Test',
        severity: 'RED',
        evidence: [],
      });

      expect(session.debate.findings[0].resolved).toBe(false);

      await resolveDebate.handler({
        debate_topic: 'Test resolution',
        finding_ids: ['F-001'],
        resolution: 'Resolved',
        winning_position: 'Position A',
        evidence_weight: 'Strong evidence',
        confidence: 0.9,
        escalation_needed: false,
        resolved_by: 'orchestrator',
      });

      expect(session.debate.findings[0].resolved).toBe(true);
    });

    it('should flag escalation when needed', async () => {
      await postFinding.handler({
        agent_role: 'ethics-auditor',
        finding_type: 'dark-pattern',
        content: 'Unclear pattern',
        severity: 'RED',
        evidence: [],
      });

      const result = await resolveDebate.handler({
        debate_topic: 'Ambiguous dark pattern',
        finding_ids: ['F-001'],
        resolution: 'Uncertain — needs human review',
        winning_position: 'Neither position is clear',
        evidence_weight: 'Insufficient evidence either way',
        confidence: 0.45,
        escalation_needed: true,
        resolved_by: 'orchestrator',
      });

      expect(result.content[0].text).toContain('ESCALATION');
      expect(session.debate.resolutions[0].escalationNeeded).toBe(true);
    });
  });

  describe('Unresolved Debates', () => {
    it('should report no unresolved items when board is empty', async () => {
      const result = await getUnresolvedDebates.handler({});

      expect(result.content[0].text).toContain('All debates have been formally resolved');
    });

    it('should track unresolved RED findings', async () => {
      await postFinding.handler({
        agent_role: 'ethics-auditor',
        finding_type: 'dark-pattern',
        content: 'Manipulative modal',
        severity: 'RED',
        evidence: [],
      });

      const result = await getUnresolvedDebates.handler({});

      expect(result.content[0].text).toContain('RED FINDING UNRESOLVED');
      expect(result.content[0].text).toContain('F-001');
      expect(result.content[0].text).toContain('Unresolved Debates (1)');
    });

    it('should clear unresolved after formal resolution', async () => {
      await postFinding.handler({
        agent_role: 'ethics-auditor',
        finding_type: 'dark-pattern',
        content: 'Manipulative modal',
        severity: 'RED',
        evidence: [],
      });

      await resolveDebate.handler({
        debate_topic: 'Manipulative modal',
        finding_ids: ['F-001'],
        resolution: 'Confirmed dark pattern',
        winning_position: 'Remove modal',
        evidence_weight: 'Clear FTC violation',
        confidence: 0.95,
        escalation_needed: false,
        resolved_by: 'orchestrator',
      });

      const result = await getUnresolvedDebates.handler({});

      expect(result.content[0].text).toContain('All debates have been formally resolved');
    });

    it('should track pending challenges', async () => {
      await postFinding.handler({
        agent_role: 'design-reviewer',
        finding_type: 'score',
        content: 'All clear',
        severity: 'GREEN',
        evidence: [],
      });

      await postChallenge.handler({
        challenger_role: 'ethics-auditor',
        target_finding_id: 'F-001',
        challenge_text: 'I disagree',
        evidence: [],
      });

      const result = await getUnresolvedDebates.handler({});

      expect(result.content[0].text).toContain('PENDING CHALLENGE');
      expect(result.content[0].text).toContain('C-001');
      expect(result.content[0].text).toContain('Unresolved Debates (1)');
    });
  });

  describe('Audit Debate Coherence', () => {
    let auditDebateCoherence: any;
    let postResponse: any;

    beforeEach(() => {
      auditDebateCoherence = tools.find(t => t.name === 'audit_debate_coherence');
      postResponse = tools.find(t => t.name === 'post_response');
    });

    it('should pass with no findings or resolutions', async () => {
      const result = await auditDebateCoherence.handler({});
      const text = result.content[0].text;
      expect(text).toContain('PASSED');
      expect(text).toContain('**Issues**: 0');
    });

    it('should pass when all findings are properly resolved', async () => {
      await postFinding.handler({
        agent_role: 'contract-reviewer',
        finding_type: 'contract-risk',
        content: 'Liability cap too low',
        severity: 'RED',
        evidence: ['Clause 7.3'],
        confidence: 0.9,
      });

      await resolveDebate.handler({
        debate_topic: 'Liability cap',
        finding_ids: ['F-001'],
        resolution: 'Negotiate higher cap',
        winning_position: 'Raise to 2x annual fees',
        evidence_weight: 'Market standard analysis',
        confidence: 0.85,
        escalation_needed: false,
        resolved_by: 'orchestrator',
      });

      const result = await auditDebateCoherence.handler({});
      const text = result.content[0].text;
      expect(text).toContain('PASSED');
      expect(text).toContain('RED coverage: 1/1');
    });

    it('should flag coverage gap for unresolved RED finding', async () => {
      await postFinding.handler({
        agent_role: 'contract-reviewer',
        finding_type: 'contract-risk',
        content: 'Missing indemnification clause',
        severity: 'RED',
        evidence: ['No indemnification section found'],
        confidence: 0.95,
      });

      // No resolution created

      const result = await auditDebateCoherence.handler({});
      const text = result.content[0].text;
      expect(text).toContain('FAILED');
      expect(text).toContain('coverage_gap');
      expect(text).toContain('F-001');
      expect(text).toContain('RED coverage: 0/1');
    });

    it('should flag confidence inversion when resolution is much weaker', async () => {
      await postFinding.handler({
        agent_role: 'contract-reviewer',
        finding_type: 'contract-risk',
        content: 'Unlimited liability exposure',
        severity: 'RED',
        evidence: ['Clause 12'],
        confidence: 0.9,
      });

      await resolveDebate.handler({
        debate_topic: 'Liability exposure',
        finding_ids: ['F-001'],
        resolution: 'Probably fine',
        winning_position: 'Accept as-is',
        evidence_weight: 'Gut feeling',
        confidence: 0.5,
        escalation_needed: false,
        resolved_by: 'orchestrator',
      });

      const result = await auditDebateCoherence.handler({});
      const text = result.content[0].text;
      expect(text).toContain('confidence_inversion');
      expect(text).toContain('DR-001');
      expect(text).toContain('50%');
      expect(text).toContain('90%');
    });

    it('should flag topic overlap when same finding in multiple resolutions', async () => {
      await postFinding.handler({
        agent_role: 'contract-reviewer',
        finding_type: 'contract-risk',
        content: 'Ambiguous termination clause',
        severity: 'YELLOW',
        evidence: ['Clause 15'],
      });

      await resolveDebate.handler({
        debate_topic: 'Termination rights',
        finding_ids: ['F-001'],
        resolution: 'Keep termination as-is',
        winning_position: 'Acceptable risk',
        evidence_weight: 'Standard language',
        confidence: 0.8,
        escalation_needed: false,
        resolved_by: 'orchestrator',
      });

      await resolveDebate.handler({
        debate_topic: 'Exit provisions',
        finding_ids: ['F-001'],
        resolution: 'Renegotiate termination',
        winning_position: 'Need clearer exit',
        evidence_weight: 'Client priority',
        confidence: 0.7,
        escalation_needed: false,
        resolved_by: 'orchestrator',
      });

      const result = await auditDebateCoherence.handler({});
      const text = result.content[0].text;
      expect(text).toContain('FAILED');
      expect(text).toContain('topic_overlap');
      expect(text).toContain('F-001');
      expect(text).toContain('DR-001');
      expect(text).toContain('DR-002');
    });

    it('should flag ignored challenge on resolved finding', async () => {
      await postFinding.handler({
        agent_role: 'contract-reviewer',
        finding_type: 'contract-standard',
        content: 'Standard boilerplate',
        severity: 'GREEN',
        evidence: ['Standard terms'],
        confidence: 0.8,
      });

      // Challenge posted but never responded to
      await postChallenge.handler({
        challenger_role: 'red-team',
        target_finding_id: 'F-001',
        challenge_text: 'This boilerplate has a hidden trap',
        evidence: ['Clause 3.2 contradicts Clause 8.1'],
      });

      // Finding resolved without addressing the challenge
      await resolveDebate.handler({
        debate_topic: 'Boilerplate review',
        finding_ids: ['F-001'],
        resolution: 'Standard boilerplate confirmed',
        winning_position: 'No issues',
        evidence_weight: 'Common language',
        confidence: 0.8,
        escalation_needed: false,
        resolved_by: 'orchestrator',
      });

      const result = await auditDebateCoherence.handler({});
      const text = result.content[0].text;
      expect(text).toContain('ignored_challenge');
      expect(text).toContain('C-001');
      expect(text).toContain('F-001');
    });

    it('should not flag ignored challenge when response was posted', async () => {
      await postFinding.handler({
        agent_role: 'contract-reviewer',
        finding_type: 'contract-standard',
        content: 'Standard boilerplate',
        severity: 'GREEN',
        evidence: ['Standard terms'],
        confidence: 0.8,
      });

      await postChallenge.handler({
        challenger_role: 'red-team',
        target_finding_id: 'F-001',
        challenge_text: 'Hidden trap',
        evidence: ['Clause 3.2'],
      });

      await postResponse.handler({
        responder_role: 'contract-reviewer',
        challenge_id: 'C-001',
        response_text: 'No trap — clauses are consistent',
        accepted: false,
      });

      await resolveDebate.handler({
        debate_topic: 'Boilerplate review',
        finding_ids: ['F-001'],
        resolution: 'Standard boilerplate confirmed',
        winning_position: 'No issues',
        evidence_weight: 'Common language',
        confidence: 0.8,
        escalation_needed: false,
        resolved_by: 'orchestrator',
      });

      const result = await auditDebateCoherence.handler({});
      const text = result.content[0].text;
      expect(text).toContain('PASSED');
      expect(text).not.toContain('ignored_challenge');
    });

    it('should treat YELLOW orphans as issues but GREEN orphans as acceptable', async () => {
      await postFinding.handler({
        agent_role: 'contract-reviewer',
        finding_type: 'contract-risk',
        content: 'Minor ambiguity',
        severity: 'YELLOW',
        evidence: ['Clause 4'],
      });

      await postFinding.handler({
        agent_role: 'contract-reviewer',
        finding_type: 'contract-standard',
        content: 'Normal clause',
        severity: 'GREEN',
        evidence: ['Clause 5'],
      });

      // Neither resolved
      const result = await auditDebateCoherence.handler({});
      const text = result.content[0].text;
      expect(text).toContain('orphan_finding');
      expect(text).toContain('F-001'); // YELLOW orphan flagged
      expect(text).not.toContain('F-002'); // GREEN orphan not flagged
    });
  });

  describe('Finding Content Sanitization', () => {
    it('should strip process-text preamble from finding content', async () => {
      await postFinding.handler({
        agent_role: 'contract-analyst',
        finding_type: 'risk',
        content: "Let me analyze this carefully. The liability cap of $100K is below industry standard.",
        severity: 'YELLOW',
        evidence: ['Section 3.2: "total liability shall not exceed $100,000"'],
      });

      const finding = session.debate.findings[0];
      expect(finding.content).toBe('The liability cap of $100K is below industry standard.');
      expect(finding.content).not.toContain('Let me analyze');
    });

    it('should keep content unchanged when no process preamble', async () => {
      await postFinding.handler({
        agent_role: 'contract-analyst',
        finding_type: 'risk',
        content: 'The indemnification clause lacks a mutual obligation, creating asymmetric risk.',
        severity: 'RED',
        evidence: ['Section 5'],
      });

      const finding = session.debate.findings[0];
      expect(finding.content).toBe('The indemnification clause lacks a mutual obligation, creating asymmetric risk.');
    });

    it('should keep single-sentence content even if it matches a process pattern', async () => {
      await postFinding.handler({
        agent_role: 'contract-analyst',
        finding_type: 'risk',
        content: "I'll note that the termination clause is missing a cure period.",
        severity: 'YELLOW',
        evidence: ['Section 8'],
      });

      const finding = session.debate.findings[0];
      // Single sentence — kept as-is (better than returning empty)
      expect(finding.content).toBe("I'll note that the termination clause is missing a cure period.");
    });
  });
});
