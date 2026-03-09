/**
 * Knowledge Base Retriever — Search and list KB content.
 *
 * Primary search: SQLite FTS5 with BM25 ranking (built-in, no dependencies).
 * Fallback: LIKE-based substring search if FTS query fails.
 *
 * All queries are user-scoped — user A never sees user B's knowledge base.
 */

import { getDb } from '../db/database.js';

// ── Types ─────────────────────────────────────────────────────────────

export interface KbSearchResult {
  chunk_id: string;
  document_id: string;
  collection_id: string;
  collection_name: string;
  document_filename: string;
  heading: string;
  content: string;
  level: number;
  word_count: number;
  doc_type: string;
  jurisdiction: string;
  rank: number;
}

export interface KbSearchOptions {
  query: string;
  userId: string;
  collectionId?: string;
  docType?: string;
  jurisdiction?: string;
  maxResults?: number;
}

export interface KbCollectionSummary {
  id: string;
  name: string;
  description: string;
  docType: string;
  documentCount: number;
  chunkCount: number;
  totalWords: number;
  createdAt: string;
}

// ── Full-Text Search ──────────────────────────────────────────────────

/**
 * Search the knowledge base using FTS5 full-text search with BM25 ranking.
 * Falls back to LIKE search if the FTS query fails (e.g., syntax issues).
 */
export function searchKnowledgeBase(options: KbSearchOptions): KbSearchResult[] {
  const maxResults = options.maxResults ?? 10;
  const ftsQuery = sanitizeFtsQuery(options.query);

  if (!ftsQuery) return [];

  try {
    return ftsSearch(ftsQuery, options, maxResults);
  } catch {
    // FTS query syntax error — fall back to LIKE search
    return fallbackLikeSearch(options, maxResults);
  }
}

function ftsSearch(
  ftsQuery: string,
  options: KbSearchOptions,
  maxResults: number,
): KbSearchResult[] {
  const db = getDb();

  // Build WHERE clause for metadata filters
  // Include user's own collections + global reference collections
  const conditions: string[] = ['(c.user_id = ? OR col.is_global = 1)'];
  const params: unknown[] = [options.userId];

  if (options.collectionId) {
    conditions.push('c.collection_id = ?');
    params.push(options.collectionId);
  }
  if (options.docType) {
    conditions.push('d.doc_type = ?');
    params.push(options.docType);
  }
  if (options.jurisdiction) {
    conditions.push('d.jurisdiction = ?');
    params.push(options.jurisdiction);
  }

  const whereClause = conditions.join(' AND ');

  // FTS5 query with BM25 ranking, joined to chunks + documents + collections
  const sql = `
    SELECT
      c.id AS chunk_id,
      c.document_id,
      c.collection_id,
      col.name AS collection_name,
      d.filename AS document_filename,
      c.heading,
      c.content,
      c.level,
      c.word_count,
      d.doc_type,
      d.jurisdiction,
      rank
    FROM kb_chunks_fts fts
    JOIN kb_chunks c ON c.rowid = fts.rowid
    JOIN kb_documents d ON d.id = c.document_id
    JOIN kb_collections col ON col.id = c.collection_id
    WHERE kb_chunks_fts MATCH ?
      AND ${whereClause}
    ORDER BY rank
    LIMIT ?
  `;

  return db.prepare(sql).all(ftsQuery, ...params, maxResults) as KbSearchResult[];
}

