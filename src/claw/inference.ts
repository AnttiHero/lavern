/**
 * Task Inference — The firm decides what needs doing.
 *
 * Given a document and the client profile, infers the appropriate
 * task (review, redesign, research memo, etc.), workflow, and context.
 *
 * Three strategies:
 * 1. Sidecar — `.lavern.md` file next to the document with explicit instructions
 * 2. LLM — Sonnet classification (~$0.01) using document content + client profile
 * 3. Heuristic — Extension + filename pattern matching (zero cost fallback)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import { mistralChat } from '../providers/mistral.js';
import type { LegalRequest, Audience, Jurisdiction, Moment } from '../types/index.js';
import type { IntensityLevel } from '../types/engagement.js';
import type { ClawProfile, SidecarConfig } from './types.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('CLAW-INFERENCE');

// ── Zod Schemas ─────────────────────────────────────────────────────────

const SidecarConfigSchema = z.object({
  task: z.string().optional(),
  request: z.string().optional(),
  workflow: z.string().optional(),
  intensity: z.enum(['quick', 'standard', 'thorough', 'maximal']).optional(),
  budget: z.number().positive().optional(),
  context: z.object({
    jurisdiction: z.string().optional(),
    audience: z.string().optional(),
    moment: z.string().optional(),
    focus: z.string().optional(),
  }).optional(),
  output: z.object({
    format: z.string().optional(),
    style: z.string().optional(),
  }).optional(),
}).passthrough();

const LlmInferenceSchema = z.object({
  type: z.enum(['contract_review', 'document_redesign', 'risk_assessment', 'legal_research', 'general']).catch('contract_review'),
  workflow: z.string().nullable().catch(null),
  reasoning: z.string().catch('No reasoning provided'),
  documentType: z.string().catch('Document'),
  riskLevel: z.enum(['low', 'medium', 'high']).catch('medium'),
});

// ── Inference Result ─────────────────────────────────────────────────────

export interface InferenceResult {
  request: LegalRequest;
  workflow?: string;
  intensity: IntensityLevel;
  method: 'sidecar' | 'llm' | 'heuristic';
  reasoning: string;
}

// ── Sidecar Detection ────────────────────────────────────────────────────

/**
 * Look for a sidecar instruction file next to the document.
 * Convention: `filename.lavern.md` or `filename.lavern.json`
 */
function findSidecar(documentPath: string): SidecarConfig | null {
  const dir = path.dirname(documentPath);
  const base = path.basename(documentPath, path.extname(documentPath));

  // Try: filename.lavern.md, filename.lavern.json, .lavern.md (directory-level)
  const candidates = [
    path.join(dir, `${base}.lavern.md`),
    path.join(dir, `${base}.lavern.json`),
    path.join(dir, '.lavern.md'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      try {
        const content = fs.readFileSync(candidate, 'utf-8');
        if (candidate.endsWith('.json')) {
          const raw = JSON.parse(content);
          const parsed = SidecarConfigSchema.safeParse(raw);
          if (!parsed.success) {
            logger.warn('Malformed sidecar', { path: candidate, error: parsed.error.message.slice(0, 200) });
            continue;
          }
          return parsed.data as SidecarConfig;
        }
        // Parse markdown sidecar — treat entire content as task instruction
        return { task: content.trim() };
      } catch {
        logger.warn('Failed to read sidecar', { path: candidate });
      }
    }
  }

  return null;
}

// ── LLM Inference ────────────────────────────────────────────────────────

const INFERENCE_PROMPT = `You are a law firm intake classifier. Given a document excerpt and client profile, determine what type of legal work this document needs.

Respond in JSON with these fields:
- type: one of "contract_review", "document_redesign", "risk_assessment", "legal_research", "general"
- workflow: one of "review", "roundtable", "adversarial", "counsel", "full-bench" (or null to let the router decide)
- reasoning: 1-2 sentence explanation
- documentType: what kind of document this is (e.g., "NDA", "Terms of Service", "Employment Agreement")
- riskLevel: "low", "medium", or "high"

Consider the client's concerns and jurisdiction when classifying.`;

