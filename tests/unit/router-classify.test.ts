/**
 * Unit Tests — Router Deterministic Classification (src/router/router.ts)
 *
 * Tests the classifyRequest() function which provides the deterministic
 * fallback routing. This is the primary classifier during testing and
 * the safety net when LLM routing fails.
 */

import { describe, it, expect } from 'vitest';
import { classifyRequest } from '../../src/router/router.js';
import type { LegalRequest } from '../../src/types/index.js';

function makeRequest(overrides: Partial<LegalRequest> = {}): LegalRequest {
  return {
    type: 'general',
    ...overrides,
  };
}

describe('classifyRequest', () => {
  it('routes document_redesign to legal-design workflow', () => {
    const result = classifyRequest(makeRequest({ type: 'document_redesign' }));
    expect(result.selectedWorkflow).toBe('legal-design');
    expect(result.complexity).toBe('high');
    expect(result.requiresDebate).toBe(true);
    expect(result.requiresEthicsFirst).toBe(true);
  });

  it('routes contract_review to review workflow', () => {
    const result = classifyRequest(makeRequest({ type: 'contract_review' }));
    expect(result.selectedWorkflow).toBe('review');
    expect(result.selectedSpecialists).toContain('contract-reviewer');
    expect(result.selectedSpecialists).toContain('evaluator');
  });

  it('routes legal_research to adversarial workflow', () => {
    const result = classifyRequest(makeRequest({ type: 'legal_research' }));
    expect(result.selectedWorkflow).toBe('adversarial');
    expect(result.selectedSpecialists).toContain('legal-researcher');
    expect(result.selectedSpecialists).toContain('red-team');
  });

  it('routes risk_assessment to counsel workflow', () => {
    const result = classifyRequest(makeRequest({ type: 'risk_assessment' }));
    expect(result.selectedWorkflow).toBe('counsel');
    expect(result.selectedSpecialists).toContain('risk-pricer');
  });

  it('routes legal_question to counsel workflow', () => {
    const result = classifyRequest(makeRequest({ type: 'legal_question' }));
    expect(result.selectedWorkflow).toBe('counsel');
    expect(result.requestType).toBe('direct_answer');
    expect(result.complexity).toBe('low');
  });

  it('routes general with documentPath to review workflow', () => {
    const result = classifyRequest(makeRequest({ type: 'general', documentPath: '/path/to/doc.pdf' }));
    expect(result.selectedWorkflow).toBe('review');
  });

  it('routes general without documentPath to counsel workflow', () => {
    const result = classifyRequest(makeRequest({ type: 'general' }));
    expect(result.selectedWorkflow).toBe('counsel');
    expect(result.requestType).toBe('direct_answer');
  });

  it('enables consistency check when matterId is present', () => {
    const result = classifyRequest(makeRequest({ type: 'contract_review', matterId: 'M-001' }));
    expect(result.requiresConsistencyCheck).toBe(true);
  });

  it('disables consistency check when matterId is absent', () => {
    const result = classifyRequest(makeRequest({ type: 'contract_review' }));
    expect(result.requiresConsistencyCheck).toBe(false);
  });

  it('includes reasoning in all classifications', () => {
    const types: LegalRequest['type'][] = [
      'document_redesign', 'contract_review', 'legal_research',
      'risk_assessment', 'legal_question', 'general',
    ];
    for (const type of types) {
      const result = classifyRequest(makeRequest({ type }));
      expect(result.reasoning).toBeTruthy();
      expect(result.reasoning.length).toBeGreaterThan(10);
    }
  });

  it('always returns a valid riskLevel', () => {
    const types: LegalRequest['type'][] = [
      'document_redesign', 'contract_review', 'legal_research',
      'risk_assessment', 'legal_question', 'general',
    ];
    for (const type of types) {
      const result = classifyRequest(makeRequest({ type }));
      expect(['low', 'medium', 'high']).toContain(result.riskLevel);
    }
  });
});
