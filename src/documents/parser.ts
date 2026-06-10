/**
 * Document Parser — Main entry point for document extraction.
 *
 * Routes to format-specific parsers (PDF, DOCX) or falls back to
 * plain text extraction. Returns a structured ParsedDocument with
 * sections, tables, and defined terms.
 */

import { parsePdf } from './pdf-parser.js';
import { parseDocx } from './docx-parser.js';
import { detectSections, detectDefinedTerms, detectTables, detectParseWarnings } from './structure-detector.js';
import { sanitizeDocumentFields } from './sanitize-text.js';
import type { ParsedDocument } from './types.js';

// ── MIME type mapping ───────────────────────────────────────────────────

const PDF_TYPES = new Set(['application/pdf']);
const DOCX_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
]);
const TEXT_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'text/html',
  'text/rtf',
  'application/rtf',
]);

/** All MIME types we accept for parsing. */
export const SUPPORTED_MIME_TYPES = new Set([
  ...PDF_TYPES,
  ...DOCX_TYPES,
  ...TEXT_TYPES,
]);

/** File extensions we accept. */
export const SUPPORTED_EXTENSIONS = new Set([
  '.pdf', '.docx', '.doc', '.txt', '.md', '.rtf', '.html', '.htm',
]);

/** Maximum file size. Mirrors SHEM_MAX_UPLOAD_BYTES; default: 200 MB. */
export const MAX_FILE_SIZE = (() => {
  const parsed = Number.parseInt(process.env.SHEM_MAX_UPLOAD_BYTES ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 200 * 1024 * 1024;
})();

// ── Main Parser ─────────────────────────────────────────────────────────

/**
 * Parse a document buffer into a structured ParsedDocument.
 *
 * @param buffer - The raw file content
 * @param filename - Original filename (used for extension detection + metadata)
 * @param mimeType - MIME type (used for routing to correct parser)
 */
export async function parseDocument(
  buffer: Buffer,
  filename: string,
  mimeType: string,
): Promise<ParsedDocument> {
  // Normalize MIME type
  const mime = mimeType.toLowerCase().trim();
  const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));

  // Route to format-specific parser
  let doc: ParsedDocument;

  if (PDF_TYPES.has(mime) || ext === '.pdf') {
    doc = await parsePdf(buffer, filename, buffer.length);
  } else if (DOCX_TYPES.has(mime) || ext === '.docx' || ext === '.doc') {
    doc = await parseDocx(buffer, filename, buffer.length);
  } else if (TEXT_TYPES.has(mime) || ['.txt', '.md', '.rtf', '.html', '.htm'].includes(ext)) {
    doc = parsePlainText(buffer, filename, mime || 'text/plain');
  } else {
    throw new Error(`Unsupported document type: ${mime} (${filename})`);
  }

  // SMAC-L1: Sanitize all text fields for invisible/hidden content before
  // any LLM sees this document. Strips zero-width Unicode, HTML comments,
  // ANSI escapes. Logs everything removed for audit trail.
  const sanitizationLog = sanitizeDocumentFields(doc);
  if (sanitizationLog.length > 0) {
    doc.sanitizationLog = sanitizationLog;
  }

  return doc;
}

// ── Plain Text Parser ───────────────────────────────────────────────────

/**
 * Best-effort RTF → plain text. Handles the common Word/TextEdit output:
 * binary destination groups (font/color/style tables), \par/\line/\tab control
 * words, \'hh hex escapes, and \uN unicode escapes. Not a full RTF parser, but
 * turns real-world RTF into readable prose instead of raw control codes.
 */
function rtfToPlainText(rtf: string): string {
  let text = rtf;
  // Drop binary/metadata destination groups we never want as document text.
  text = text.replace(
    /\{\\\*?\\(?:fonttbl|colortbl|stylesheet|info|pict|object|themedata|colorschememapping|latentstyles|datastore|listtable|listoverridetable|rsidtbl|generator|xmlnstbl)[\s\S]*?\}/gi,
    '',
  );
  // Decode hex escapes (\'hh) as Latin-1 bytes.
  text = text.replace(/\\'([0-9a-fA-F]{2})/g, (_m, h) => String.fromCharCode(parseInt(h, 16)));
  // Decode unicode escapes (\uNNNN, optionally followed by a fallback char).
  text = text.replace(/\\u(-?\d+)\??/g, (_m, n) => {
    let code = parseInt(n, 10);
    if (code < 0) code += 65536;
    return String.fromCharCode(code);
  });
  // Paragraph/line/tab/page breaks → whitespace.
  text = text
    .replace(/\\par[d]?\b/g, '\n')
    .replace(/\\line\b/g, '\n')
    .replace(/\\sect\b/g, '\n\n')
    .replace(/\\page\b/g, '\n\n')
    .replace(/\\tab\b/g, '\t');
  // Remove any remaining control words (\word with optional numeric arg + delimiter).
  text = text.replace(/\\[a-zA-Z]+-?\d*\s?/g, '');
  // Unescape literal backslash/braces, then drop structural group braces.
  text = text.replace(/\\([\\{}])/g, '$1').replace(/[{}]/g, '');
  // Tidy whitespace.
  return text.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function parsePlainText(
  buffer: Buffer,
  filename: string,
  mimeType: string,
): ParsedDocument {
  let fullText = buffer.toString('utf-8');

  // Strip HTML tags if the file is HTML
  if (mimeType === 'text/html' || filename.endsWith('.html') || filename.endsWith('.htm')) {
    fullText = fullText
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  } else if (mimeType === 'text/rtf' || mimeType === 'application/rtf' || filename.toLowerCase().endsWith('.rtf')) {
    // RTF is a control-word format ({\rtf1\ansi ...}) — the raw UTF-8 bytes are
    // markup, not prose. Strip it to plain text before structure detection so
    // downstream agents don't analyse \rtf control codes as document content.
    fullText = rtfToPlainText(fullText);
  }

  const wordCount = fullText.split(/\s+/).filter(w => w.length > 0).length;
  const pageCount = Math.max(1, Math.ceil(wordCount / 250));
  const parseWarnings = detectParseWarnings(fullText, 'plaintext');

  return {
    id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: filename,
    mimeType,
    size: buffer.length,
    pageCount,
    wordCount,
    fullText,
    sections: detectSections(fullText),
    tables: detectTables(fullText),
    definedTerms: detectDefinedTerms(fullText),
    parseMethod: 'plaintext',
    parsedAt: new Date().toISOString(),
    parseWarnings: parseWarnings.length > 0 ? parseWarnings : undefined,
  };
}
