import { describe, expect, it } from 'vitest';
import type { FrontendParsedDocument } from '../briefing/hooks/useDocumentUpload.js';
import {
  fitParsedDocumentsForStorage,
  normalizeParsedDocumentsForSession,
} from '../briefing/utils/sessionDocuments.js';

function makeParsedDocument(overrides: Partial<FrontendParsedDocument> = {}): FrontendParsedDocument {
  return {
    id: 'doc-1',
    name: '990163_0001597.pdf',
    mimeType: 'application/pdf',
    size: 102_800_000,
    pageCount: 1041,
    wordCount: 363_487,
    fullText: 'Important extracted legal text. '.repeat(1000),
    sections: [],
    tables: [],
    definedTerms: [],
    parseMethod: 'pdf-parse',
    parsedAt: '2026-06-09T00:00:00.000Z',
    ...overrides,
  };
}

describe('session document normalization', () => {
  it('bounds large parsed document structures before session submission', () => {
    const sections = Array.from({ length: 750 }, (_, index) => ({
      heading: `Section ${index}`,
      level: 1,
      content: 'x'.repeat(100),
      startIndex: index,
      children: Array.from({ length: 250 }, (_, childIndex) => ({
        heading: `Child ${childIndex}`,
        level: 2,
        content: 'child',
        startIndex: childIndex,
        children: [],
      })),
    }));
    const tables = Array.from({ length: 700 }, () => ({
      headers: Array.from({ length: 120 }, (_, index) => `Header ${index}`),
      rows: Array.from({ length: 300 }, () => Array.from({ length: 120 }, () => 'cell')),
    }));
    const definedTerms = Array.from({ length: 5500 }, (_, index) => `Term ${index}`);

    const [normalized] = normalizeParsedDocumentsForSession([
      makeParsedDocument({ sections, tables, definedTerms }),
    ]);

    expect(normalized.sections).toHaveLength(500);
    expect(normalized.sections[0].children).toHaveLength(200);
    expect(normalized.tables).toHaveLength(500);
    expect(normalized.tables[0].headers).toHaveLength(100);
    expect(normalized.tables[0].rows).toHaveLength(250);
    expect(normalized.tables[0].rows[0]).toHaveLength(100);
    expect(normalized.definedTerms).toHaveLength(5000);
  });

  it('trims storage copies without dropping the session submission text', () => {
    const fullText = 'a'.repeat(200_000);
    const doc = makeParsedDocument({ fullText });

    const [forSession] = normalizeParsedDocumentsForSession([doc]);
    const [forStorage] = fitParsedDocumentsForStorage([doc], 50_000);

    expect(forSession.fullText).toHaveLength(200_000);
    expect(forStorage.fullText).toHaveLength(100_000);
  });
});
