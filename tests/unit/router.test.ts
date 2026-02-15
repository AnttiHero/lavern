/**
 * Unit tests for the Router — deterministic classification + LLM fallback.
 *
 * Consolidated from router.test.ts, router-llm.test.ts, and routing-v6.test.ts.
 *
 * Tests: All 7 request type classifications, consistency checks,
 * routeRequest event emission, schema validation, router prompt content.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SessionState } from '../../src/session/session-state.js';
import { routeRequest, classifyRequest, getRouterPromptWithContext } from '../../src/router/router.js';
import { RouterClassificationSchema } from '../../src/router/router-schema.js';
import type { LegalRequest } from '../../src/types/index.js';

// Ensure all workflows are registered
import '../../src/workflows/index.js';

describe('Router', () => {
  let session: SessionState;

  beforeEach(() => {
    session = new SessionState('test-router');
  });

  // ── classifyRequest: Deterministic Classification ─────────────────

  describe('classifyRequest', () => {
    it('should classify document_redesign as full_pipeline/legal-design', () => {
      const result = classifyRequest({ type: 'document_redesign', documentPath: '/path/to/tos.pdf' });
      expect(result.requestType).toBe('full_pipeline');
      expect(result.selectedWorkflow).toBe('legal-design');
      expect(result.complexity).toBe('high');
      expect(result.requiresDebate).toBe(true);
      expect(result.requiresEthicsFirst).toBe(true);
    });

    it('should include all 8 legal-design specialists for document_redesign', () => {
      const result = classifyRequest({ type: 'document_redesign', documentPath: '/doc.pdf' });
      expect(result.selectedSpecialists).toHaveLength(8);
      expect(result.selectedSpecialists).toContain('design-reviewer');
      expect(result.selectedSpecialists).toContain('ethics-auditor');
      expect(result.selectedSpecialists).toContain('transformation-specialist');
      expect(result.selectedSpecialists).toContain('synthesis-editor');
    });

    it('should classify contract_review as single_specialist/contract-review', () => {
      const result = classifyRequest({ type: 'contract_review', documentPath: '/contract.pdf' });
      expect(result.requestType).toBe('single_specialist');
      expect(result.selectedWorkflow).toBe('contract-review');
      expect(result.complexity).toBe('medium');
      expect(result.selectedSpecialists).toContain('contract-reviewer');
      expect(result.selectedSpecialists).toContain('evaluator');
    });

    it('should classify legal_question as direct_answer/simple-query', () => {
      const result = classifyRequest({ type: 'legal_question', requestText: 'What is force majeure?' });
      expect(result.requestType).toBe('direct_answer');
      expect(result.selectedWorkflow).toBe('simple-query');
      expect(result.complexity).toBe('low');
      expect(result.selectedSpecialists).toContain('evaluator');
    });

    it('should classify legal_research as single_specialist/research-memo', () => {
      const result = classifyRequest({
        type: 'legal_research',
        requestText: 'Research the enforceability of non-compete clauses in California',
      });
      expect(result.requestType).toBe('single_specialist');
      expect(result.selectedWorkflow).toBe('research-memo');
      expect(result.complexity).toBe('medium');
      expect(result.riskLevel).toBe('medium');
      expect(result.selectedSpecialists).toContain('legal-researcher');
      expect(result.selectedSpecialists).toContain('evaluator');
      expect(result.selectedSpecialists).toContain('red-team');
      expect(result.requiresDebate).toBe(false);
      expect(result.requiresEthicsFirst).toBe(false);
    });

    it('should classify risk_assessment as single_specialist/simple-query with risk-pricer', () => {
      const result = classifyRequest({
        type: 'risk_assessment',
        requestText: 'Assess the risk of this contract review deliverable',
      });
      expect(result.requestType).toBe('single_specialist');
      expect(result.selectedWorkflow).toBe('simple-query');
      expect(result.complexity).toBe('low');
      expect(result.selectedSpecialists).toContain('risk-pricer');
      expect(result.selectedSpecialists).toContain('evaluator');
    });

    it('should classify general with document as contract-review', () => {
      const result = classifyRequest({ type: 'general', documentPath: '/doc.pdf' });
      expect(result.selectedWorkflow).toBe('contract-review');
    });

    it('should classify general without document as simple-query', () => {
      const result = classifyRequest({ type: 'general', requestText: 'Help me' });
      expect(result.selectedWorkflow).toBe('simple-query');
    });
  });

  // ── Consistency Check ─────────────────────────────────────────────

  describe('Consistency Check', () => {
    it('should set requiresConsistencyCheck when matterId is present', () => {
      const result = classifyRequest({
        type: 'contract_review',
        documentPath: '/contract.pdf',
        matterId: 'matter-2024-001',
      });
      expect(result.requiresConsistencyCheck).toBe(true);
    });

    it('should not set requiresConsistencyCheck when no matterId', () => {
      const result = classifyRequest({ type: 'contract_review', documentPath: '/contract.pdf' });
      expect(result.requiresConsistencyCheck).toBe(false);
    });

    it('should set requiresConsistencyCheck for legal_research with matterId', () => {
      const result = classifyRequest({
        type: 'legal_research',
        requestText: 'Research non-compete enforceability',
        matterId: 'matter-2024-100',
      });
      expect(result.requiresConsistencyCheck).toBe(true);
    });
  });

  // ── routeRequest (deterministic) ──────────────────────────────────

  describe('routeRequest (deterministic)', () => {
    it('should emit routing_decision event', async () => {
      const request: LegalRequest = { type: 'legal_question', requestText: 'What is GDPR?' };
      const events: any[] = [];
      session.events.on('routing_decision', (e: any) => events.push(e));

      await routeRequest(request, session, { useLlm: false });

      expect(events).toHaveLength(1);
      expect(events[0].requestType).toBe('direct_answer');
      expect(events[0].selectedWorkflow).toBe('simple-query');
      expect(events[0].reasoning).toBeTruthy();
      expect(events[0].reasoning).toContain('[deterministic]');
    });

    it('should set routerClassification on the request', async () => {
      const request: LegalRequest = { type: 'contract_review', documentPath: '/contract.pdf' };
      await routeRequest(request, session, { useLlm: false });
      expect(request.routerClassification).toBeDefined();
      expect(request.routerClassification!.selectedWorkflow).toBe('contract-review');
    });

    it('should return a valid RouterClassification', async () => {
      const request: LegalRequest = { type: 'document_redesign', documentPath: '/tos.pdf' };
      const result = await routeRequest(request, session, { useLlm: false });
      const validation = RouterClassificationSchema.safeParse(result);
      expect(validation.success).toBe(true);
    });

    it('should emit routing_decision for v6 request types', async () => {
      for (const request of [
        { type: 'legal_research' as const, requestText: 'Research something' },
        { type: 'risk_assessment' as const, requestText: 'Assess risk' },
      ]) {
        const testSession = new SessionState(`test-${request.type}`);
        const events: any[] = [];
        testSession.events.on('routing_decision', (e: any) => events.push(e));

        await routeRequest(request, testSession, { useLlm: false });

        expect(events).toHaveLength(1);
        expect(events[0].selectedWorkflow).toBeTruthy();
        expect(events[0].reasoning).toContain('[deterministic]');
      }
    });

    it('should route legal_research to research-memo', async () => {
      const request: LegalRequest = { type: 'legal_research', requestText: 'Research something' };
      await routeRequest(request, session, { useLlm: false });
      expect(request.routerClassification!.selectedWorkflow).toBe('research-memo');
    });

    it('should route risk_assessment to simple-query with risk-pricer', async () => {
      const request: LegalRequest = { type: 'risk_assessment', requestText: 'Assess risk' };
      await routeRequest(request, session, { useLlm: false });
      expect(request.routerClassification!.selectedWorkflow).toBe('simple-query');
      expect(request.routerClassification!.selectedSpecialists).toContain('risk-pricer');
    });
  });

  // ── Schema Validation ─────────────────────────────────────────────

  describe('Schema Validation', () => {
    it('should validate correct data', () => {
      const validData = {
        requestType: 'full_pipeline',
        complexity: 'high',
        riskLevel: 'medium',
        selectedWorkflow: 'legal-design',
        selectedSpecialists: ['design-reviewer', 'ethics-auditor'],
        requiresDebate: true,
        requiresEthicsFirst: true,
        requiresConsistencyCheck: false,
        reasoning: 'Document redesign requires full pipeline.',
      };
      expect(RouterClassificationSchema.safeParse(validData).success).toBe(true);
    });

    it('should reject invalid requestType', () => {
      const invalidData = {
        requestType: 'invalid_type',
        complexity: 'high',
        riskLevel: 'medium',
        selectedWorkflow: 'legal-design',
        selectedSpecialists: [],
        requiresDebate: false,
        requiresEthicsFirst: false,
        requiresConsistencyCheck: false,
        reasoning: 'Test',
      };
      expect(RouterClassificationSchema.safeParse(invalidData).success).toBe(false);
    });

    const allRequestTypes: LegalRequest[] = [
      { type: 'document_redesign', documentPath: '/doc.pdf' },
      { type: 'contract_review', documentPath: '/contract.pdf' },
      { type: 'legal_question', requestText: 'What is force majeure?' },
      { type: 'legal_research', requestText: 'Research non-compete enforceability in California' },
      { type: 'risk_assessment', requestText: 'Assess risk of this contract review' },
      { type: 'general', documentPath: '/other.pdf' },
      { type: 'general', requestText: 'Help me' },
    ];

    allRequestTypes.forEach((request) => {
      it(`should produce valid classification for ${request.type} (${request.documentPath ? 'with doc' : 'no doc'})`, () => {
        const result = classifyRequest(request);
        const validation = RouterClassificationSchema.safeParse(result);
        expect(validation.success).toBe(true);
      });
    });
  });

  // ── Router Prompt ─────────────────────────────────────────────────

  describe('Router Prompt', () => {
    it('should include workflow summaries and decision matrix', () => {
      const prompt = getRouterPromptWithContext();
      expect(prompt).toContain('Available Workflows');
      expect(prompt).toContain('Decision Matrix');
      expect(prompt).toContain('MINIMUM VIABLE WORKFLOW');
    });

    it('should include all 4 workflow IDs', () => {
      const prompt = getRouterPromptWithContext();
      expect(prompt).toContain('legal-design');
      expect(prompt).toContain('simple-query');
      expect(prompt).toContain('contract-review');
      expect(prompt).toContain('research-memo');
    });

    it('should include v6 specialists', async () => {
      const { routerPrompt } = await import('../../src/router/router-prompt.js');
      expect(routerPrompt).toContain('legal-researcher');
      expect(routerPrompt).toContain('risk-pricer');
      expect(routerPrompt).toContain('red-team');
    });
  });
});
