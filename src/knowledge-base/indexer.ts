/**
 * Knowledge Base Indexer — Parse documents into searchable chunks.
 *
 * Pipeline: buffer → parseDocument() → walk sections → create chunks → SQLite.
 *
 * Chunking strategy:
 *   - Section-based: walks the section tree from detectSections().
 *     Each section ≤ MAX_CHUNK_WORDS → one chunk.
 *     Larger sections → split at paragraph boundaries (~TARGET_CHUNK_WORDS each).
 *   - Paragraph fallback: if no sections detected, split on \n\n boundaries.
 *
 * Reuses the existing document parser (PDF, DOCX, plaintext) and structure
 * detector for section heading recognition.
 */

import * as crypto from 'node:crypto';
import { parseDocument } from '../documents/parser.js';
import { getDb } from '../db/database.js';
import type { ParsedDocument, DocumentSection } from '../documents/types.js';

// ── Chunking Constants ────────────────────────────────────────────────

const MAX_CHUNK_WORDS = 2000;
const TARGET_CHUNK_WORDS = 1500;

// ── Types ─────────────────────────────────────────────────────────────

interface ChunkData {
  heading: string;
  content: string;
  level: number;
  chunkIndex: number;
}

export interface IndexResult {
  documentId: string;
  chunkCount: number;
  parsed: ParsedDocument;
}

// ── Main Entry Point ──────────────────────────────────────────────────

/**
 * Index a document into the knowledge base.
 *
 * Parses the document, splits it into section-based chunks, and inserts
 * all chunks into SQLite (in a transaction) for FTS5 search.
 */
export async function indexDocument(
  buffer: Buffer,
  filename: string,
  mimeType: string,
  collectionId: string,
  userId: string,
  metadata?: { docType?: string; jurisdiction?: string },
): Promise<IndexResult> {
  const parsed = await parseDocument(buffer, filename, mimeType);
  const documentId = `kbdoc-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const now = new Date().toISOString();
  const db = getDb();

  // Insert document record
  db.prepare(`
    INSERT INTO kb_documents (id, collection_id, user_id, filename, mime_type, file_size,
      word_count, page_count, doc_type, jurisdiction, metadata, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    documentId, collectionId, userId, filename, mimeType, buffer.length,
    parsed.wordCount, parsed.pageCount,
    metadata?.docType ?? '', metadata?.jurisdiction ?? '',
    JSON.stringify(metadata ?? {}), now,
  );

  // Generate chunks from sections (or fallback to paragraph splitting)
  const chunks = parsed.sections.length > 0
    ? extractSectionChunks(parsed.sections)
    : extractParagraphChunks(parsed.fullText);

  // Insert chunks in a transaction for atomicity + performance
  const insertChunk = db.prepare(`
    INSERT INTO kb_chunks (id, document_id, collection_id, user_id, heading, content,
      chunk_index, level, word_count, metadata, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertAll = db.transaction(() => {
    for (const chunk of chunks) {
      const chunkId = `kbc-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
      const wordCount = chunk.content.split(/\s+/).filter(w => w.length > 0).length;
      insertChunk.run(
        chunkId, documentId, collectionId, userId,
        chunk.heading, chunk.content, chunk.chunkIndex, chunk.level,
        wordCount,
        JSON.stringify({ docType: metadata?.docType, jurisdiction: metadata?.jurisdiction }),
        now,
      );
    }
  });
  insertAll();

  return { documentId, chunkCount: chunks.length, parsed };
}

// ── Section-Based Chunking ────────────────────────────────────────────

function extractSectionChunks(sections: DocumentSection[]): ChunkData[] {
  const chunks: ChunkData[] = [];
  let index = 0;

  function walk(sectionList: DocumentSection[], parentHeading: string): void {
    for (const section of sectionList) {
      const fullHeading = parentHeading
        ? `${parentHeading} > ${section.heading}`
        : section.heading;

      const words = section.content.split(/\s+/).filter(w => w.length > 0).length;

      if (words > 0 && words <= MAX_CHUNK_WORDS) {
        // Section fits in one chunk
        chunks.push({
          heading: fullHeading,
          content: section.content,
          level: section.level,
          chunkIndex: index++,
        });
      } else if (words > MAX_CHUNK_WORDS) {
        // Split large section at paragraph boundaries
        const subChunks = splitAtParagraphs(section.content, fullHeading, section.level);
        for (const sub of subChunks) {
          sub.chunkIndex = index++;
          chunks.push(sub);
        }
      }
      // Skip empty sections (words === 0) but still recurse into children

      // Recurse into children
      if (section.children.length > 0) {
        walk(section.children, fullHeading);
      }
    }
  }

  walk(sections, '');
  return chunks;
}

// ── Paragraph-Based Fallback ──────────────────────────────────────────

function extractParagraphChunks(fullText: string): ChunkData[] {
  return splitAtParagraphs(fullText, '(document)', 1);
}

// ── Shared Paragraph Splitter ─────────────────────────────────────────

function splitAtParagraphs(
  text: string,
  heading: string,
  level: number,
): ChunkData[] {
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 0);
  const chunks: ChunkData[] = [];
  let current = '';
  let currentWords = 0;

  for (const para of paragraphs) {
    const paraWords = para.split(/\s+/).filter(w => w.length > 0).length;

    if (currentWords + paraWords > TARGET_CHUNK_WORDS && current.length > 0) {
      // Flush current chunk
      chunks.push({ heading, content: current.trim(), level, chunkIndex: 0 });
      current = para;
      currentWords = paraWords;
    } else {
      current += (current ? '\n\n' : '') + para;
      currentWords += paraWords;
    }
  }

  // Flush remaining
  if (current.trim().length > 0) {
    chunks.push({ heading, content: current.trim(), level, chunkIndex: 0 });
  }

  return chunks;
}
