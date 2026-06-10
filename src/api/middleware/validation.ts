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
  'legal_research', 'risk_assessment', 'defence_disclosure',
  'defense_strategy', 'general',
]);

const ProviderEnum = z.enum(['anthropic', 'mistral', 'minimax', 'kimi', 'deepseek', 'local', 'managed']);
const MAX_SESSION_DOCUMENT_BYTES = 200 * 1024 * 1024;
const MAX_PARSED_TEXT_CHARS = 50_000_000;
const MAX_PARSED_TABLES = 10_000;

// ── Path Safety ───────────────────────────────────────────────────────────

/**
 * Validate that a document path doesn't escape the working directory
 * via path traversal (../../ etc).
 */
export function isPathSafe(documentPath: string, basePath?: string): boolean {
  const base = basePath ?? process.cwd();
  const root = path.resolve(base);
  const resolved = path.resolve(base, documentPath);
  // Must be the base dir itself or strictly inside it. Comparing against
  // `root + path.sep` stops a sibling directory that merely shares the prefix
  // (e.g. resolved "/data-evil" vs base "/data") from being accepted.
  return resolved === root || resolved.startsWith(root + path.sep);
}

const safePathString = z.string().min(1).max(500).refine(
  (val) => !val.includes('\0'),
  { message: 'Path must not contain null bytes' },
);

// ── Session Options Schema ────────────────────────────────────────────────

const SessionOptionsSchema = z.object({
  budget: z.number().min(0.01).max(500).optional(),
  model: z.string().min(1).max(100).optional(),
  maxTurns: z.number().int().min(1).max(500).optional(),
  intensity: z
    .enum(['quick', 'standard', 'thorough', 'maximal', 'maximum'])
    .transform((v) => (v === 'maximum' ? 'maximal' : v))
    .optional(),
  /** Claude API effort — overrides intensity-derived effort when set explicitly. */
  effort: z.enum(['low', 'medium', 'high', 'max']).optional(),
  yoloMode: z.boolean().optional(),
  /** Enable 10-pass verification pipeline before delivery (default: true for review/full-bench). */
  verification: z.boolean().optional(),
  /** LLM provider — per-session override. */
  provider: ProviderEnum.optional(),
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

const ParsedDocumentSchema = z.object({
  id: z.string().min(1).max(200),
  name: z.string().min(1).max(500),
  mimeType: z.string().min(1).max(200),
  size: z.number().int().min(0).max(MAX_SESSION_DOCUMENT_BYTES),
  pageCount: z.number().int().min(0).max(50_000),
  wordCount: z.number().int().min(0).max(10_000_000),
  fullText: z.string().max(MAX_PARSED_TEXT_CHARS),
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
  }).passthrough()).max(MAX_PARSED_TABLES),
  definedTerms: z.array(z.string().max(500)).max(5000),
  parseMethod: z.string().min(1).max(50),
  parsedAt: z.string().max(50),
}).passthrough();

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
  documents: z.array(ParsedDocumentSchema).max(20).optional(),
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

export const ContinuationSchema = z.object({
  answers: z.record(z.string().min(1).max(100), z.string().max(10_000)).default({}),
  documents: z.array(ParsedDocumentSchema).max(20).optional(),
  documentNotes: z.record(z.string().min(1).max(200), z.string().max(5_000)).default({}),
  instructions: z.string().max(20_000).default(''),
  continuationScope: z.enum(['high_level', 'section_by_section', 'responding_report']),
  deadline: z.string().max(200).optional(),
  budgetEnvelope: z.string().max(500).optional(),
}).strict();

export type ContinuationBody = z.infer<typeof ContinuationSchema>;

// ── Gate Decision Schema ──────────────────────────────────────────────────

export const GateDecisionSchema = z.object({
  decision: z.enum(['approve', 'reject', 'modify']),
  notes: z.string().max(5000).optional(),
  gateType: z.string().max(100).optional(), // Optional: verify this matches the pending gate
  // Free-text answer for 'clarification' gates (agent asked the user a question)
  answer: z.string().max(20_000).optional(),
}).strict();

export type GateDecisionBody = z.infer<typeof GateDecisionSchema>;

// ── Mid-Session Document Attachment Schema ────────────────────────────────

/**
 * POST /api/sessions/:id/documents — attach already-parsed documents to a
 * running session (e.g. evidence supplied while a clarification gate is
 * pending). Same document shape the frontend sends at session creation.
 */
export const AttachDocumentsSchema = z.object({
  documents: z.array(ParsedDocumentSchema).min(1).max(20),
}).strict();

export type AttachDocumentsBody = z.infer<typeof AttachDocumentsSchema>;

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

    request.log.warn({ errors }, 'validation_failed');

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
