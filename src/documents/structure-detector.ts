/**
 * Structure Detector — Pattern-based extraction of sections, defined terms,
 * and tables from plain text. Used by both PDF and DOCX parsers after
 * initial text extraction.
 *
 * Legal documents follow recognizable patterns:
 * - Numbered sections: "1.", "1.1", "Article I", "Section 2.3"
 * - ALLCAPS headings: "DEFINITIONS", "INDEMNIFICATION"
 * - Defined terms: "Confidential Information", terms in quotes or bold
 * - Tables: Aligned columns with consistent whitespace
 */

import type { DocumentSection, DocumentTable } from './types.js';

// ── Section Detection ───────────────────────────────────────────────────

/**
 * Heading patterns common in legal documents, ordered by specificity.
 * Each pattern returns the heading text and an inferred nesting level.
 */
const HEADING_PATTERNS: Array<{
  regex: RegExp;
  level: (match: RegExpMatchArray) => number;
  heading: (match: RegExpMatchArray) => string;
}> = [
  // "ARTICLE I — DEFINITIONS" or "ARTICLE 1. DEFINITIONS"
  {
    regex: /^(ARTICLE\s+[IVXLC\d]+[\s.:\u2014\u2013-]*\s*.+)$/,
    level: () => 1,
    heading: (m) => m[1].trim(),
  },
  // "Section 1.2.3" or "SECTION 1.2"
  {
    regex: /^((?:SECTION|Section)\s+[\d.]+[\s.:\u2014\u2013-]*\s*.*)$/,
    level: (m) => {
      const num = m[0].match(/[\d.]+/)?.[0] ?? '';
      return Math.min(num.split('.').length, 3);
    },
    heading: (m) => m[1].trim(),
  },
  // Numbered: "1.", "1.1", "1.1.1", "12.3" — must be followed by text
  {
    regex: /^(\d{1,3}(?:\.\d{1,3}){0,3})\.\s+(.+)$/,
    level: (m) => {
      const num = m[1];
      return Math.min(num.split('.').length, 3);
    },
    heading: (m) => `${m[1]}. ${m[2].trim()}`,
  },
  // Lettered subsections: "(a)", "(b)", "(i)", "(ii)"
  {
    regex: /^\(([a-z]|[ivx]{1,4})\)\s+(.+)$/,
    level: (m) => {
      const marker = m[1];
      return /^[ivx]+$/.test(marker) ? 3 : 2;
    },
    heading: (m) => `(${m[1]}) ${m[2].trim()}`,
  },
  // ALL CAPS line (at least 3 words, all uppercase, no lowercase)
  {
    regex: /^([A-Z][A-Z\s,&\-:]{8,})$/,
    level: () => 1,
    heading: (m) => m[1].trim(),
  },
];

/**
 * Detect sections from plain text. Returns a hierarchical section tree.
 */
export function detectSections(text: string): DocumentSection[] {
  const lines = text.split('\n');
  const flatSections: Array<{
    heading: string;
    level: number;
    lineIndex: number;
    charIndex: number;
  }> = [];

  let charOffset = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.length > 0 && line.length < 200) {
      for (const pattern of HEADING_PATTERNS) {
        const match = line.match(pattern.regex);
        if (match) {
          flatSections.push({
            heading: pattern.heading(match),
            level: pattern.level(match),
            lineIndex: i,
            charIndex: charOffset,
          });
          break;
        }
      }
    }
    charOffset += lines[i].length + 1; // +1 for \n
  }

  // Build section content (text between this heading and the next)
  const sectionsWithContent: Array<DocumentSection & { _lineIndex: number }> = flatSections.map((sec, idx) => {
    const startLine = sec.lineIndex + 1; // Content starts after heading
    const endLine = idx < flatSections.length - 1 ? flatSections[idx + 1].lineIndex : lines.length;
    const content = lines.slice(startLine, endLine).join('\n').trim();

    return {
      heading: sec.heading,
      level: sec.level,
      content,
      startIndex: sec.charIndex,
      children: [],
      _lineIndex: sec.lineIndex,
    };
  });

  // Build hierarchy: nest children under parents by level
  return buildHierarchy(sectionsWithContent);
}