async function llmInfer(
  documentExcerpt: string,
  filename: string,
  profile: ClawProfile,
): Promise<{ type: string; workflow: string | null; reasoning: string; documentType: string; riskLevel: string }> {
  const client = new Anthropic();

  const response = await client.messages.create({
    model: config.routerModel,
    max_tokens: 300,
    system: INFERENCE_PROMPT,
    messages: [{
      role: 'user',
      content: `DOCUMENT: ${filename}\n\nCLIENT: ${profile.company} (${profile.industry}, ${profile.jurisdiction})\nCONCERNS: ${profile.concerns.join(', ')}\nRISK APPETITE: ${profile.preferences.riskAppetite}\n\nDOCUMENT EXCERPT (first 2000 chars):\n${documentExcerpt.slice(0, 2000)}`,
    }],
  });

  const firstBlock = response.content?.[0];
  const text = firstBlock?.type === 'text' ? firstBlock.text : '';

  // Extract and validate JSON from response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const raw = JSON.parse(jsonMatch[0]);
      return LlmInferenceSchema.parse(raw);
    } catch {
      // Matched something that looks like JSON but isn't valid — fall through
    }
  }

  // Fallback
  return {
    type: 'contract_review',
    workflow: null,
    reasoning: 'LLM response did not contain valid JSON, falling back to contract review.',
    documentType: 'Document',
    riskLevel: 'medium',
  };
}

/** Mistral-based task inference — uses the Mistral chat API. */
async function mistralInfer(
  documentExcerpt: string,
  filename: string,
  profile: ClawProfile,
): Promise<z.infer<typeof LlmInferenceSchema>> {
  const result = await mistralChat({
    model: config.mistral.routerModel,
    messages: [
      { role: 'system', content: INFERENCE_PROMPT },
      {
        role: 'user',
        content: `DOCUMENT: ${filename}\n\nCLIENT: ${profile.company} (${profile.industry}, ${profile.jurisdiction})\nCONCERNS: ${profile.concerns.join(', ')}\nRISK APPETITE: ${profile.preferences.riskAppetite}\n\nDOCUMENT EXCERPT (first 2000 chars):\n${documentExcerpt.slice(0, 2000)}`,
      },
    ],
    temperature: 0.1,
    maxTokens: 300,
  });

  const text = result.message.content ?? '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const raw = JSON.parse(jsonMatch[0]);
      return LlmInferenceSchema.parse(raw);
    } catch {
      // Matched something that looks like JSON but isn't valid — fall through
    }
  }

  return {
    type: 'contract_review',
    workflow: null,
    reasoning: 'Mistral response did not contain valid JSON, falling back to contract review.',
    documentType: 'Document',
    riskLevel: 'medium',
  };
}

// ── Heuristic Inference ──────────────────────────────────────────────────

function heuristicInfer(
  filename: string,
  ext: string,
): { type: string; workflow: string | null; reasoning: string } {
  const lower = filename.toLowerCase();

  // Contracts & agreements → review
  if (lower.includes('contract') || lower.includes('agreement') || lower.includes('nda') ||
      lower.includes('lease') || lower.includes('license')) {
    return { type: 'contract_review', workflow: 'review', reasoning: `Filename suggests a contract/agreement: ${filename}` };
  }

  // Terms, policies → redesign (make them human-friendly)
  if (lower.includes('terms') || lower.includes('tos') || lower.includes('privacy') ||
      lower.includes('policy') || lower.includes('eula')) {
    return { type: 'document_redesign', workflow: 'roundtable', reasoning: `Filename suggests a user-facing policy document: ${filename}` };
  }

  // Briefs, memos → research
  if (lower.includes('brief') || lower.includes('memo') || lower.includes('research')) {
    return { type: 'legal_research', workflow: 'counsel', reasoning: `Filename suggests a research/memo document: ${filename}` };
  }

  // Default: PDF/DOCX → review, text/md → redesign
  if (ext === '.pdf' || ext === '.docx' || ext === '.doc') {
    return { type: 'contract_review', workflow: 'review', reasoning: `PDF/DOCX file — defaulting to contract review: ${filename}` };
  }

  return { type: 'document_redesign', workflow: null, reasoning: `Text file — defaulting to document redesign: ${filename}` };
}

