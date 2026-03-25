/**
 * Document parsing types — structured representation of legal documents.
 *
 * A ParsedDocument preserves the original text AND structural information:
 * headings, sections, tables, and defined terms. Agents can query specific
 * sections instead of receiving the entire document in every prompt.
 */

// ── Section ─────────────────────────────────────────────────────────────

export interface DocumentSection {
  /** Section heading text, e.g. "3. Indemnification" or "DEFINITIONS" */
  heading: string;
  /** Nesting level: 1 = top-level, 2 = subsection, 3 = sub-subsection */
  level: number;
  /** Full text content of this section (excluding children) */
  content: string;
  /** Character offset of this section in fullText */
  startIndex: number;
  /** Nested subsections */
  children: DocumentSection[];
}

// ── Table ───────────────────────────────────────────────────────────────

export interface DocumentTable {
  /** Optional table caption or preceding heading */
  caption?: string;
  /** Column headers */
  headers: string[];
  /** Table rows — each row is an array of cell values */
  rows: string[][];
}

// ── Parsed Document ─────────────────────────────────────────────────────

export interface ParsedDocument {
  /** Unique document ID */
  id: string;
  /** Original filename */
  name: string;
  /** MIME type (application/pdf, application/vnd.openxmlformats-officedocument.wordprocessingml.document, etc.) */
  mimeType: string;
  /** File size in bytes */
  size: number;
  /** Number of pages (PDF) or estimated pages (DOCX/text) */
  pageCount: number;
  /** Total word count */
  wordCount: number;
  /** Complete extracted plain text */
  fullText: string;
  /** Structural breakdown into sections */
  sections: DocumentSection[];
  /** Extracted tables */
  tables: DocumentTable[];
  /** Defined terms found in the document (quoted, bold, or ALLCAPS terms) */
  definedTerms: string[];
  /** Which parser was used */
  parseMethod: 'pdf-parse' | 'mammoth' | 'plaintext';
  /** ISO timestamp of when parsing completed */
  parsedAt: string;
  /** Audit log of invisible/hidden content stripped during sanitization (SMAC-L1) */
  sanitizationLog?: Array<{
    type: 'zero_width' | 'html_comment' | 'ansi_escape';
    count: number;
    sample?: string;
  }>;
  /** Parse quality warnings — regions where extraction may be unreliable */
  parseWarnings?: ParseWarning[];
}

export interface ParseWarning {
  /** What type of issue was detected */
  type: 'garbled_table' | 'misaligned_columns' | 'dense_numbers' | 'possible_ocr_errors';
  /** Human-readable description */
  message: string;
  /** Approximate location in the document (line number or char offset) */
  location?: string;
  /** The problematic text snippet (first 200 chars) */
  sample?: string;
}

// ── Preview (lightweight, frontend-only) ────────────────────────────────

export interface DocumentPreview {
  name: string;
  size: number;
  mimeType: string;
  pageCount: number;
  wordCount: number;
  /** First ~500 chars of extracted text */
  textPreview: string;
  /** Top-level section headings detected */
  detectedHeadings: string[];
}
