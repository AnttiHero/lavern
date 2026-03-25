import { describe, it, expect } from 'vitest';
import { verifyFindingEvidence } from '../../src/mcp/tools/grounding-verifier.js';

const SAMPLE_DOC = `
MASTER SERVICES AGREEMENT

Section 1. Definitions
1.1 "Service Provider" means ACME Corp.
1.2 "Client" means Widgetco Inc.
1.3 "Effective Date" means January 1, 2026.

Section 2. Scope of Services
2.1 Service Provider shall provide consulting services as described in Exhibit A.
2.2 Services shall be performed in accordance with industry standards.

Section 3. Payment Terms
3.1 Client shall pay Service Provider within thirty (30) days of invoice.
3.2 Late payments shall accrue interest at a rate of 1.5% per month.

Section 4. Limitation of Liability
4.1 Neither party shall be liable for indirect, incidental, or consequential damages.
4.2 Total aggregate liability shall not exceed the fees paid in the preceding twelve (12) months.

Section 5. Termination
5.1 Either party may terminate this Agreement with sixty (60) days written notice.
5.2 Termination for cause requires written notice specifying the breach and a thirty (30) day cure period.

Article 6. Governing Law
This Agreement shall be governed by the laws of the State of Delaware.

Clause 7. Dispute Resolution
7.1 Any dispute shall be resolved through binding arbitration in Wilmington, Delaware.
`;

const HEADINGS = [
  'MASTER SERVICES AGREEMENT',
  'Section 1. Definitions',
  'Section 2. Scope of Services',
  'Section 3. Payment Terms',
  'Section 4. Limitation of Liability',
  'Section 5. Termination',
  'Article 6. Governing Law',
  'Clause 7. Dispute Resolution',
];

