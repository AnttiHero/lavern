/**
 * API Request Validation Middleware — Zod schemas for all mutation endpoints.
 *
 * Validates:
 * - POST /api/sessions — both legacy and v5 request formats
 * - POST /api/sessions/:id/gate — gate decision bodies
 * - POST /api/clients — client registration bodies
 *
 * Also provides path safety checks: documentPath must not escape
 * allowed directories (no ../ traversal).
 */

import { z } from 'zod';
import * as path from 'node:path';
import type { FastifyRequest, FastifyReply } from 'fastify';

// ── Shared Enums ──────────────────────────────────────────────────────────

const MomentEnum = z.enum(['signup', 'checkout', 'exit', 'dispute', 'renewal', 'onboarding', 'routine']);

const AudienceEnum = z.enum(['consumer', 'smb', 'enterprise', 'employee']);

const JurisdictionEnum = z.enum(['US', 'EU', 'UK', 'CA', 'AU']);

const RequestTypeEnum = z.enum([
  'document_redesign', 'contract_review', 'legal_question',
  'legal_research', 'risk_assessment', 'general',
]);

// ── Path Safety ───────────────────────────────────────────────────────────

/**
 * Validate that a document path doesn't escape the working directory
 * via path traversal (../../ etc).
 */
export function isPathSafe(documentPath: string, basePath?: string): boolean {
  const base = basePath ?? process.cwd();
  const resolved = path.resolve(base, documentPath);
  return resolved.startsWith(path.resolve(base));
}

const safePathString = z.string().min(1).max(500).refine(
  (val) => !val.includes('\0'),
  { message: 'Path must not contain null bytes' },
);

// ── Session Options Schema ────────────────────────────────────────────────

const SessionOptionsSchema = z.object({
  budget: z.number().min(0.01).max(100).optional(),
  model: z.string().min(1).max(100).optional(),
  maxTurns: z.number().int().min(1).max(500).optional(),
  intensity: z.enum(['quick', 'standard', 'thorough', 'maximal']).optional(),
  /** Claude API effort — overrides intensity-derived effort when set explicitly. */
  effort: z.enum(['low', 'medium', 'high', 'max']).optional(),
  yoloMode: z.boolean().optional(),
  /** Enable 10-pass verification pipeline before delivery (default: true for review/full-bench). */
  verification: z.boolean().optional(),
  /** v18: LLM provider — per-session override. 'anthropic' (default), 'mistral' (EU sovereign), or 'managed' (Anthropic Managed Agents beta; scaffold only, execution path not yet wired). */
  provider: z.enum(['anthropic', 'mistral', 'managed']).optional(),
}).strict().optional();

// ── Context Schema ────────────────────────────────────────────────────────

const ContextSchema = z.object({
  moment: MomentEnum.optional(),
  audience: AudienceEnum.optional(),
  jurisdiction: JurisdictionEnum.optional(),
  documentType: z.string().max(200).optional(),
  focus: z.string().max(1000).optional(),
}).strict();

// ── Legal Request Schema (v5 format) ──────────────────────────────────────

const LegalRequestSchema = z.object({
  type: RequestTypeEnum,
  documentPath: safePathString.optional(),
  requestText: z.string().min(1).max(50000).optional(),
  context: ContextSchema.optional(),
  matterId: z.string().max(200).optional(),
}).strict();

// ── Create Session — Combined Schema ──────────────────────────────────────

/**
 * POST /api/sessions body accepts two formats:
 * 1. Legacy: { documentPath, context, options }
 * 2. v5:     { request: LegalRequest, workflow?, options }
 *
 * At least one of `documentPath` or `request` must be provided.
 */
