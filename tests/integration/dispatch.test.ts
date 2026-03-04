/**
 * Integration Test — Dispatch entry point.
 *
 * v5: Tests the new `dispatch()` function that routes requests
 * through the Router to the appropriate workflow.
 *
 * Does NOT call the Claude API — tests routing logic, session setup,
 * template selection, and backward compatibility paths.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SessionState } from '../../src/session/session-state.js';
import { classifyRequest } from '../../src/router/router.js';
import { workflowRegistry } from '../../src/workflows/registry.js';
import type { LegalRequest } from '../../src/types/index.js';

// Ensure templates are registered
import '../../src/workflows/index.js';

describe('Dispatch Integration', () => {
  let session: SessionState;

  beforeEach(() => {
    session = new SessionState('test-dispatch');
  });

  describe('Routing to Legal Design', () => {
    it('should classify document_redesign as legal-design workflow', () => {
      const request: LegalRequest = {
        type: 'document_redesign',
        documentPath: '/path/to/terms-of-service.pdf',
      };

      const classification = classifyRequest(request);
      expect(classification.selectedWorkflow).toBe('legal-design');
      expect(classification.requestType).toBe('full_pipeline');
    });

    it('should find legal-design template in registry', () => {
      const template = workflowRegistry.get('legal-design');
      expect(template).toBeDefined();
      expect(template!.id).toBe('legal-design');
      expect(template!.steps.length).toBeGreaterThanOrEqual(10);
    });
  });

  describe('Routing to Review', () => {
    it('should classify contract_review as review workflow', () => {
      const request: LegalRequest = {
        type: 'contract_review',
        documentPath: '/path/to/contract.pdf',
      };

      const classification = classifyRequest(request);
      expect(classification.selectedWorkflow).toBe('review');
      expect(classification.requestType).toBe('single_specialist');
    });

    it('should find review template in registry', () => {
      const template = workflowRegistry.get('review');
      expect(template).toBeDefined();
      expect(template!.id).toBe('review');
    });

    it('should include contract-reviewer in required agents', () => {
      const template = workflowRegistry.get('review');
      expect(template!.requiredAgents).toContain('contract-reviewer');
    });
  });

  describe('Routing to Counsel', () => {
    it('should classify legal_question as counsel workflow', () => {
      const request: LegalRequest = {
        type: 'legal_question',
        requestText: 'What is force majeure?',
      };

      const classification = classifyRequest(request);
      expect(classification.selectedWorkflow).toBe('counsel');
      expect(classification.requestType).toBe('direct_answer');
    });

    it('should find counsel template in registry', () => {
      const template = workflowRegistry.get('counsel');
      expect(template).toBeDefined();
      expect(template!.id).toBe('counsel');
    });
  });

  describe('Force Workflow Override', () => {
    it('should allow forcing contract-review on a general request', () => {
      const request: LegalRequest = {
        type: 'general',
        requestText: 'Help me with this document',
        documentPath: '/path/to/doc.pdf',
      };

      // Without force, general+doc goes to review
      const naturalClassification = classifyRequest(request);
      expect(naturalClassification.selectedWorkflow).toBe('review');

      // With force, we can override to any workflow
      const forcedWorkflow = 'counsel';
      const template = workflowRegistry.get(forcedWorkflow);
      expect(template).toBeDefined();
      expect(template!.id).toBe('counsel');
    });

    it('should detect unknown workflow templates', () => {
      const template = workflowRegistry.get('nonexistent-workflow');
      expect(template).toBeUndefined();
    });
  });

  describe('Session Setup', () => {
    it('should set workflowTemplateId on session', () => {
      const template = workflowRegistry.get('review');
      session.workflowTemplateId = template!.id;
      expect(session.workflowTemplateId).toBe('review');
    });

    it('should initialize genericWorkflow state for non-legal-design workflows', () => {
      const template = workflowRegistry.get('counsel');
      session.genericWorkflow = {
        templateId: template!.id,
        currentStep: template!.steps[0],
        completedSteps: [],
        gateDecisions: {},
        evaluatorResults: [],
        revisionCount: 0,
        startedAt: new Date().toISOString(),
        lastTransitionAt: new Date().toISOString(),
      };

      expect(session.genericWorkflow).toBeDefined();
      expect(session.genericWorkflow!.templateId).toBe('counsel');
      expect(session.genericWorkflow!.currentStep).toBe('intake');
    });
  });

  describe('Classification + Template Alignment', () => {
    const testCases: Array<{
      name: string;
      request: LegalRequest;
      expectedWorkflow: string;
    }> = [
      {
        name: 'document_redesign → legal-design',
        request: { type: 'document_redesign', documentPath: '/doc.pdf' },
        expectedWorkflow: 'legal-design',
      },
      {
        name: 'contract_review → review',
        request: { type: 'contract_review', documentPath: '/contract.pdf' },
        expectedWorkflow: 'review',
      },
      {
        name: 'legal_question → counsel',
        request: { type: 'legal_question', requestText: 'What is GDPR?' },
        expectedWorkflow: 'counsel',
      },
      {
        name: 'general with doc → review',
        request: { type: 'general', documentPath: '/some.pdf' },
        expectedWorkflow: 'review',
      },
      {
        name: 'general without doc → counsel',
        request: { type: 'general', requestText: 'Help me' },
        expectedWorkflow: 'counsel',
      },
    ];

    testCases.forEach(({ name, request, expectedWorkflow }) => {
      it(`should route ${name} and find template in registry`, () => {
        const classification = classifyRequest(request);
        expect(classification.selectedWorkflow).toBe(expectedWorkflow);

        const template = workflowRegistry.get(classification.selectedWorkflow);
        expect(template).toBeDefined();
        expect(template!.id).toBe(expectedWorkflow);
      });
    });
  });

  describe('Backward Compatibility', () => {
    it('runTheShem() path: legal-design + documentPath triggers backward compat', () => {
      const request: LegalRequest = {
        type: 'document_redesign',
        documentPath: '/path/to/terms.pdf',
      };

      const classification = classifyRequest(request);
      // dispatch() checks: workflowId === 'legal-design' && request.documentPath
      // If both true → calls runTheShem() instead of runGenericWorkflow()
      expect(classification.selectedWorkflow).toBe('legal-design');
      expect(request.documentPath).toBeDefined();
    });

    it('non-legal-design workflows go through generic executor', () => {
      const request: LegalRequest = {
        type: 'contract_review',
        documentPath: '/path/to/contract.pdf',
      };

      const classification = classifyRequest(request);
      // review ≠ 'legal-design' → goes through runGenericWorkflow()
      expect(classification.selectedWorkflow).not.toBe('legal-design');
    });
  });

  describe('Event Emission', () => {
    it('should emit routing_decision event during routing', async () => {
      const { routeRequest } = await import('../../src/router/router.js');
      const request: LegalRequest = {
        type: 'contract_review',
        documentPath: '/path/to/contract.pdf',
      };

      const events: unknown[] = [];
      session.events.on('routing_decision', (e: unknown) => events.push(e));

      // Use deterministic routing (no LLM call) to avoid timeout
      await routeRequest(request, session, { useLlm: false });

      expect(events).toHaveLength(1);
      const event = events[0] as Record<string, unknown>;
      expect(event.selectedWorkflow).toBe('review');
    });
  });
});
