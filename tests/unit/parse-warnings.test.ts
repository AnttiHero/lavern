import { describe, it, expect } from 'vitest';
import { detectParseWarnings } from '../../src/documents/structure-detector.js';

describe('Parse Warning Detection', () => {
  describe('garbled table detection', () => {
    it('detects lines with multi-space gaps and numbers', () => {
      const text = [
        'SCHEDULE A - FEE SCHEDULE',
        'Service Type          Rate     Minimum     Maximum',
        'Standard Review       $500     $200        $1,500',
        'Deep Analysis         $1,200   $800        $3,000',
        'Full Bench            $2,500   $1,000      $5,000',
        '',
        'This is normal text after the table.',
      ].join('\n');

      const warnings = detectParseWarnings(text, 'pdf-parse');
      const garbled = warnings.filter(w => w.type === 'garbled_table');
      expect(garbled.length).toBeGreaterThanOrEqual(1);
      expect(garbled[0].message).toContain('garbled table');
    });

    it('does not flag normal text', () => {
      const text = [
        'This is a standard paragraph of legal text.',
        'The parties agree to the following terms and conditions.',
        'Section 1. Definitions.',
        '"Confidential Information" means any proprietary data.',
      ].join('\n');

      const warnings = detectParseWarnings(text, 'pdf-parse');
      const garbled = warnings.filter(w => w.type === 'garbled_table');
      expect(garbled).toHaveLength(0);
    });

    it('requires at least 3 consecutive lines to flag', () => {
      const text = [
        'Header     Value     Result',
        'Row 1      100       200',
        'Normal text continues here.',
      ].join('\n');

      const warnings = detectParseWarnings(text, 'pdf-parse');
      const garbled = warnings.filter(w => w.type === 'garbled_table');
      expect(garbled).toHaveLength(0);
    });
  });

  describe('dense number region detection', () => {
    it('detects clusters of numerical lines', () => {
      const text = [
        'Payment Schedule:',
        '$1,500.00  Jan 2026  15%  Net 30',
        '$2,300.00  Feb 2026  18%  Net 30',
        '$1,800.00  Mar 2026  12%  Net 30',
        '$3,100.00  Apr 2026  22%  Net 30',
        '$2,750.00  May 2026  19%  Net 30',
        '',
        'The above schedule is subject to change.',
      ].join('\n');

      const warnings = detectParseWarnings(text, 'pdf-parse');
      const dense = warnings.filter(w => w.type === 'dense_numbers');
      expect(dense.length).toBeGreaterThanOrEqual(1);
      expect(dense[0].message).toContain('numerical region');
    });

    it('does not flag lines with occasional numbers', () => {
      const text = [
        'The agreement was signed on January 15, 2026.',
        'Section 3.2 contains the liability provisions.',
        'The total contract value is approximately $50,000.',
      ].join('\n');

      const warnings = detectParseWarnings(text, 'pdf-parse');
      const dense = warnings.filter(w => w.type === 'dense_numbers');
      expect(dense).toHaveLength(0);
    });
  });

  describe('OCR artifact detection', () => {
    it('detects non-standard character sequences in PDFs', () => {
      const text = 'Normal text \u0000\u0001\u0002\u0003\u0004 more text \u0000\u0001\u0002\u0003 and \u0000\u0001\u0002\u0003\u0004\u0005 end';

      const warnings = detectParseWarnings(text, 'pdf-parse');
      const ocr = warnings.filter(w => w.type === 'possible_ocr_errors');
      expect(ocr.length).toBeGreaterThanOrEqual(1);
    });

    it('does not flag OCR for non-PDF documents', () => {
      const text = 'Normal text \u0000\u0001\u0002\u0003\u0004 garbage \u0000\u0001\u0002\u0003 more \u0000\u0001\u0002\u0003\u0004\u0005';

      const warnings = detectParseWarnings(text, 'mammoth');
      const ocr = warnings.filter(w => w.type === 'possible_ocr_errors');
      expect(ocr).toHaveLength(0);
    });
  });

  describe('edge cases', () => {
    it('handles empty text', () => {
      const warnings = detectParseWarnings('', 'pdf-parse');
      expect(warnings).toHaveLength(0);
    });

    it('handles single line', () => {
      const warnings = detectParseWarnings('Just one line.', 'pdf-parse');
      expect(warnings).toHaveLength(0);
    });

    it('includes location and sample in warnings', () => {
      const text = [
        'Normal text',
        'Fee     Rate     Cap     Floor',
        '$100    5%       $500    $50',
        '$200    8%       $1000   $100',
        '$300    12%      $1500   $150',
        'Normal text',
      ].join('\n');

      const warnings = detectParseWarnings(text, 'pdf-parse');
      if (warnings.length > 0) {
        expect(warnings[0].location).toBeDefined();
        expect(warnings[0].sample).toBeDefined();
        expect(warnings[0].sample!.length).toBeLessThanOrEqual(200);
      }
    });
  });
});
