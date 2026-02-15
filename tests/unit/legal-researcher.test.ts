/**
 * Unit tests for the Legal Research Agent (v6).
 *
 * Tests: Agent definition, output schema, debate finding types.
 */

import { describe, it, expect } from 'vitest';
import { agentDefinitions } from '../../src/agents/definitions.js';
import { LegalResearchOutputSchema } from '../../src/types/output-schemas.js';

describe('Legal Research Agent', () => {
  describe('Agent Definition', () => {
    it('should exist in agent definitions', () => {
      expect(agentDefinitions['legal-researcher']).toBeDefined();
    });

    it('should use Opus model', () => {
      expect(agentDefinitions['legal-researcher'].model).toBe('opus');
    });

    it('should have maxTurns of 10', () => {
      expect(agentDefinitions['legal-researcher'].maxTurns).toBe(10);
    });

    it('should have read-only tools', () => {
      const tools = agentDefinitions['legal-researcher'].tools;
      expect(tools).toContain('Read');
      expect(tools).toContain('Grep');
      expect(tools).toContain('Glob');
    });

    it('should have debate board tools', () => {
      const tools = agentDefinitions['legal-researcher'].tools;
      expect(tools).toContain('mcp__shem__post_finding');
      expect(tools).toContain('mcp__shem__get_findings');
    });

    it('should have memory read AND write tools (saves precedents)', () => {
      const tools = agentDefinitions['legal-researcher'].tools;
      expect(tools).toContain('mcp__shem__query_precedents');
      expect(tools).toContain('mcp__shem__save_precedent');
      expect(tools).toContain('mcp__shem__add_institutional_memory');
    });

    it('should have an output format defined', () => {
      expect(agentDefinitions['legal-researcher'].outputFormat).toBeDefined();
    });

    it('should have a non-empty prompt', () => {
      expect(agentDefinitions['legal-researcher'].prompt.length).toBeGreaterThan(100);
    });
  });

  describe('Output Schema', () => {
    it('should validate a valid research memo', () => {
      const validMemo = {
        agentRole: 'legal-researcher',
        researchQuestion: 'Are non-compete clauses enforceable in California?',
        jurisdictions: ['US-CA'],
        thesis: 'Non-compete clauses are generally unenforceable in California under Business and Professions Code Section 16600.',
        confidenceLevel: 'high',
        supportingAuthorities: [{
          source: 'California Business and Professions Code § 16600',
          citation: 'Cal. Bus. & Prof. Code § 16600',
          relevance: 'Directly prohibits non-compete agreements in employment',
          strength: 5,
        }],
        opposingAuthorities: [{
          source: 'Edwards v. Arthur Andersen LLP (2008)',
          citation: '44 Cal. 4th 937',
          relevance: 'Narrow exception for sale-of-business context',
          strength: 3,
        }],
        unresolvedQuestions: ['Application to independent contractor relationships'],
        practicalImplications: 'Client should not rely on non-compete clauses for California-based employees.',
        findings: [{
          id: 'f-1',
          type: 'research-citation',
          content: 'Section 16600 provides clear statutory basis',
          severity: 'GREEN',
          evidence: ['Cal. Bus. & Prof. Code § 16600'],
          confidence: 0.95,
        }],
        confidence: 0.92,
        summary: 'Non-competes are unenforceable in California with narrow exceptions.',
      };

      const result = LegalResearchOutputSchema.safeParse(validMemo);
      expect(result.success).toBe(true);
    });

    it('should reject invalid confidence level', () => {
      const invalidMemo = {
        agentRole: 'legal-researcher',
        researchQuestion: 'Test question',
        jurisdictions: ['US'],
        thesis: 'Test thesis',
        confidenceLevel: 'very_high', // Invalid
        supportingAuthorities: [],
        opposingAuthorities: [],
        unresolvedQuestions: [],
        practicalImplications: 'Test',
        findings: [],
        confidence: 0.5,
        summary: 'Test',
      };

      const result = LegalResearchOutputSchema.safeParse(invalidMemo);
      expect(result.success).toBe(false);
    });

    it('should validate authority strength range (1-5)', () => {
      const memo = {
        agentRole: 'legal-researcher',
        researchQuestion: 'Test',
        jurisdictions: ['US'],
        thesis: 'Test',
        confidenceLevel: 'medium',
        supportingAuthorities: [{
          source: 'Test Case',
          citation: '123 F.3d 456',
          relevance: 'Test',
          strength: 6, // Invalid — max is 5
        }],
        opposingAuthorities: [],
        unresolvedQuestions: [],
        practicalImplications: 'Test',
        findings: [],
        confidence: 0.5,
        summary: 'Test',
      };

      const result = LegalResearchOutputSchema.safeParse(memo);
      expect(result.success).toBe(false);
    });
  });
});
