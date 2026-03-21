/**
 * Document Routes — File upload and parsing endpoint.
 *
 * POST /api/documents/parse — Accepts multipart file upload, returns ParsedDocument.
 * Supports PDF, DOCX, TXT, MD, RTF, HTML.
 */

import type { FastifyInstance } from 'fastify';
import { parseDocument, SUPPORTED_EXTENSIONS, MAX_FILE_SIZE } from '../../documents/parser.js';

/**
 * Register document parsing routes.
 */
export function registerDocumentRoutes(fastify: FastifyInstance): void {

  /**
   * POST /api/documents/parse
   *
   * Accepts a multipart file upload. Returns the parsed document
   * with structural information (sections, tables, defined terms).
   *
   * Request: multipart/form-data with a single file field named "file"
   * Response: ParsedDocument JSON
   */
  fastify.post('/api/documents/parse', async (request, reply) => {
    try {
      const data = await request.file();

      if (!data) {
        return reply.status(400).send({
          error: 'No file uploaded',
          hint: 'Send a multipart/form-data request with a file field named "file"',
        });
      }

      // Validate file extension
      const filename = data.filename;
      const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
      if (!SUPPORTED_EXTENSIONS.has(ext)) {
        return reply.status(400).send({
          error: `Unsupported file type: ${ext}`,
          supported: Array.from(SUPPORTED_EXTENSIONS).join(', '),
        });
      }

      // Read the file buffer
      const chunks: Buffer[] = [];
      for await (const chunk of data.file) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
      }
      const buffer = Buffer.concat(chunks);

      // Validate file size
      if (buffer.length > MAX_FILE_SIZE) {
        return reply.status(400).send({
          error: `File too large: ${(buffer.length / 1024 / 1024).toFixed(1)} MB`,
          maxSizeMb: MAX_FILE_SIZE / 1024 / 1024,
        });
      }

      // Parse the document (includes SMAC-L1 sanitization)
      const mimeType = data.mimetype || 'application/octet-stream';
      const parsed = await parseDocument(buffer, filename, mimeType);

      // Audit trail: log if invisible/hidden content was stripped
      if (parsed.sanitizationLog && parsed.sanitizationLog.length > 0) {
        fastify.log.warn({
          msg: 'document_sanitized',
          filename,
          removals: parsed.sanitizationLog,
        });
      }

      return reply.status(200).send(parsed);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Document parsing failed';
      fastify.log.error(err, 'Document parse error');
      return reply.status(500).send({ error: message });
    }
  });
}