// ── Main Inference ───────────────────────────────────────────────────────

/**
 * Infer the appropriate legal task for a document.
 *
 * Priority: sidecar > LLM > heuristic
 */
export async function inferTask(
  documentPath: string,
  documentContent: string,
  profile: ClawProfile,
): Promise<InferenceResult> {
  const filename = path.basename(documentPath);
  const ext = path.extname(documentPath).toLowerCase();

  // 1. Check for sidecar instructions
  const sidecar = findSidecar(documentPath);
  if (sidecar) {
    const requestType = sidecar.workflow
      ? (sidecar.workflow.includes('review') ? 'contract_review' : 'document_redesign')
      : 'general';

    const request: LegalRequest = {
      type: requestType as LegalRequest['type'],
      documentPath,
      requestText: sidecar.task ?? sidecar.request ?? `Review ${filename}`,
      context: {
        jurisdiction: (sidecar.context?.jurisdiction ?? profile.jurisdiction) as Jurisdiction,
        audience: (sidecar.context?.audience ?? 'enterprise') as Audience,
        moment: (sidecar.context?.moment ?? 'routine') as Moment,
        focus: sidecar.context?.focus,
      },
    };

    return {
      request,
      workflow: sidecar.workflow,
      intensity: sidecar.intensity ?? profile.preferences.intensity,
      method: 'sidecar',
      reasoning: `Sidecar instructions found: ${sidecar.task?.slice(0, 100) ?? 'explicit config'}`,
    };
  }

  // 2. Try LLM inference (provider-aware)
  try {
    const llmResult = config.provider === 'mistral'
      ? await mistralInfer(documentContent, filename, profile)
      : await llmInfer(documentContent, filename, profile);

    const request: LegalRequest = {
      type: llmResult.type as LegalRequest['type'],
      documentPath,
      requestText: `${llmResult.type === 'contract_review' ? 'Review' : 'Analyze'} ${filename} (${llmResult.documentType}). ${llmResult.reasoning}`,
      context: {
        jurisdiction: profile.jurisdiction as Jurisdiction,
        audience: 'enterprise' as Audience,
        moment: 'routine' as Moment,
      },
    };

    return {
      request,
      workflow: llmResult.workflow ?? undefined,
      intensity: llmResult.riskLevel === 'high' ? 'thorough'
        : llmResult.riskLevel === 'low' ? 'quick'
        : profile.preferences.intensity,
      method: 'llm',
      reasoning: llmResult.reasoning,
    };
  } catch (err) {
    // LLM failed — always log at warn level so users notice misconfiguration
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.warn('LLM inference failed, falling back to heuristic', { filename, error: errMsg.slice(0, 200) });
  }

  // 3. Heuristic fallback
  const heuristic = heuristicInfer(filename, ext);

  const request: LegalRequest = {
    type: heuristic.type as LegalRequest['type'],
    documentPath,
    requestText: `Review ${filename}`,
    context: {
      jurisdiction: profile.jurisdiction as Jurisdiction,
      audience: 'enterprise' as Audience,
      moment: 'routine' as Moment,
    },
  };

  return {
    request,
    workflow: heuristic.workflow ?? undefined,
    intensity: profile.preferences.intensity,
    method: 'heuristic',
    reasoning: heuristic.reasoning,
  };
}