export const CreateSessionSchema = z.object({
  // Legacy fields
  documentPath: safePathString.optional(),
  context: ContextSchema.optional(),
  // v5 fields
  request: LegalRequestSchema.optional(),
  workflow: z.string().min(1).max(100).optional(),
  // v12: Parsed documents from frontend document ingestion
  documents: z.array(z.object({
    id: z.string().min(1).max(200),
    name: z.string().min(1).max(500),
    mimeType: z.string().min(1).max(200),
    size: z.number().int().min(0).max(50_000_000),
    pageCount: z.number().int().min(0).max(50_000),
    wordCount: z.number().int().min(0).max(10_000_000),
    fullText: z.string().max(10_000_000),
    sections: z.array(z.object({
      heading: z.string().max(1000),
      level: z.number().int().min(1).max(10),
      content: z.string().max(5_000_000),
      startIndex: z.number().int().min(0),
      children: z.array(z.lazy(() => z.any())).max(200),
    }).passthrough()).max(500),
    tables: z.array(z.object({
      caption: z.string().max(1000).optional(),
      headers: z.array(z.string().max(1000)).max(100),
      rows: z.array(z.array(z.string().max(10_000)).max(100)).max(10_000),
    }).passthrough()).max(200),
    definedTerms: z.array(z.string().max(500)).max(5000),
    parseMethod: z.string().min(1).max(50),
    parsedAt: z.string().max(50),
  }).passthrough()).max(20).optional(),
  // v13: Team roles from frontend staffing
  team: z.array(z.string().min(1).max(100)).max(30).optional(),
  // Shared
  options: SessionOptionsSchema,
}).strict().refine(
  (data) => data.documentPath !== undefined || data.request !== undefined,
  {
    message: 'Either "documentPath" (legacy) or "request" (v5) must be provided',
  },
);

export type CreateSessionBody = z.infer<typeof CreateSessionSchema>;

// ── Gate Decision Schema ──────────────────────────────────────────────────

export const GateDecisionSchema = z.object({
  decision: z.enum(['approve', 'reject', 'modify']),
  notes: z.string().max(5000).optional(),
  gateType: z.string().max(100).optional(), // Optional: verify this matches the pending gate
}).strict();

export type GateDecisionBody = z.infer<typeof GateDecisionSchema>;

// ── Client Registration Schema ────────────────────────────────────────────

export const CreateClientSchema = z.object({
  type: z.enum(['human', 'agent']),
  name: z.string().min(1).max(200).optional(),
  callbackUrl: z.string().url().max(2000).optional(),
  autoApproveThreshold: z.number().min(0).max(1).optional(),
  capabilities: z.array(z.string().max(100)).max(50).optional(),
}).strict();

export type CreateClientBody = z.infer<typeof CreateClientSchema>;

// ── Derivative Generation Schema ─────────────────────────────────────────

export const DerivativeSchema = z.object({
  type: z.string().min(1).max(50),
  format: z.enum(['md', 'docx', 'html']).optional(),
  style: z.enum(['traditional', 'elegant', 'accessible']).optional(),
}).strict();

export type DerivativeBody = z.infer<typeof DerivativeSchema>;

// ── Validation Helper ─────────────────────────────────────────────────────

/**
 * Validate a request body against a Zod schema.
 * Returns the parsed data on success, or sends a 400 response on failure.
 */
export function validateBody<T>(
  schema: z.ZodType<T>,
  request: FastifyRequest,
  reply: FastifyReply,
): T | null {
  const result = schema.safeParse(request.body);

  if (!result.success) {
    const errors = result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
      code: issue.code,
    }));

    reply.status(400).send({
      error: 'Validation failed',
      details: errors,
    });
    return null;
  }

  return result.data;
}

/**
 * Validate that a documentPath is safe (no path traversal).
 * Call this after schema validation but before using the path.
 */
export function validateDocumentPath(
  documentPath: string,
  reply: FastifyReply,
  basePath?: string,
): boolean {
  if (!isPathSafe(documentPath, basePath)) {
    reply.status(400).send({
      error: 'Invalid document path: path traversal not allowed',
    });
    return false;
  }
  return true;
}