describe('Grounding Verifier', () => {
  describe('Section reference extraction and matching', () => {
    it('finds valid section references', () => {
      const evidence = ['Section 3.1 requires payment within thirty days'];
      const results = verifyFindingEvidence(evidence, SAMPLE_DOC, HEADINGS);
      expect(results).toHaveLength(1);
      expect(results[0].sectionRefs).toHaveLength(1);
      expect(results[0].sectionRefs[0].ref).toBe('3.1');
      expect(results[0].sectionRefs[0].found).toBe(true);
    });

    it('detects non-existent section references', () => {
      const evidence = ['Section 9.3 states that penalties apply'];
      const results = verifyFindingEvidence(evidence, SAMPLE_DOC, HEADINGS);
      expect(results[0].sectionRefs[0].ref).toBe('9.3');
      expect(results[0].sectionRefs[0].found).toBe(false);
    });

    it('handles Article references', () => {
      const evidence = ['Article 6 specifies Delaware law'];
      const results = verifyFindingEvidence(evidence, SAMPLE_DOC, HEADINGS);
      expect(results[0].sectionRefs[0].found).toBe(true);
    });

    it('handles Clause references', () => {
      const evidence = ['Clause 7 mandates arbitration'];
      const results = verifyFindingEvidence(evidence, SAMPLE_DOC, HEADINGS);
      expect(results[0].sectionRefs[0].found).toBe(true);
    });

    it('handles multiple section references in one evidence', () => {
      const evidence = ['Section 4.1 excludes consequential damages while Section 4.2 caps liability'];
      const results = verifyFindingEvidence(evidence, SAMPLE_DOC, HEADINGS);
      expect(results[0].sectionRefs).toHaveLength(2);
      expect(results[0].sectionRefs[0].found).toBe(true);
      expect(results[0].sectionRefs[1].found).toBe(true);
    });

    it('mixes found and not-found references', () => {
      const evidence = ['Section 5.1 and Section 8.4 address termination'];
      const results = verifyFindingEvidence(evidence, SAMPLE_DOC, HEADINGS);
      expect(results[0].sectionRefs[0].found).toBe(true); // 5.1 exists
      expect(results[0].sectionRefs[1].found).toBe(false); // 8.4 does not
      expect(results[0].score).toBe(0.5);
    });
  });

  describe('Quoted text matching', () => {
    it('finds exact quoted text', () => {
      const evidence = ['"Neither party shall be liable for indirect, incidental, or consequential damages"'];
      const results = verifyFindingEvidence(evidence, SAMPLE_DOC, HEADINGS);
      expect(results[0].quotes).toHaveLength(1);
      expect(results[0].quotes[0].found).toBe(true);
    });

    it('detects fabricated quotes', () => {
      const evidence = ['"The parties agree to unlimited joint liability for all claims"'];
      const results = verifyFindingEvidence(evidence, SAMPLE_DOC, HEADINGS);
      expect(results[0].quotes[0].found).toBe(false);
    });

    it('ignores short quotes (< 8 chars)', () => {
      const evidence = ['"short" is not checked'];
      const results = verifyFindingEvidence(evidence, SAMPLE_DOC, HEADINGS);
      expect(results[0].quotes).toHaveLength(0);
    });

    it('finds quotes with high character overlap', () => {
      const evidence = ['"Service Provider shall provide consulting services as described"'];
      const results = verifyFindingEvidence(evidence, SAMPLE_DOC, HEADINGS);
      expect(results[0].quotes[0].found).toBe(true);
    });
  });

  describe('Grounding score calculation', () => {
    it('scores 1.0 when all references found', () => {
      const evidence = ['Section 5.2 specifies a "thirty (30) day cure period"'];
      const results = verifyFindingEvidence(evidence, SAMPLE_DOC, HEADINGS);
      expect(results[0].score).toBe(1.0);
    });

    it('scores 0.0 when no references found', () => {
      const evidence = ['Section 12.1 mentions "unlimited indemnification obligations"'];
      const results = verifyFindingEvidence(evidence, SAMPLE_DOC, HEADINGS);
      expect(results[0].score).toBe(0.0);
    });

    it('scores 1.0 for evidence with no references (general observation)', () => {
      const evidence = ['The agreement uses standard boilerplate language'];
      const results = verifyFindingEvidence(evidence, SAMPLE_DOC, HEADINGS);
      expect(results[0].score).toBe(1.0); // No refs = assume grounded
    });

    it('averages across multiple evidence items', () => {
      const evidence = [
        'Section 3.1 requires payment', // found
        'Section 99.9 is problematic',  // not found
      ];
      const results = verifyFindingEvidence(evidence, SAMPLE_DOC, HEADINGS);
      expect(results[0].score).toBe(1.0);
      expect(results[1].score).toBe(0.0);
    });

    it('combines section refs and quotes in score', () => {
      // Section 4.2 exists, quote exists
      const evidence = ['Section 4.2 states "Total aggregate liability shall not exceed the fees paid"'];
      const results = verifyFindingEvidence(evidence, SAMPLE_DOC, HEADINGS);
      expect(results[0].sectionRefs).toHaveLength(1);
      expect(results[0].quotes).toHaveLength(1);
      expect(results[0].score).toBe(1.0);
    });
  });

  describe('Edge cases', () => {
    it('handles empty evidence array', () => {
      const results = verifyFindingEvidence([], SAMPLE_DOC, HEADINGS);
      expect(results).toHaveLength(0);
    });

    it('handles empty document text', () => {
      const evidence = ['Section 1.1 is important'];
      const results = verifyFindingEvidence(evidence, '', []);
      expect(results[0].sectionRefs[0].found).toBe(false);
    });

    it('handles evidence with no extractable references', () => {
      const evidence = ['This clause is unusual for this type of agreement'];
      const results = verifyFindingEvidence(evidence, SAMPLE_DOC, HEADINGS);
      expect(results[0].sectionRefs).toHaveLength(0);
      expect(results[0].quotes).toHaveLength(0);
      expect(results[0].score).toBe(1.0);
    });

    it('handles single-quoted text', () => {
      const evidence = ["Section 5.1 allows 'sixty (60) days written notice'"];
      const results = verifyFindingEvidence(evidence, SAMPLE_DOC, HEADINGS);
      expect(results[0].quotes).toHaveLength(1);
      expect(results[0].quotes[0].found).toBe(true);
    });

    it('truncates long evidence text in results', () => {
      const longEvidence = 'A'.repeat(200);
      const results = verifyFindingEvidence([longEvidence], SAMPLE_DOC, HEADINGS);
      expect(results[0].evidenceText.length).toBeLessThanOrEqual(120);
    });

    it('handles Paragraph references', () => {
      const docWithParagraph = 'Paragraph 3 states the terms.\n3. The client agrees.';
      const evidence = ['Paragraph 3 contains the terms'];
      const results = verifyFindingEvidence(evidence, docWithParagraph, ['Paragraph 3']);
      expect(results[0].sectionRefs[0].found).toBe(true);
    });

    it('case-insensitive section matching', () => {
      const evidence = ['section 3.1 requires payment'];
      const results = verifyFindingEvidence(evidence, SAMPLE_DOC, HEADINGS);
      expect(results[0].sectionRefs[0].found).toBe(true);
    });
  });
});
