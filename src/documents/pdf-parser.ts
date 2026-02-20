/**
 * PDF Parser — Extracts text and structure from PDF files.
 *
 * Uses pdf-parse (v3) for text extraction, then applies structural analysis
 * to detect sections, defined terms, and tables.
 */

import { PDFParse } from 'pdf-parse';
import { detectSections, detectDefinedTerms, detectTables } from './structure-detector.js';
import type { ParsedDocument } from './types.js';

/**
 * Parse a PDF buffer into a structured ParsedDocument.
 */
export async function parsePdf(
  buffer: Buffer,
  filename: string,
  fileSize: number,
): Promise<ParsedDocument> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });

  // Get text content (concatenated across all pages)
  const textResult = await parser.getText();
  const fullText = textResult.text;
  const pageCount = textResult.total;

  // Clean up
  await parser.destroy();

  const wordCount = fullText.split(/\s+/).filter((w: string) => w.length > 0).length;

  // Structural analysis
  const sections = detectSections(fullText);
  const definedTerms = detectDefinedTerms(fullText);
  const tables = detectTables(fullText);

  return {
    id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: filename,
    mimeType: 'application/pdf',
    size: fileSize,
    pageCount,
    wordCount,
    fullText,
    sections,
    tables,
    definedTerms,
    parseMethod: 'pdf-parse',
    parsedAt: new Date().toISOString(),
  };
}
