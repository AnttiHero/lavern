import { describe, it, expect } from 'vitest';
import type { Finding } from '../../src/types/debate.js';

describe('Decline to Find — Uncertainty Handling', () => {
  describe('Finding type validation', () => {
    it('accepts UNCERTAIN as a valid finding type', () => {
      const finding: Finding = {
        id: 'F-001',
        agentRole: 'contract-reviewer',
        findingType: 'UNCERTAIN',
        content: '[DECLINED] Cannot determine if indemnification is mutual',
        severity: 'YELLOW',
        evidence: [],
        confidence: 0.0,
        timestamp: new Date().toISOString(),
        resolved: false,
      };
      expect(finding.findingType).toBe('UNCERTAIN');
      expect(finding.confidence).toBe(0.0);
    });

    it('accepts INSUFFICIENT_EVIDENCE as a valid finding type', () => {
      const finding: Finding = {
        id: 'F-002',
        agentRole: 'risk-pricer',
        findingType: 'INSUFFICIENT_EVIDENCE',
        content: '[DECLINED] Liability cap amount not specified in document',
        severity: 'YELLOW',
        evidence: ['Section 4 mentions liability but does not specify a cap'],
        confidence: 0.0,
        timestamp: new Date().toISOString(),
        resolved: false,
      };
      expect(finding.findingType).toBe('INSUFFICIENT_EVIDENCE');
      expect(finding.evidence).toHaveLength(1);
    });

    it('accepts AMBIGUOUS_DOCUMENT as a valid finding type', () => {
      const finding: Finding = {
        id: 'F-003',
        agentRole: 'contract-reviewer',
        findingType: 'AMBIGUOUS_DOCUMENT',
        content: '[DECLINED] Governing law clause references both Delaware and New York',
        severity: 'YELLOW',
        evidence: [
          'Section 12.1: "This Agreement shall be governed by the laws of Delaware"',
          'Exhibit A, Section 3: "disputes shall be resolved under New York law"',
        ],
        confidence: 0.0,
        timestamp: new Date().toISOString(),
        resolved: false,
      };
      expect(finding.findingType).toBe('AMBIGUOUS_DOCUMENT');
      expect(finding.evidence).toHaveLength(2);
    });

    it('accepts ETHICAL_CONCERN as a valid finding type', () => {
      const finding: Finding = {
        id: 'F-004',
        agentRole: 'ethics-reviewer',
        findingType: 'ETHICAL_CONCERN',
        content: 'Mass-action pattern detected: identical demand letters for 50 tenants',
        severity: 'RED',
        evidence: ['Request text contains "for each tenant in the attached list"'],
        confidence: 0.9,
        timestamp: new Date().toISOString(),
        resolved: false,
      };
      expect(finding.findingType).toBe('ETHICAL_CONCERN');
    });
  });

  describe('Uncertainty detection patterns', () => {
    const UNCERTAINTY_TYPES = ['UNCERTAIN', 'INSUFFICIENT_EVIDENCE', 'AMBIGUOUS_DOCUMENT'];

    it('uncertainty findings always have YELLOW severity', () => {
      for (const type of UNCERTAINTY_TYPES) {
        const finding: Finding = {
          id: `F-${type}`,
          agentRole: 'contract-reviewer',
          findingType: type as Finding['findingType'],
          content: `[DECLINED] Test ${type}`,
          severity: 'YELLOW',
          evidence: [],
          confidence: 0.0,
          timestamp: new Date().toISOString(),
          resolved: false,
        };
        expect(finding.severity).toBe('YELLOW');
        expect(finding.confidence).toBe(0.0);
      }
    });

    it('can count uncertainty findings in a debate state', () => {
      const findings: Finding[] = [
        { id: 'F-001', agentRole: 'contract-reviewer', findingType: 'contract-risk', content: 'Real finding', severity: 'RED', evidence: ['quote'], confidence: 0.9, timestamp: '', resolved: false },
        { id: 'F-002', agentRole: 'contract-reviewer', findingType: 'UNCERTAIN', content: '[DECLINED] Cannot determine', severity: 'YELLOW', evidence: [], confidence: 0.0, timestamp: '', resolved: false },
        { id: 'F-003', agentRole: 'risk-pricer', findingType: 'INSUFFICIENT_EVIDENCE', content: '[DECLINED] Missing data', severity: 'YELLOW', evidence: [], confidence: 0.0, timestamp: '', resolved: false },
        { id: 'F-004', agentRole: 'contract-reviewer', findingType: 'contract-standard', content: 'Standard clause', severity: 'GREEN', evidence: ['quote'], confidence: 0.8, timestamp: '', resolved: false },
      ];

      const uncertaintyCount = findings.filter(f =>
        UNCERTAINTY_TYPES.includes(f.findingType)
      ).length;
      expect(uncertaintyCount).toBe(2);

      const lowConfidenceCount = findings.filter(f => f.confidence < 0.6).length;
      expect(lowConfidenceCount).toBe(2); // The two declined findings
    });

    it('declined findings are identifiable by [DECLINED] prefix', () => {
      const findings: Finding[] = [
        { id: 'F-001', agentRole: 'contract-reviewer', findingType: 'UNCERTAIN', content: '[DECLINED] Something unclear', severity: 'YELLOW', evidence: [], confidence: 0.0, timestamp: '', resolved: false },
        { id: 'F-002', agentRole: 'contract-reviewer', findingType: 'contract-risk', content: 'A real finding', severity: 'RED', evidence: ['quote'], confidence: 0.9, timestamp: '', resolved: false },
      ];

      const declined = findings.filter(f => f.content.startsWith('[DECLINED]'));
      expect(declined).toHaveLength(1);
      expect(declined[0].id).toBe('F-001');
    });

    it('should trigger human gate when 3+ findings have low confidence', () => {
      const findings: Finding[] = [
        { id: 'F-001', agentRole: 'a', findingType: 'contract-risk', content: '', severity: 'YELLOW', evidence: [], confidence: 0.4, timestamp: '', resolved: false },
        { id: 'F-002', agentRole: 'b', findingType: 'UNCERTAIN', content: '[DECLINED]', severity: 'YELLOW', evidence: [], confidence: 0.0, timestamp: '', resolved: false },
        { id: 'F-003', agentRole: 'c', findingType: 'contract-risk', content: '', severity: 'YELLOW', evidence: [], confidence: 0.5, timestamp: '', resolved: false },
        { id: 'F-004', agentRole: 'd', findingType: 'contract-risk', content: '', severity: 'GREEN', evidence: [], confidence: 0.9, timestamp: '', resolved: false },
      ];

      const lowConfidence = findings.filter(f => f.confidence < 0.6);
      const shouldTriggerGate = lowConfidence.length >= 3;
      expect(shouldTriggerGate).toBe(true);
    });

    it('should not trigger human gate when fewer than 3 low-confidence findings', () => {
      const findings: Finding[] = [
        { id: 'F-001', agentRole: 'a', findingType: 'contract-risk', content: '', severity: 'RED', evidence: ['quote'], confidence: 0.9, timestamp: '', resolved: false },
        { id: 'F-002', agentRole: 'b', findingType: 'UNCERTAIN', content: '[DECLINED]', severity: 'YELLOW', evidence: [], confidence: 0.0, timestamp: '', resolved: false },
        { id: 'F-003', agentRole: 'c', findingType: 'contract-standard', content: '', severity: 'GREEN', evidence: ['quote'], confidence: 0.85, timestamp: '', resolved: false },
      ];

      const lowConfidence = findings.filter(f => f.confidence < 0.6);
      const shouldTriggerGate = lowConfidence.length >= 3;
      expect(shouldTriggerGate).toBe(false);
    });
  });
});
