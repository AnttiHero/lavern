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
 * Search the knowledge base using hybrid retrieval:
 * 1. BM25 keyword search (FTS5) with legal synonym expansion — over-fetches 3x
 * 2. N-gram overlap re-ranking — scores conceptual similarity
 * 3. Return top-k by combined score
 *
 * This catches both exact term matches (BM25) and conceptual matches (n-gram).
 * Falls back to LIKE search if the FTS query fails.
 */
export function searchKnowledgeBase(options: KbSearchOptions): KbSearchResult[] {
  const maxResults = options.maxResults ?? 10;
  const ftsQuery = sanitizeFtsQuery(options.query);

  if (!ftsQuery) return [];

  try {
    // Over-fetch 3x from BM25, then re-rank with n-gram overlap
    const candidates = ftsSearch(ftsQuery, options, maxResults * 3);
    if (candidates.length <= maxResults) return candidates;
    return rerankWithNgramOverlap(candidates, options.query, maxResults);
  } catch {
    // FTS query syntax error — fall back to LIKE search
    return fallbackLikeSearch(options, maxResults);
  }
}

/** Extract bigrams from text for conceptual similarity matching. */
function extractBigrams(text: string): Set<string> {
  const words = text.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(w => w.length >= 2);
  const bigrams = new Set<string>();
  for (let i = 0; i < words.length - 1; i++) {
    bigrams.add(`${words[i]} ${words[i + 1]}`);
  }
  return bigrams;
}

/** Re-rank BM25 candidates by n-gram overlap with the original query. */
function rerankWithNgramOverlap(
  candidates: KbSearchResult[],
  query: string,
  maxResults: number,
): KbSearchResult[] {
  const queryBigrams = extractBigrams(query);
  if (queryBigrams.size === 0) return candidates.slice(0, maxResults);

  const scored = candidates.map(candidate => {
    const contentBigrams = extractBigrams(candidate.content.slice(0, 2000));
    let overlap = 0;
    for (const bg of queryBigrams) {
      if (contentBigrams.has(bg)) overlap++;
    }
    const ngramScore = overlap / queryBigrams.size;
    // Combined score: BM25 rank position (inverted, normalized) + n-gram overlap
    const bm25Score = 1 / (1 + Math.abs(candidate.rank));
    return { candidate, combinedScore: bm25Score * 0.6 + ngramScore * 0.4 };
  });

  scored.sort((a, b) => b.combinedScore - a.combinedScore);
  return scored.slice(0, maxResults).map(s => s.candidate);
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

// ── Legal Synonym Expansion ──────────────────────────────────────────
//
// FTS5 is keyword-only. An agent searching "indemnification" won't find
// "indemnity" or "hold harmless". This synonym map covers the most common
// legal term variations so that searches catch related concepts.
//
// Each group is bidirectional: searching any term in a group expands to
// all terms in that group.

const LEGAL_SYNONYM_GROUPS: string[][] = [
  // Liability & indemnification
  ['indemnification', 'indemnity', 'hold harmless', 'indemnify'],
  ['liability', 'damages', 'liable'],
  ['limitation of liability', 'liability cap', 'cap on damages', 'liability limit'],
  // Termination & expiration
  ['termination', 'terminate', 'expiration', 'expire', 'cancellation', 'cancel'],
  ['cure period', 'remedy period', 'notice to cure'],
  // IP & ownership
  ['intellectual property', 'IP rights'],
  ['assignment', 'transfer', 'conveyance'],
  ['license', 'licence', 'licensing'],
  // Privacy & data
  ['personal data', 'personal information', 'PII', 'personally identifiable'],
  ['data processing', 'data protection', 'privacy'],
  ['GDPR', 'General Data Protection Regulation'],
  ['consent', 'opt in', 'opt out'],
  // Confidentiality
  ['confidential', 'confidentiality', 'proprietary', 'trade secret'],
  ['non disclosure', 'nondisclosure', 'NDA'],
  // Dispute resolution
  ['arbitration', 'mediation', 'dispute resolution', 'ADR'],
  ['governing law', 'choice of law', 'applicable law'],
  ['jurisdiction', 'venue', 'forum'],
  // Employment
  ['non compete', 'noncompete', 'restrictive covenant', 'competition restriction'],
  ['non solicitation', 'nonsolicitation'],
  ['severance', 'separation', 'termination payment'],
  // Financial
  ['payment', 'compensation', 'remuneration', 'fee'],
  ['penalty', 'liquidated damages', 'late fee'],
  ['warranty', 'guarantee', 'representation'],
  // Insurance
  ['insurance', 'coverage', 'policy'],
  ['deductible', 'excess', 'retention'],
  // Compliance
  ['compliance', 'regulatory', 'regulation'],
  ['audit', 'inspection', 'review'],
  // General contract
  ['amendment', 'modification', 'change', 'variation'],
  ['waiver', 'forbearance'],
  ['force majeure', 'act of God', 'unforeseeable circumstances'],
  ['severability', 'savings clause'],
  ['entire agreement', 'whole agreement', 'merger clause', 'integration clause'],
  ['successor', 'assign', 'assignee'],
];

// Build lookup: word → all synonyms in its group
const synonymLookup = new Map<string, string[]>();
for (const group of LEGAL_SYNONYM_GROUPS) {
  for (const term of group) {
    const lower = term.toLowerCase();
    const others = group.filter(t => t.toLowerCase() !== lower);
    const existing = synonymLookup.get(lower) ?? [];
    synonymLookup.set(lower, [...new Set([...existing, ...others])]);
  }
}

/**
 * Expand a query with legal synonyms.
 * If any word or phrase in the query matches a synonym group,
 * all synonyms from that group are added as OR alternatives.
 */
function expandWithSynonyms(words: string[]): string[] {
  const expanded = new Set(words);
  const queryLower = words.join(' ').toLowerCase();

  // Check multi-word phrases first (e.g., "limitation of liability")
  for (const [phrase, synonyms] of synonymLookup) {
    if (phrase.includes(' ') && queryLower.includes(phrase)) {
      for (const syn of synonyms) {
        // Add multi-word synonyms as single entries
        expanded.add(syn);
      }
    }
  }

  // Check individual words
  for (const word of words) {
    const syns = synonymLookup.get(word.toLowerCase());
    if (syns) {
      for (const syn of syns) {
        // Only add single-word synonyms as individual words
        if (!syn.includes(' ')) {
          expanded.add(syn);
        } else {
          // Multi-word synonyms: add each word
          for (const part of syn.split(/\s+/)) {
            if (part.length >= 2) expanded.add(part);
          }
        }
      }
    }
  }

  return [...expanded];
}

/**
 * Sanitize user query for FTS5 MATCH syntax.
 * Strips special characters (including FTS5 operators: - for NOT, " for phrase),
 * keeps meaningful words, uses OR matching.
 * v2: Expands queries with legal synonyms for better recall.
 */
/** @internal Exported for testing. */
export function sanitizeFtsQuery(query: string): string {
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

  // Expand with legal synonyms for better recall
  const expandedWords = expandWithSynonyms(validWords);

  // Quote each word and join with OR for broad matching
  return expandedWords.map(w => `"${w}"`).join(' OR ');
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
