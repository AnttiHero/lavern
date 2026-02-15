/**
 * Unit tests for the Red Team / Adversarial Testing Agent (v6).
 *
 * Tests: Agent definition, output schema, debate finding types.
 */

import { describe, it, expect } from 'vitest';
import { agentDefinitions } from '../../src/agents/definitions.js';
import { RedTeamOutputSchema } from '../../src/types/output-schemas.js';

describe('Red Team Agent', () => {
  describe('Agent Definition', () => {
    it('should exist in agent definitions', () => {
      expect(agentDefinitions['red-team']).toBeDefined();
    });

    it('should use Opus model (needs strong reasoning)', () => {
      expect(agentDefinitions['red-team'].model).toBe('opus');
    });

    it('should have maxTurns of 8', () => {
      expect(agentDefinitions['red-team'].maxTurns).toBe(8);
    });

    it('should have read-only tools', () => {
      const tools = agentDefinitions['red-team'].tools;
      expect(tools).toContain('Read');
      expect(tools).toContain('Grep');
      expect(tools).toContain('Glob');
    });

    it('should have debate board tools (posts adversarial findings)', () => {
      const tools = agentDefinitions['red-team'].tools;
      expect(tools).toContain('mcp__shem__post_finding');
      expect(tools).toContain('mcp__shem__get_findings');
    });

    it('should have memory read tools', () => {
      const tools = agentDefinitions['red-team'].tools;
      expect(tools).toContain('mcp__shem__query_precedents');
    });

    it('should NOT have memory write tools (reads only)', () => {
      const tools = agentDefinitions['red-team'].tools;
      expect(tools).not.toContain('mcp__shem__save_precedent');
    });

    it('should have an output format defined', () => {
      expect(agentDefinitions['red-team'].outputFormat).toBeDefined();
    });
  });

  describe('Output Schema', () => {
    it('should validate a valid vulnerability report', () => {
      const validReport = {
        agentRole: 'red-team',
        overallAssessment: 'CONCERNS',
        vulnerabilities: [{
          severity: 'HIGH',
          description: 'Indemnification clause is unilateral',
          exploitation: 'Counterparty has no obligation to indemnify for their own breach',
          recommendedFix: 'Add mutual indemnification language',
          evidence: ['Clause 8.1', 'Compare with Clause 8.2'],
        }],
        edgeCases: [{
          scenario: 'Counterparty assigns contract to a shell company',
          risk: 'Client loses enforcement rights against original counterparty',
          likelihood: 'medium',
          impact: 'Full contract value at risk',
        }],
        ambiguities: [{
          clause: 'Force majeure clause uses "including but not limited to"',
          interpretation1: 'Expansive — covers any unforeseen event',
          interpretation2: 'Restrictive — limited to events similar to those listed',
          recommendation: 'Replace with exhaustive list of covered events',
        }],
        strengthsNoted: ['Clear termination provisions', 'Well-defined payment terms'],
        findings: [{
          id: 'f-1',
          type: 'adversarial-vulnerability',
          content: 'Unilateral indemnification',
          severity: 'RED',
          evidence: ['Clause 8.1'],
          confidence: 0.9,
        }],
        confidence: 0.85,
        summary: 'Two significant vulnerabilities and one ambiguity found.',
      };

      const result = RedTeamOutputSchema.safeParse(validReport);
      expect(result.success).toBe(true);
    });

    it('should validate a clean PASS report', () => {
      const cleanReport = {
        agentRole: 'red-team',
        overallAssessment: 'PASS',
        vulnerabilities: [],
        edgeCases: [],
        ambiguities: [],
        strengthsNoted: ['Well-drafted mutual protections', 'Clear definitions'],
        findings: [],
        confidence: 0.75,
        summary: 'No significant vulnerabilities found.',
      };

      const result = RedTeamOutputSchema.safeParse(cleanReport);
      expect(result.success).toBe(true);
    });

    it('should reject invalid overall assessment', () => {
      const invalid = {
        agentRole: 'red-team',
        overallAssessment: 'MAYBE', // Invalid
        vulnerabilities: [],
        edgeCases: [],
        ambiguities: [],
        strengthsNoted: [],
        findings: [],
        confidence: 0.5,
        summary: 'Test',
      };

      const result = RedTeamOutputSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should reject invalid vulnerability severity', () => {
      const invalid = {
        agentRole: 'red-team',
        overallAssessment: 'CONCERNS',
        vulnerabilities: [{
          severity: 'EXTREME', // Invalid
          description: 'Test',
          exploitation: 'Test',
          recommendedFix: 'Test',
          evidence: [],
        }],
        edgeCases: [],
        ambiguities: [],
        strengthsNoted: [],
        findings: [],
        confidence: 0.5,
        summary: 'Test',
      };

      const result = RedTeamOutputSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });
});