function fallbackLikeSearch(
  options: KbSearchOptions,
  maxResults: number,
): KbSearchResult[] {
  const db = getDb();
  const queryLower = options.query.toLowerCase();

  // Include user's own collections + global reference collections
  const conditions: string[] = ['(c.user_id = ? OR col.is_global = 1)'];
  const params: unknown[] = [options.userId];

  if (options.collectionId) {
    conditions.push('c.collection_id = ?');
    params.push(options.collectionId);
  }
  if (options.docType) {
    conditions.push('d.doc_type = ?');
    params.push(options.docType);
  }
  if (options.jurisdiction) {
    conditions.push('d.jurisdiction = ?');
    params.push(options.jurisdiction);
  }

  // Simple LIKE fallback — escape LIKE wildcard characters to prevent injection
  const escapedQuery = escapeLike(queryLower);
  conditions.push(`(LOWER(c.content) LIKE ? ESCAPE '\\' OR LOWER(c.heading) LIKE ? ESCAPE '\\')`);
  params.push(`%${escapedQuery}%`, `%${escapedQuery}%`);

  const sql = `
    SELECT
      c.id AS chunk_id,
      c.document_id,
      c.collection_id,
      col.name AS collection_name,
      d.filename AS document_filename,
      c.heading,
      c.content,
      c.level,
      c.word_count,
      d.doc_type,
      d.jurisdiction,
      0 AS rank
    FROM kb_chunks c
    JOIN kb_documents d ON d.id = c.document_id
    JOIN kb_collections col ON col.id = c.collection_id
    WHERE ${conditions.join(' AND ')}
    LIMIT ?
  `;

  params.push(maxResults);
  return db.prepare(sql).all(...params) as KbSearchResult[];
}

/**
 * Sanitize user query for FTS5 MATCH syntax.
 * Strips special characters (including FTS5 operators: - for NOT, " for phrase),
 * keeps meaningful words, uses OR matching.
 */
function sanitizeFtsQuery(query: string): string {
  // Strip everything except word chars and whitespace (removes -, ", *, etc.)
  const cleaned = query.replace(/[^\w\s]/g, ' ');

  const words = cleaned
    .split(/\s+/)
    .filter(w => w.length >= 2)
    // Strip any remaining hyphens/quotes from individual words (defense in depth)
    .map(w => w.replace(/["\\-]/g, ''));

  // Filter again after stripping (a word might become too short)
  const validWords = words.filter(w => w.length >= 2);

  if (validWords.length === 0) return '';

  // Quote each word and join with OR for broad matching
  return validWords.map(w => `"${w}"`).join(' OR ');
}

/**
 * Escape LIKE wildcard characters (%, _, \) for safe use in SQL LIKE patterns.
 * Must be used with ESCAPE '\\' in the SQL query.
 */
function escapeLike(s: string): string {
  return s.replace(/[%_\\]/g, '\\$&');
}

// ── Collection Listing ────────────────────────────────────────────────

/**
 * List all knowledge base collections for a user with aggregate stats.
 */
export function listCollections(userId: string): KbCollectionSummary[] {
  const db = getDb();
  return db.prepare(`
    SELECT
      col.id,
      col.name,
      col.description,
      col.doc_type AS docType,
      COUNT(DISTINCT d.id) AS documentCount,
      COUNT(c.id) AS chunkCount,
      COALESCE(SUM(c.word_count), 0) AS totalWords,
      col.created_at AS createdAt
    FROM kb_collections col
    LEFT JOIN kb_documents d ON d.collection_id = col.id
    LEFT JOIN kb_chunks c ON c.document_id = d.id
    WHERE (col.user_id = ? OR col.is_global = 1)
    GROUP BY col.id
    ORDER BY col.created_at DESC
  `).all(userId) as KbCollectionSummary[];
}

// ── Single Entry Retrieval ────────────────────────────────────────────

/**
 * Retrieve a specific knowledge base chunk by ID (user-scoped).
 */
export function getChunkById(chunkId: string, userId: string): KbSearchResult | undefined {
  const db = getDb();
  return db.prepare(`
    SELECT
      c.id AS chunk_id,
      c.document_id,
      c.collection_id,
      col.name AS collection_name,
      d.filename AS document_filename,
      c.heading,
      c.content,
      c.level,
      c.word_count,
      d.doc_type,
      d.jurisdiction,
      0 AS rank
    FROM kb_chunks c
    JOIN kb_documents d ON d.id = c.document_id
    JOIN kb_collections col ON col.id = c.collection_id
    WHERE c.id = ? AND (c.user_id = ? OR col.is_global = 1)
  `).get(chunkId, userId) as KbSearchResult | undefined;
}
