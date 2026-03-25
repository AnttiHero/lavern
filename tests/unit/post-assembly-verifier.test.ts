import { describe, it, expect } from 'vitest';
import { verifyAssemblyFidelity } from '../../src/assembly/post-assembly-verifier.js';
import type { SessionState } from '../../src/session/session-state.js';

function makeSession(overrides?: Partial<SessionState['debate']>): SessionState {
  return {
    debate: {
      findings: [],
      challenges: [],
      responses: [],
      resolutions: [],
      rounds: [],
      ...overrides,
    },
  } as unknown as SessionState;
}

describe('Post-Assembly Fidelity Verifier', () => {
  describe('RED finding representation', () => {
    it('passes when all RED findings are represented', () => {
      const session = makeSession({
        findings: [
          { id: 'F-001', severity: 'RED', content: 'The indemnification clause creates unlimited liability exposure for the client', evidence: [], confidence: 0.9, resolved: false, agentRole: 'contract-reviewer', findingType: 'contract-risk', timestamp: '' },
          { id: 'F-002', severity: 'YELLOW', content: 'Notice period is shorter than industry standard', evidence: [], confidence: 0.7, resolved: false, agentRole: 'contract-reviewer', findingType: 'contract-risk', timestamp: '' },
        ],
        resolutions: [],
      });

      const assembledText = `
## Risk Analysis
The indemnification clause in this agreement creates an unlimited liability exposure for the client.
This is a critical risk that requires immediate attention.
The notice period is also shorter than typical.
      `;

      const result = verifyAssemblyFidelity(assembledText, session);
      expect(result.passed).toBe(true);
      expect(result.mechanical.redFindingsTotal).toBe(1);
      expect(result.mechanical.redFindingsRepresented).toBe(1);
      expect(result.mechanical.redFindingsOmitted).toHaveLength(0);
    });

    it('fails when RED findings are omitted', () => {
      const session = makeSession({
        findings: [
          { id: 'F-001', severity: 'RED', content: 'The arbitration clause waives class action rights without adequate disclosure', evidence: [], confidence: 0.9, resolved: false, agentRole: 'contract-reviewer', findingType: 'contract-risk', timestamp: '' },
        ],
        resolutions: [],
      });

      const assembledText = `
## Summary
This agreement appears standard with no significant concerns.
      `;

      const result = verifyAssemblyFidelity(assembledText, session);
      expect(result.passed).toBe(false);
      expect(result.mechanical.redFindingsOmitted).toContain('F-001');
    });

    it('passes with no RED findings', () => {
      const session = makeSession({
        findings: [
          { id: 'F-001', severity: 'YELLOW', content: 'Minor issue', evidence: [], confidence: 0.6, resolved: false, agentRole: 'contract-reviewer', findingType: 'contract-risk', timestamp: '' },
        ],
        resolutions: [],
      });

      const result = verifyAssemblyFidelity('Any text here', session);
      expect(result.passed).toBe(true);
      expect(result.mechanical.redFindingsTotal).toBe(0);
    });

    it('handles multiple RED findings with mixed representation', () => {
      const session = makeSession({
        findings: [
          { id: 'F-001', severity: 'RED', content: 'Jurisdiction clause specifies unfavorable venue', evidence: [], confidence: 0.9, resolved: false, agentRole: 'contract-reviewer', findingType: 'contract-risk', timestamp: '' },
          { id: 'F-002', severity: 'RED', content: 'Intellectual property assignment is overly broad', evidence: [], confidence: 0.85, resolved: false, agentRole: 'contract-reviewer', findingType: 'contract-risk', timestamp: '' },
        ],
        resolutions: [],
      });

      const assembledText = `
## Critical Findings
The jurisdiction clause specifies an unfavorable venue that may disadvantage the client.
## Moderate Findings
Some standard provisions were noted.
      `;

      const result = verifyAssemblyFidelity(assembledText, session);
      expect(result.passed).toBe(false);
      expect(result.mechanical.redFindingsRepresented).toBe(1);
      expect(result.mechanical.redFindingsOmitted).toContain('F-002');
    });
  });

  describe('Resolution reflection', () => {
    it('detects represented resolutions', () => {
      const session = makeSession({
        findings: [],
        resolutions: [
          { id: 'R-001', debateTopic: 'liability cap', findingIds: ['F-001'], resolution: 'The liability cap of twelve months fees is below market standard', winningPosition: 'Contract reviewer position accepted', evidenceWeight: 'strong', confidence: 0.9, escalationNeeded: false, resolvedBy: 'orchestrator', timestamp: '' },
        ],
      });

      const assembledText = `
The liability cap of twelve months fees was debated. The contract reviewer position
was accepted as the cap is below market standard.
      `;

      const result = verifyAssemblyFidelity(assembledText, session);
      expect(result.mechanical.resolutionsRepresented).toBe(1);
      expect(result.mechanical.resolutionsMissing).toHaveLength(0);
    });

    it('detects missing resolutions', () => {
      const session = makeSession({
        findings: [],
        resolutions: [
          { id: 'R-001', debateTopic: 'indemnification', findingIds: ['F-001'], resolution: 'Mutual indemnification should replace one-sided obligation', winningPosition: 'Risk pricer recommendation', evidenceWeight: 'moderate', confidence: 0.75, escalationNeeded: false, resolvedBy: 'orchestrator', timestamp: '' },
        ],
      });

      const assembledText = 'This is a completely unrelated document about payment terms.';

      const result = verifyAssemblyFidelity(assembledText, session);
      expect(result.mechanical.resolutionsMissing).toContain('R-001');
    });
  });

  describe('Overall score', () => {
    it('returns 1.0 when everything is represented', () => {
      const session = makeSession({
        findings: [
          { id: 'F-001', severity: 'RED', content: 'Termination clause lacks cure period', evidence: [], confidence: 0.9, resolved: false, agentRole: 'contract-reviewer', findingType: 'contract-risk', timestamp: '' },
        ],
        resolutions: [
          { id: 'R-001', debateTopic: 'cure period', findingIds: ['F-001'], resolution: 'Add thirty day cure period before termination', winningPosition: 'Agreed', evidenceWeight: 'strong', confidence: 0.9, escalationNeeded: false, resolvedBy: 'orchestrator', timestamp: '' },
        ],
      });

      const assembledText = 'The termination clause lacks a cure period. We recommend adding a thirty day cure period before termination is effective.';

      const result = verifyAssemblyFidelity(assembledText, session);
      expect(result.overallScore).toBe(1.0);
      expect(result.passed).toBe(true);
    });

    it('returns 1.0 for empty debate state', () => {
      const session = makeSession({ findings: [], resolutions: [] });
      const result = verifyAssemblyFidelity('Any text', session);
      expect(result.overallScore).toBe(1.0);
      expect(result.passed).toBe(true);
    });

    it('returns partial score for mixed results', () => {
      const session = makeSession({
        findings: [
          { id: 'F-001', severity: 'RED', content: 'Governing law clause is ambiguous', evidence: [], confidence: 0.8, resolved: false, agentRole: 'contract-reviewer', findingType: 'contract-risk', timestamp: '' },
          { id: 'F-002', severity: 'RED', content: 'Insurance requirements are below industry standard', evidence: [], confidence: 0.7, resolved: false, agentRole: 'risk-pricer', findingType: 'contract-risk', timestamp: '' },
        ],
        resolutions: [],
      });

      const assembledText = 'The governing law clause is ambiguous and should be clarified.';

      const result = verifyAssemblyFidelity(assembledText, session);
      expect(result.overallScore).toBe(0.5);
      expect(result.passed).toBe(false);
    });
  });

  describe('Edge cases', () => {
    it('handles empty assembled text', () => {
      const session = makeSession({
        findings: [
          { id: 'F-001', severity: 'RED', content: 'Something important', evidence: [], confidence: 0.9, resolved: false, agentRole: 'contract-reviewer', findingType: 'contract-risk', timestamp: '' },
        ],
        resolutions: [],
      });

      const result = verifyAssemblyFidelity('', session);
      expect(result.passed).toBe(false);
    });

    it('YELLOW findings do not affect pass/fail', () => {
      const session = makeSession({
        findings: [
          { id: 'F-001', severity: 'YELLOW', content: 'Something totally unrelated to assembled text', evidence: [], confidence: 0.6, resolved: false, agentRole: 'contract-reviewer', findingType: 'contract-risk', timestamp: '' },
        ],
        resolutions: [],
      });

      const result = verifyAssemblyFidelity('Completely different content', session);
      expect(result.passed).toBe(true);
    });
  });
});
