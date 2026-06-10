import type { FrontendParsedDocument } from '../hooks/useDocumentUpload.js';

const MAX_DOCUMENTS = 20;
const MAX_FULL_TEXT_CHARS = 50_000_000;
const MAX_SECTIONS = 500;
const MAX_CHILDREN = 200;
const MAX_SECTION_CONTENT_CHARS = 5_000_000;
const MAX_TABLES = 500;
const MAX_TABLE_HEADERS = 100;
const MAX_TABLE_ROWS = 250;
const MAX_TABLE_CELLS = 100;
const MAX_TABLE_CELL_CHARS = 1_000;
const MAX_DEFINED_TERMS = 5_000;

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

function int(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : fallback;
  return Math.min(Math.max(n, min), max);
}

function normalizeSection(section: FrontendParsedDocument['sections'][number], depth = 0): FrontendParsedDocument['sections'][number] {
  const children = Array.isArray(section.children) && depth < 8
    ? section.children.slice(0, MAX_CHILDREN).map(child => normalizeSection(child, depth + 1))
    : [];

  return {
    heading: text(section.heading, 1_000),
    level: int(section.level, 1, 1, 10),
    content: text(section.content, MAX_SECTION_CONTENT_CHARS),
    startIndex: int(section.startIndex, 0, 0, Number.MAX_SAFE_INTEGER),
    children,
  };
}

function normalizeTable(table: FrontendParsedDocument['tables'][number]): FrontendParsedDocument['tables'][number] {
  return {
    ...(table.caption ? { caption: text(table.caption, 1_000) } : {}),
    headers: Array.isArray(table.headers)
      ? table.headers.slice(0, MAX_TABLE_HEADERS).map(header => text(header, MAX_TABLE_CELL_CHARS))
      : [],
    rows: Array.isArray(table.rows)
      ? table.rows.slice(0, MAX_TABLE_ROWS).map(row => (
          Array.isArray(row)
            ? row.slice(0, MAX_TABLE_CELLS).map(cell => text(cell, MAX_TABLE_CELL_CHARS))
            : []
        ))
      : [],
  };
}

export function normalizeParsedDocumentForSession(doc: FrontendParsedDocument): FrontendParsedDocument {
  return {
    id: text(doc.id, 200) || `doc-${Date.now()}`,
    name: text(doc.name, 500) || 'document',
    mimeType: text(doc.mimeType, 200) || 'application/octet-stream',
    size: int(doc.size, 0, 0, 200 * 1024 * 1024),
    pageCount: int(doc.pageCount, 0, 0, 50_000),
    wordCount: int(doc.wordCount, 0, 0, 10_000_000),
    fullText: text(doc.fullText, MAX_FULL_TEXT_CHARS),
    sections: Array.isArray(doc.sections)
      ? doc.sections.slice(0, MAX_SECTIONS).map(section => normalizeSection(section))
      : [],
    tables: Array.isArray(doc.tables)
      ? doc.tables.slice(0, MAX_TABLES).map(table => normalizeTable(table))
      : [],
    definedTerms: Array.isArray(doc.definedTerms)
      ? doc.definedTerms.slice(0, MAX_DEFINED_TERMS).map(term => text(term, 500))
      : [],
    parseMethod: text(doc.parseMethod, 50) || 'plaintext',
    parsedAt: text(doc.parsedAt, 50) || new Date().toISOString(),
  };
}

export function normalizeParsedDocumentsForSession(docs: FrontendParsedDocument[]): FrontendParsedDocument[] {
  return docs.slice(0, MAX_DOCUMENTS).map(normalizeParsedDocumentForSession);
}

export function fitParsedDocumentsForStorage(docs: FrontendParsedDocument[], maxChars = 4_500_000): FrontendParsedDocument[] {
  const normalized = normalizeParsedDocumentsForSession(docs);
  if (JSON.stringify(normalized).length <= maxChars) {
    return normalized;
  }

  return normalized.map(doc => ({
    ...doc,
    fullText: doc.fullText.slice(0, 100_000),
  }));
}