function buildHierarchy(
  flat: Array<DocumentSection & { _lineIndex: number }>,
): DocumentSection[] {
  const root: DocumentSection[] = [];
  const stack: DocumentSection[] = [];

  for (const section of flat) {
    const clean: DocumentSection = {
      heading: section.heading,
      level: section.level,
      content: section.content,
      startIndex: section.startIndex,
      children: [],
    };

    // Pop stack until we find a parent with a lower level
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

// ── Defined Terms Detection ─────────────────────────────────────────────

/**
 * Extract defined terms from legal text. Looks for:
 * - Terms in "double quotes" that look like definitions (capitalized, 2-5 words)
 * - ALL CAPS terms (e.g., LICENSEE, LICENSOR)
 * - Common legal definition patterns: "X" means..., "X" shall mean...
 */
export function detectDefinedTerms(text: string): string[] {
  const terms = new Set<string>();

  // Pattern 1: "Term" means / shall mean / is defined as
  const definitionPattern = /["\u201C]([A-Z][A-Za-z\s]{1,60})["\u201D]\s*(?:means|shall mean|is defined as|refers to|has the meaning)/g;
  let match: RegExpExecArray | null;
  while ((match = definitionPattern.exec(text)) !== null) {
    const term = match[1].trim();
    if (term.length >= 2 && term.length <= 60) {
      terms.add(term);
    }
  }

  // Pattern 2: Capitalized terms in quotes that appear multiple times
  const quotedTerms = /["\u201C]([A-Z][A-Za-z\s]{1,40})["\u201D]/g;
  const quotedCounts = new Map<string, number>();
  while ((match = quotedTerms.exec(text)) !== null) {
    const term = match[1].trim();
    if (term.length >= 2 && term.length <= 40 && /^[A-Z]/.test(term)) {
      quotedCounts.set(term, (quotedCounts.get(term) ?? 0) + 1);
    }
  }
  for (const [term, count] of quotedCounts) {
    if (count >= 2) terms.add(term);
  }

  // Pattern 3: ALL CAPS multi-word terms (not section headings)
  const capsPattern = /\b([A-Z]{2,}(?:\s+[A-Z]{2,}){0,3})\b/g;
  const capsExclusions = new Set([
    'THE', 'AND', 'FOR', 'BUT', 'NOT', 'WITH', 'THIS', 'THAT', 'FROM',
    'SHALL', 'WILL', 'MAY', 'MUST', 'ARTICLE', 'SECTION', 'WHEREAS',
    'NOW', 'THEREFORE', 'HEREBY', 'PROVIDED', 'INCLUDING', 'EXCEPT',
    'WITHOUT', 'LIMITATION', 'PURSUANT', 'HEREIN', 'THEREOF', 'HEREOF',
  ]);
  while ((match = capsPattern.exec(text)) !== null) {
    const term = match[1].trim();
    if (term.length >= 3 && !capsExclusions.has(term)) {
      terms.add(term);
    }
  }

  return Array.from(terms).sort();
}

// ── Table Detection ─────────────────────────────────────────────────────

/**
 * Detect tables from plain text. Looks for:
 * - Lines with multiple pipe characters (|) — markdown-style tables
 * - Lines with consistent tab separation
 */
export function detectTables(text: string): DocumentTable[] {
  const tables: DocumentTable[] = [];
  const lines = text.split('\n');

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Pipe-delimited table detection
    if (line.includes('|') && line.split('|').length >= 3) {
      const tableLines: string[] = [line];
      let j = i + 1;

      // Collect consecutive pipe-delimited lines
      while (j < lines.length && lines[j].includes('|') && lines[j].split('|').length >= 3) {
        tableLines.push(lines[j]);
        j++;
      }

      if (tableLines.length >= 2) {
        const parsed = parsePipeTable(tableLines);
        if (parsed) {
          // Look for a caption in the preceding line
          if (i > 0 && lines[i - 1].trim().length > 0 && lines[i - 1].trim().length < 100) {
            parsed.caption = lines[i - 1].trim();
          }
          tables.push(parsed);
        }
      }
      i = j;
      continue;
    }

    // Tab-delimited table detection
    if (line.includes('\t') && line.split('\t').length >= 3) {
      const tableLines: string[] = [line];
      let j = i + 1;

      while (j < lines.length && lines[j].includes('\t') && lines[j].split('\t').length >= 3) {
        tableLines.push(lines[j]);
        j++;
      }

      if (tableLines.length >= 2) {
        const parsed = parseTabTable(tableLines);
        if (parsed) tables.push(parsed);
      }
      i = j;
      continue;
    }

    i++;
  }

  return tables;
}

function parsePipeTable(lines: string[]): DocumentTable | null {
  const parseLine = (line: string) =>
    line.split('|').map(cell => cell.trim()).filter(cell => cell.length > 0);

  const headers = parseLine(lines[0]);
  if (headers.length < 2) return null;

  // Skip separator line (---|----|---)
  let dataStart = 1;
  if (lines.length > 1 && /^[\s|:-]+$/.test(lines[1])) {
    dataStart = 2;
  }

  const rows = lines.slice(dataStart)
    .map(parseLine)
    .filter(row => row.length > 0);

  return { headers, rows };
}

function parseTabTable(lines: string[]): DocumentTable | null {
  const parseLine = (line: string) => line.split('\t').map(cell => cell.trim());

  const headers = parseLine(lines[0]);
  if (headers.length < 2) return null;

  const rows = lines.slice(1).map(parseLine).filter(row => row.length > 0);
  return { headers, rows };
}
