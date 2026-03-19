/**
 * Knowledge Base Routes — Upload, search, and manage reference document collections.
 *
 * Collections group related documents (precedent contracts, playbooks, templates).
 * Documents are parsed, chunked by section, and indexed with FTS5 for search.
 * All endpoints require authentication (user-scoped).
 *
 *   POST   /api/knowledge-base/collections                   — Create collection
 *   GET    /api/knowledge-base/collections                   — List collections
 *   POST   /api/knowledge-base/collections/:collectionId/upload — Upload doc
 *   GET    /api/knowledge-base/search?q=...                  — Search all collections
 *   DELETE /api/knowledge-base/collections/:collectionId     — Delete collection
 *   DELETE /api/knowledge-base/documents/:documentId         — Delete document
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import * as crypto from 'node:crypto';
import { validateBody } from '../middleware/validation.js';
import { getDb } from '../../db/database.js';
import { indexDocument } from '../../knowledge-base/indexer.js';
import { listCollections, searchKnowledgeBase } from '../../knowledge-base/retriever.js';
import { SUPPORTED_EXTENSIONS, MAX_FILE_SIZE } from '../../documents/parser.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('KB');

// ── Helpers ──────────────────────────────────────────────────────────

function getRequestUserId(request: FastifyRequest): string | undefined {
  return (request as typeof request & { userId?: string }).userId;
}

// ── Validation Schemas ──────────────────────────────────────────────

const CreateCollectionSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  docType: z.enum(['precedent', 'playbook', 'regulation', 'prior_analysis', 'template', 'other']).optional(),
  jurisdiction: z.string().max(100).optional(),
  metadata: z.record(z.string(), z.string()).optional(),
}).strict();

type CreateCollectionBody = z.infer<typeof CreateCollectionSchema>;

// ── Route Registration ──────────────────────────────────────────────

export function registerKnowledgeBaseRoutes(fastify: FastifyInstance): void {

  // ── POST /api/knowledge-base/collections — Create a new collection ──

  fastify.post('/api/knowledge-base/collections', async (request, reply) => {
    const userId = getRequestUserId(request);
    if (!userId) return reply.status(401).send({ error: 'Authentication required.' });

    const body = validateBody<CreateCollectionBody>(CreateCollectionSchema, request, reply);
    if (!body) return;

    const id = `kbcol-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const now = new Date().toISOString();

    getDb().prepare(`
      INSERT INTO kb_collections (id, user_id, name, description, doc_type, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, userId, body.name,
      body.description ?? '',
      body.docType ?? '',
      JSON.stringify({ ...(body.metadata ?? {}), jurisdiction: body.jurisdiction ?? '' }),
      now, now,
    );

    return reply.status(201).send({
      id,
      name: body.name,
      description: body.description ?? '',
      docType: body.docType ?? '',
    });
  });

  // ── GET /api/knowledge-base/collections — List collections ──────────

  fastify.get('/api/knowledge-base/collections', async (request, reply) => {
    const userId = getRequestUserId(request);
    if (!userId) return reply.status(401).send({ error: 'Authentication required.' });

    const collections = listCollections(userId);
    return reply.send({ collections, total: collections.length });
  });

  // ── POST /api/knowledge-base/collections/:collectionId/upload ───────

  fastify.post('/api/knowledge-base/collections/:collectionId/upload', async (request, reply) => {
    const userId = getRequestUserId(request);
    if (!userId) return reply.status(401).send({ error: 'Authentication required.' });

    const { collectionId } = request.params as { collectionId: string };

    // Verify collection belongs to user
    const collection = getDb().prepare(
      'SELECT id, doc_type FROM kb_collections WHERE id = ? AND user_id = ?',
    ).get(collectionId, userId) as { id: string; doc_type: string } | undefined;

    if (!collection) {
      return reply.status(404).send({ error: `Collection not found: ${collectionId}` });
    }

    const data = await request.file();
    if (!data) {
      return reply.status(400).send({ error: 'No file uploaded. Send a multipart form with a file field.' });
    }

    // Validate file extension
    const ext = data.filename.toLowerCase().slice(data.filename.lastIndexOf('.'));
    if (!SUPPORTED_EXTENSIONS.has(ext)) {
      return reply.status(400).send({
        error: `Unsupported file type: ${ext}`,
        supported: Array.from(SUPPORTED_EXTENSIONS),
      });
    }

    // Read file buffer
    const chunks: Buffer[] = [];
    for await (const chunk of data.file) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    const buffer = Buffer.concat(chunks);

    if (buffer.length > MAX_FILE_SIZE) {
      return reply.status(400).send({
        error: `File too large (${(buffer.length / 1024 / 1024).toFixed(1)} MB). Maximum: ${MAX_FILE_SIZE / 1024 / 1024} MB.`,
      });
    }

    if (buffer.length === 0) {
      return reply.status(400).send({ error: 'File is empty.' });
    }

    try {
      const result = await indexDocument(
        buffer,
        data.filename,
        data.mimetype || 'application/octet-stream',
        collectionId,
        userId,
        { docType: collection.doc_type, jurisdiction: '' },
      );

      return reply.status(201).send({
        documentId: result.documentId,
        filename: data.filename,
        chunkCount: result.chunkCount,
        wordCount: result.parsed.wordCount,
        pageCount: result.parsed.pageCount,
        sectionsDetected: result.parsed.sections.length,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Document indexing failed';
      logger.error('Indexing failed', { filename: data.filename, error: err });
      return reply.status(500).send({ error: message });
    }
  });

  // ── GET /api/knowledge-base/search — Search across all collections ──

  fastify.get('/api/knowledge-base/search', async (request, reply) => {
    const userId = getRequestUserId(request);
    if (!userId) return reply.status(401).send({ error: 'Authentication required.' });

    const query = request.query as {
      q?: string;
      collection?: string;
      doc_type?: string;
      jurisdiction?: string;
      limit?: string;
    };

    if (!query.q || query.q.trim().length === 0) {
      return reply.status(400).send({ error: 'Query parameter "q" is required.' });
    }

    if (query.q.length > 500) {
      return reply.status(400).send({ error: 'Query must be under 500 characters.' });
    }

    const maxResults = query.limit ? Math.min(parseInt(query.limit, 10) || 10, 20) : 10;

    const results = searchKnowledgeBase({
      query: query.q,
      userId,
      collectionId: query.collection,
      docType: query.doc_type,
      jurisdiction: query.jurisdiction,
      maxResults,
    });

    return reply.send({
      results: results.map(r => ({
        chunkId: r.chunk_id,
        documentId: r.document_id,
        collectionId: r.collection_id,
        collectionName: r.collection_name,
        documentFilename: r.document_filename,
        heading: r.heading,
        content: r.content,
        wordCount: r.word_count,
        docType: r.doc_type,
        jurisdiction: r.jurisdiction,
      })),
      total: results.length,
      query: query.q,
    });
  });

  // ── DELETE /api/knowledge-base/collections/:collectionId ────────────

  fastify.delete('/api/knowledge-base/collections/:collectionId', async (request, reply) => {
    const userId = getRequestUserId(request);
    if (!userId) return reply.status(401).send({ error: 'Authentication required.' });

    const { collectionId } = request.params as { collectionId: string };

    const collection = getDb().prepare(
      'SELECT id, is_global FROM kb_collections WHERE id = ? AND (user_id = ? OR is_global = 1)',
    ).get(collectionId, userId) as { id: string; is_global: number } | undefined;

    if (!collection) {
      return reply.status(404).send({ error: `Collection not found: ${collectionId}` });
    }

    if (collection.is_global) {
      return reply.status(403).send({ error: 'Cannot delete reference collections.' });
    }

    // CASCADE handles kb_documents and kb_chunks
    getDb().prepare('DELETE FROM kb_collections WHERE id = ?').run(collectionId);

    return reply.send({ deleted: true, collectionId });
  });

  // ── DELETE /api/knowledge-base/documents/:documentId ────────────────

  fastify.delete('/api/knowledge-base/documents/:documentId', async (request, reply) => {
    const userId = getRequestUserId(request);
    if (!userId) return reply.status(401).send({ error: 'Authentication required.' });

    const { documentId } = request.params as { documentId: string };

    const doc = getDb().prepare(
      'SELECT id FROM kb_documents WHERE id = ? AND user_id = ?',
    ).get(documentId, userId);

    if (!doc) {
      return reply.status(404).send({ error: `Document not found: ${documentId}` });
    }

    // CASCADE handles kb_chunks
    getDb().prepare('DELETE FROM kb_documents WHERE id = ?').run(documentId);

    return reply.send({ deleted: true, documentId });
  });
}
