/**
 * Document Text Sanitization — SMAC-L1 inspired defense against prompt injection.
 *
 * Strips invisible/hidden content from extracted document text BEFORE it reaches
 * any LLM. This is the single sanitization point for all document content —
 * every downstream consumer (MCP tools, assembly, orchestrator, Claw) gets clean text.
 *
 * Inspired by: OpenClaw SMAC-L1 standard (strip HTML comments, zero-width Unicode,
 * markdown reference links) with logging of all removed content.
 *
 * What we strip:
 *   - Zero-width and invisible Unicode characters (prompt injection vector)
 *   - HTML comments (can survive PDF/DOCX extraction)
 *   - ANSI escape sequences (can hide in plain text files)
 *
 * What we DON'T strip:
 *   - Regular whitespace, tabs, newlines (needed for structure detection)
 *   - Legitimate Unicode (accented chars, CJK, Cyrillic, Arabic)
 *   - Markdown syntax (headings, lists, bold)
 *   - Bracket patterns like [Section 1] (legitimate in legal docs)
 */

// ── Types ────────────────────────────────────────────────────────────────

export interface SanitizationEntry {
  type: 'zero_width' | 'html_comment' | 'ansi_escape';
  count: number;
  /** First occurrence (truncated to 100 chars) for audit trail */
  sample?: string;
}

// ── Invisible Unicode ────────────────────────────────────────────────────

/**
 * Regex matching zero-width and invisible Unicode characters.
 *
 * These are invisible to humans but processed by LLMs. A malicious document
 * could embed "ignore all previous instructions" in zero-width characters
 * that the user can't see but the model reads.
 *
 * Ranges:
 *   U+00AD        Soft hyphen
 *   U+200B-200F   Zero-width space/joiners, LTR/RTL marks
 *   U+2028-2029   Line/paragraph separators (non-standard whitespace)
 *   U+202A-202E   Bidi embedding/override controls
 *   U+2060-2064   Word joiner, invisible operators
 *   U+FEFF        BOM / zero-width no-break space
 *   U+FFF9-FFFB   Interlinear annotation anchors
 */
const INVISIBLE_UNICODE_RE = /[\u00AD\u200B-\u200F\u2028\u2029\u202A-\u202E\u2060-\u2064\uFEFF\uFFF9-\uFFFB]/g;

// ── HTML Comments ────────────────────────────────────────────────────────

/**
 * HTML comments can survive PDF and DOCX text extraction in some edge cases
 * (especially with mammoth's HTML intermediate step). They're invisible in
 * rendered documents but present in extracted text — a perfect injection vector.
 */
const HTML_COMMENT_RE = /<!--[\s\S]*?-->/g;

// ── ANSI Escape Sequences ────────────────────────────────────────────────

/**
 * ANSI terminal escape codes (color, cursor movement, etc.) can hide in
 * plain text files. They're invisible in most text renderers but present
 * in the extracted string — could confuse LLM processing.
 */
const ANSI_ESCAPE_RE = /\x1B\[[0-9;]*[A-Za-z]/g;

// ── Core Sanitization ────────────────────────────────────────────────────

/**
 * Sanitize document text for safe LLM consumption.
 *
 * Returns the cleaned text and a log of everything that was removed.
 * The log is stored in ParsedDocument.sanitizationLog for audit trail.
 */
export function sanitizeDocumentText(text: string): {
  cleaned: string;
  removed: SanitizationEntry[];
} {
  if (!text) return { cleaned: '', removed: [] };

  const removed: SanitizationEntry[] = [];
  let cleaned = text;

  // 1. Strip invisible Unicode characters
  const invisibleMatches = cleaned.match(INVISIBLE_UNICODE_RE);
  if (invisibleMatches && invisibleMatches.length > 0) {
    const sample = invisibleMatches.slice(0, 5)
      .map(c => `U+${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`)
      .join(', ');
    removed.push({
      type: 'zero_width',
      count: invisibleMatches.length,
      sample,
    });
    cleaned = cleaned.replace(INVISIBLE_UNICODE_RE, '');
  }

  // 2. Strip HTML comments
  const commentMatches = cleaned.match(HTML_COMMENT_RE);
  if (commentMatches && commentMatches.length > 0) {
    const sample = commentMatches[0].substring(0, 100);
    removed.push({
      type: 'html_comment',
      count: commentMatches.length,
      sample,
    });
    cleaned = cleaned.replace(HTML_COMMENT_RE, '');
  }

  // 3. Strip ANSI escape sequences
  const ansiMatches = cleaned.match(ANSI_ESCAPE_RE);
  if (ansiMatches && ansiMatches.length > 0) {
    removed.push({
      type: 'ansi_escape',
      count: ansiMatches.length,
    });
    cleaned = cleaned.replace(ANSI_ESCAPE_RE, '');
  }

  // 4. Unicode NFC normalization — ensures consistent representation
  // (e.g., é as single codepoint vs e + combining accent)
  cleaned = cleaned.normalize('NFC');

  return { cleaned, removed };
}

/**
 * Apply sanitization to all text fields in a parsed document's sections.
 * Returns aggregated sanitization log across all fields.
 */
export function sanitizeDocumentFields(doc: {
  fullText: string;
  sections: Array<{ content: string; heading: string; children?: Array<{ content: string; heading: string }> }>;
  tables: Array<{ rows: string[][]; caption?: string }>;
  definedTerms: string[];
}): SanitizationEntry[] {
  const allRemoved: SanitizationEntry[] = [];

  // Helper: sanitize and collect removals
  const sanitize = (text: string): string => {
    const { cleaned, removed } = sanitizeDocumentText(text);
    for (const entry of removed) {
      const existing = allRemoved.find(e => e.type === entry.type);
      if (existing) {
        existing.count += entry.count;
        if (!existing.sample && entry.sample) existing.sample = entry.sample;
      } else {
        allRemoved.push({ ...entry });
      }
    }
    return cleaned;
  };

  // Sanitize fullText
  doc.fullText = sanitize(doc.fullText);

  // Sanitize section content (recursive for children)
  const sanitizeSections = (sections: Array<{ content: string; heading: string; children?: Array<{ content: string; heading: string }> }>) => {
    for (const section of sections) {
      section.content = sanitize(section.content);
      section.heading = sanitize(section.heading);
      if (section.children) {
        sanitizeSections(section.children);
      }
    }
  };
  sanitizeSections(doc.sections);

  // Sanitize table cells
  for (const table of doc.tables) {
    if (table.caption) table.caption = sanitize(table.caption);
    for (const row of table.rows) {
      for (let i = 0; i < row.length; i++) {
        row[i] = sanitize(row[i]);
      }
    }
  }

  // Sanitize defined terms
  for (let i = 0; i < doc.definedTerms.length; i++) {
    doc.definedTerms[i] = sanitize(doc.definedTerms[i]);
  }

  return allRemoved;
}
