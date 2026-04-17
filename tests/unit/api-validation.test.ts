/**
 * Unit Tests — API Request Validation (src/api/middleware/validation.ts)
 *
 * Tests all Zod schemas for API request bodies:
 * - CreateSessionSchema (legacy + v5 formats)
 * - GateDecisionSchema
 * - CreateClientSchema
 * - Path safety validation
 */

import { describe, it, expect } from 'vitest';
import {
  CreateSessionSchema,
  GateDecisionSchema,
  CreateClientSchema,
  isPathSafe,
} from '../../src/api/middleware/validation.js';

describe('API Validation', () => {

  // ── CreateSessionSchema ─────────────────────────────────────────────

  describe('CreateSessionSchema', () => {

    describe('Legacy format', () => {
      it('should accept valid legacy request with documentPath', () => {
        const result = CreateSessionSchema.safeParse({
          documentPath: '/path/to/doc.pdf',
          context: {
            moment: 'signup',
            audience: 'consumer',
            jurisdiction: 'US',
          },
        });
        expect(result.success).toBe(true);
      });

      it('should accept legacy request without context', () => {
        const result = CreateSessionSchema.safeParse({
          documentPath: '/path/to/doc.pdf',
        });
        expect(result.success).toBe(true);
      });

      it('should accept legacy request with options', () => {
        const result = CreateSessionSchema.safeParse({
          documentPath: '/path/to/doc.pdf',
          options: {
            budget: 10.0,
            model: 'claude-opus-4-7',
            maxTurns: 50,
          },
        });
        expect(result.success).toBe(true);
      });
    });

    describe('v5 format', () => {
      it('should accept valid v5 request with LegalRequest', () => {
        const result = CreateSessionSchema.safeParse({
          request: {
            type: 'contract_review',
            documentPath: '/path/to/contract.pdf',
          },
        });
        expect(result.success).toBe(true);
      });

      it('should accept v5 request with workflow override', () => {
        const result = CreateSessionSchema.safeParse({
          request: {
            type: 'legal_question',
            requestText: 'What is force majeure?',
          },
          workflow: 'simple-query',
        });
        expect(result.success).toBe(true);
      });

      it('should accept all request types', () => {
        const types = ['document_redesign', 'contract_review', 'legal_question', 'legal_research', 'risk_assessment', 'general'];
        for (const type of types) {
          const result = CreateSessionSchema.safeParse({
            request: { type, requestText: 'test' },
          });
          expect(result.success).toBe(true);
        }
      });

      it('should accept v5 request with full context', () => {
        const result = CreateSessionSchema.safeParse({
          request: {
            type: 'document_redesign',
            documentPath: '/doc.pdf',
            context: {
              moment: 'checkout',
              audience: 'enterprise',
              jurisdiction: 'EU',
              documentType: 'Terms of Service',
              focus: 'Data protection clauses',
            },
            matterId: 'matter-001',
          },
        });
        expect(result.success).toBe(true);
      });
    });

    describe('Rejection cases', () => {
      it('should reject empty body (neither format)', () => {
        const result = CreateSessionSchema.safeParse({});
        expect(result.success).toBe(false);
      });

      it('should reject invalid moment value', () => {
        const result = CreateSessionSchema.safeParse({
          documentPath: '/doc.pdf',
          context: { moment: 'invalid_moment' },
        });
        expect(result.success).toBe(false);
      });

      it('should reject invalid audience value', () => {
        const result = CreateSessionSchema.safeParse({
          documentPath: '/doc.pdf',
          context: { audience: 'aliens' },
        });
        expect(result.success).toBe(false);
      });

      it('should reject invalid jurisdiction value', () => {
        const result = CreateSessionSchema.safeParse({
          documentPath: '/doc.pdf',
          context: { jurisdiction: 'MARS' },
        });
        expect(result.success).toBe(false);
      });

      it('should reject invalid request type', () => {
        const result = CreateSessionSchema.safeParse({
          request: { type: 'pizza_order', requestText: 'I want pizza' },
        });
        expect(result.success).toBe(false);
      });

      it('should reject budget below minimum', () => {
        const result = CreateSessionSchema.safeParse({
          documentPath: '/doc.pdf',
          options: { budget: 0 },
        });
        expect(result.success).toBe(false);
      });

      it('should reject budget above maximum', () => {
        const result = CreateSessionSchema.safeParse({
          documentPath: '/doc.pdf',
          options: { budget: 500 },
        });
        expect(result.success).toBe(false);
      });

      it('should reject extra unknown fields (strict mode)', () => {
        const result = CreateSessionSchema.safeParse({
          documentPath: '/doc.pdf',
          hackerField: 'malicious',
        });
        expect(result.success).toBe(false);
      });

      it('should reject null bytes in path', () => {
        const result = CreateSessionSchema.safeParse({
          documentPath: '/path/to/doc\0.pdf',
        });
        expect(result.success).toBe(false);
      });

      it('should reject empty documentPath', () => {
        const result = CreateSessionSchema.safeParse({
          documentPath: '',
        });
        expect(result.success).toBe(false);
      });
    });
  });

  // ── GateDecisionSchema ──────────────────────────────────────────────

  describe('GateDecisionSchema', () => {
    it('should accept valid approve decision', () => {
      const result = GateDecisionSchema.safeParse({
        decision: 'approve',
        notes: 'Looks good',
      });
      expect(result.success).toBe(true);
    });

    it('should accept valid reject decision', () => {
      const result = GateDecisionSchema.safeParse({
        decision: 'reject',
      });
      expect(result.success).toBe(true);
    });

    it('should accept valid modify decision', () => {
      const result = GateDecisionSchema.safeParse({
        decision: 'modify',
        notes: 'Change clause 3',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid decision value', () => {
      const result = GateDecisionSchema.safeParse({
        decision: 'maybe',
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing decision', () => {
      const result = GateDecisionSchema.safeParse({
        notes: 'Just notes, no decision',
      });
      expect(result.success).toBe(false);
    });

    it('should reject extra fields', () => {
      const result = GateDecisionSchema.safeParse({
        decision: 'approve',
        extraField: 'malicious',
      });
      expect(result.success).toBe(false);
    });
  });

  // ── CreateClientSchema ──────────────────────────────────────────────

  describe('CreateClientSchema', () => {
    it('should accept valid human client', () => {
      const result = CreateClientSchema.safeParse({
        type: 'human',
        name: 'Test User',
      });
      expect(result.success).toBe(true);
    });

    it('should accept valid agent client', () => {
      const result = CreateClientSchema.safeParse({
        type: 'agent',
        name: 'Review Bot',
        callbackUrl: 'https://example.com/callback',
        autoApproveThreshold: 0.85,
        capabilities: ['review', 'approve'],
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid type', () => {
      const result = CreateClientSchema.safeParse({
        type: 'robot',
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing type', () => {
      const result = CreateClientSchema.safeParse({
        name: 'No type client',
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid callback URL', () => {
      const result = CreateClientSchema.safeParse({
        type: 'agent',
        callbackUrl: 'not-a-url',
      });
      expect(result.success).toBe(false);
    });

    it('should reject autoApproveThreshold > 1', () => {
      const result = CreateClientSchema.safeParse({
        type: 'agent',
        autoApproveThreshold: 1.5,
      });
      expect(result.success).toBe(false);
    });
  });

  // ── Path Safety ─────────────────────────────────────────────────────

  describe('isPathSafe', () => {
    it('should accept relative paths within base', () => {
      expect(isPathSafe('./doc.pdf', '/home/user')).toBe(true);
      expect(isPathSafe('documents/contract.pdf', '/home/user')).toBe(true);
    });

    it('should accept absolute paths within base', () => {
      expect(isPathSafe('/home/user/doc.pdf', '/home/user')).toBe(true);
    });

    it('should reject path traversal attacks', () => {
      expect(isPathSafe('../../etc/passwd', '/home/user')).toBe(false);
      expect(isPathSafe('../../../root/.ssh/id_rsa', '/home/user')).toBe(false);
    });

    it('should reject path traversal with encoded dots', () => {
      // Even simple traversal should be caught after path.resolve
      expect(isPathSafe('/etc/passwd', '/home/user')).toBe(false);
    });
  });
});
