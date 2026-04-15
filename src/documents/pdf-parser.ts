/**
 * PDF Parser — Extracts text and structure from PDF files.
 *
 * Uses pdf-parse (v3) for text extraction, then applies structural analysis
 * to detect sections, defined terms, and tables.
 */

import { PDFParse } from 'pdf-parse';
import { detectSections, detectDefinedTerms, detectTables, detectParseWarnings } from './structure-detector.js';
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

  // Get text content (concatenated across all pages). Classify error modes
  // so users get an actionable message rather than a generic "parse failed."
  let fullText: string;
  let pageCount: number;
  try {
    const textResult = await parser.getText();
    fullText = textResult.text;
    pageCount = textResult.total;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await parser.destroy().catch(() => { /* ignore cleanup errors on failure path */ });

    // pdf.js / pdf-parse surface password-protected PDFs with error names like
    // "PasswordException" or messages mentioning "password" / "encrypted".
    if (/password|encrypt/i.test(msg) || /PasswordException/.test(msg)) {
      throw new Error(
        `PDF is password-protected: "${filename}". Please remove the password and try again.`,
      );
    }
    if (/InvalidPDFException|Invalid PDF structure|bad PDF header/i.test(msg)) {
      throw new Error(
        `PDF is corrupted or invalid: "${filename}". Try re-exporting the file.`,
      );
    }
    throw new Error(`Failed to parse PDF "${filename}": ${msg}`);
  }

  // Clean up
  await parser.destroy();

  const wordCount = fullText.split(/\s+/).filter((w: string) => w.length > 0).length;

  // Structural analysis
  const sections = detectSections(fullText);
  const definedTerms = detectDefinedTerms(fullText);
  const tables = detectTables(fullText);
  const parseWarnings = detectParseWarnings(fullText, 'pdf-parse');

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
    parseWarnings: parseWarnings.length > 0 ? parseWarnings : undefined,
  };
}
