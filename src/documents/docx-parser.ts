/**
 * DOCX Parser — Extracts text and structure from Word documents.
 *
 * Uses mammoth to convert DOCX → HTML, then parses the HTML to extract
 * structural information (headings, tables, paragraphs).
 */

import mammoth from 'mammoth';
import { detectSections, detectDefinedTerms } from './structure-detector.js';
import type { ParsedDocument, DocumentSection, DocumentTable } from './types.js';

/**
 * Parse a DOCX buffer into a structured ParsedDocument.
 */
export async function parseDocx(
  buffer: Buffer,
  filename: string,
  fileSize: number,
): Promise<ParsedDocument> {
  // Convert DOCX to HTML (preserves structure better than plain text)
  const htmlResult = await mammoth.convertToHtml({ buffer });
  const html = htmlResult.value;

  // Also get plain text for fullText field
  const textResult = await mammoth.extractRawText({ buffer });
  const fullText = textResult.value;

  const wordCount = fullText.split(/\s+/).filter(w => w.length > 0).length;
  // Estimate page count (~250 words per page)
  const pageCount = Math.max(1, Math.ceil(wordCount / 250));

  // Parse HTML for structure
  const sections = extractSectionsFromHtml(html, fullText);
  const tables = extractTablesFromHtml(html);
  const definedTerms = extractDefinedTermsFromHtml(html, fullText);

  return {
    id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: filename,
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    size: fileSize,
    pageCount,
    wordCount,
    fullText,
    sections,
    tables,
    definedTerms,
    parseMethod: 'mammoth',
    parsedAt: new Date().toISOString(),
  };
}

// ── HTML Section Extraction ─────────────────────────────────────────────

/**
 * Extract sections from mammoth's HTML output.
 * Headings (h1-h6) define section boundaries.
 */
function extractSectionsFromHtml(html: string, fullText: string): DocumentSection[] {
  // Match heading tags and their content
  const headingPattern = /<h([1-6])[^>]*>(.*?)<\/h\1>/gi;
  const headings: Array<{ level: number; text: string; htmlIndex: number }> = [];

  let match: RegExpExecArray | null;
  while ((match = headingPattern.exec(html)) !== null) {
    const level = parseInt(match[1], 10);
    const text = stripHtml(match[2]).trim();
    if (text.length > 0) {
      headings.push({ level, text, htmlIndex: match.index });
    }
  }

  if (headings.length === 0) {
    // No headings found — fall back to plain text section detection
    return detectSections(fullText);
  }

  // Extract content between headings
  const sections: DocumentSection[] = [];
  for (let i = 0; i < headings.length; i++) {
    const start = headings[i].htmlIndex;
    const end = i < headings.length - 1 ? headings[i + 1].htmlIndex : html.length;
    const sectionHtml = html.slice(start, end);

    // Strip the heading itself, keep body content
    const bodyHtml = sectionHtml.replace(/<h[1-6][^>]*>.*?<\/h[1-6]>/i, '');
    const content = stripHtml(bodyHtml).trim();

    // Approximate startIndex in fullText
    const startIndex = fullText.indexOf(headings[i].text);

    sections.push({
      heading: headings[i].text,
      level: headings[i].level,
      content,
      startIndex: startIndex >= 0 ? startIndex : 0,
      children: [],
    });
  }

  // Build hierarchy
  return buildHierarchyFromSections(sections);
}

function buildHierarchyFromSections(flat: DocumentSection[]): DocumentSection[] {
  const root: DocumentSection[] = [];
  const stack: DocumentSection[] = [];

  for (const section of flat) {
    const clean: DocumentSection = { ...section, children: [] };

    while (stack.length > 0 && stack[stack.length - 1].level >= clean.level) {
      stack.pop();
    }

    if (stack.length === 0) {
      root.push(clean);
    } else {
      stack[stack.length - 1].children.push(clean);
    }
    stack.push(clean);
  }

  return root;
}

// ── HTML Table Extraction ───────────────────────────────────────────────

function extractTablesFromHtml(html: string): DocumentTable[] {
  const tables: DocumentTable[] = [];
  const tablePattern = /<table[^>]*>([\s\S]*?)<\/table>/gi;

  let match: RegExpExecArray | null;
  while ((match = tablePattern.exec(html)) !== null) {
    const tableHtml = match[1];
    const rows = extractTableRows(tableHtml);

    if (rows.length >= 2) {
      tables.push({
        headers: rows[0],
        rows: rows.slice(1),
      });
    }
  }

  return tables;
}

function extractTableRows(tableHtml: string): string[][] {
  const rows: string[][] = [];
  const rowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;

  let match: RegExpExecArray | null;
  while ((match = rowPattern.exec(tableHtml)) !== null) {
    const rowHtml = match[1];
    const cells: string[] = [];
    const cellPattern = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;

    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellPattern.exec(rowHtml)) !== null) {
      cells.push(stripHtml(cellMatch[1]).trim());
    }

    if (cells.length > 0) rows.push(cells);
  }

  return rows;
}

// ── Defined Terms from HTML ─────────────────────────────────────────────

function extractDefinedTermsFromHtml(html: string, fullText: string): string[] {
  const terms = new Set<string>();

  // Strong/bold terms that look like definitions
  const strongPattern = /<strong[^>]*>(.*?)<\/strong>/gi;
  let match: RegExpExecArray | null;
  while ((match = strongPattern.exec(html)) !== null) {
    const text = stripHtml(match[1]).trim();
    if (text.length >= 2 && text.length <= 60 && /^[A-Z]/.test(text)) {
      terms.add(text);
    }
  }

  // Also run the text-based detector for quoted terms
  const textTerms = detectDefinedTerms(fullText);
  for (const term of textTerms) terms.add(term);

  return Array.from(terms).sort();
}

// ── Utility ─────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
