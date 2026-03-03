/**
 * The Router — Classifies requests and selects the minimum viable workflow.
 *
 * v5: Deterministic classification rules.
 * v6: Two-tier routing — LLM-based with deterministic fallback.
 *
 * The Router:
 * 1. Reads the request (type, document path, text, context)
 * 2. Reads the available workflows from the registry
 * 3. Classifies the request using the LLM (or deterministic fallback)
 * 4. Validates the selected workflow exists
 * 5. Returns a RouterClassification with the selected workflow and specialists
 *
 * Falls back to deterministic rules if:
 * - LLM call fails for any reason
 * - LLM selects a non-existent workflow
 * - useLlm option is set to false
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import type { LegalRequest, RouterClassification } from '../types/index.js';
import type { SessionState } from '../session/session-state.js';
import { workflowRegistry } from '../workflows/registry.js';
import { routerPrompt } from './router-prompt.js';
import { RouterClassificationSchema } from './router-schema.js';
import { zodToOutputFormat } from '../types/output-schemas.js';
import { eventTimestamp } from '../events/event-bus.js';

// Ensure templates are registered
import '../workflows/index.js';

/**
 * Map v11 prompt-friendly pattern names to registered template IDs.
 *
 * The router prompt describes five patterns (counsel, review, adversarial,
 * roundtable, full-bench) which are intuitive for the LLM. But the workflow
 * registry's canonical templates use the original names (simple-query,
 * contract-review, research-memo, legal-design). The v11 templates register
 * backward-compat aliases, but those get overwritten with wrong step
 * definitions when the old templates import after them (see workflows/index.ts).
 *
 * This map normalizes LLM output to the correct canonical template IDs.
 */
const V11_TO_TEMPLATE: Record<string, string> = {
  'counsel':     'simple-query',
  'review':      'contract-review',
  'adversarial': 'research-memo',
  'roundtable':  'legal-design',
  'full-bench':  'full-bench',   // no rename — full-bench is canonical
};

export interface RouterOptions {
  /** Use LLM-based routing (default: true). Set to false for deterministic-only. */
  useLlm?: boolean;
  /** Model to use for LLM routing (default: claude-sonnet-4-5-20250929) */
  model?: string;
}

/**
 * Classify a request and select the appropriate workflow.
 *
 * Two-tier approach:
 * 1. If useLlm is true (default), try LLM-based classification
 * 2. If LLM fails or useLlm is false, use deterministic fallback
 * 3. Validate the selected workflow exists in the registry
 */
export async function routeRequest(
  request: LegalRequest,
  session: SessionState,
  options?: RouterOptions,
): Promise<RouterClassification> {

  let classification: RouterClassification;
  let routingMethod: 'llm' | 'deterministic' = 'deterministic';

  if (options?.useLlm !== false) {
    // Try LLM-based routing
    try {
      const llmResult = await llmClassify(request, options?.model);

      // Normalize v11 pattern names to canonical template IDs
      const mapped = V11_TO_TEMPLATE[llmResult.selectedWorkflow];
      if (mapped) {
        llmResult.selectedWorkflow = mapped;
      }

      // Validate the LLM's selected workflow actually exists
      const template = workflowRegistry.get(llmResult.selectedWorkflow);
      if (template) {
        classification = llmResult;
        routingMethod = 'llm';
      } else {
        // LLM hallucinated a workflow — fall back to deterministic
        console.warn(`[ROUTER] LLM returned unknown workflow "${llmResult.selectedWorkflow}" — falling back to deterministic routing`);
        classification = classifyRequest(request);
      }
    } catch (err) {
      // LLM call failed — fall back to deterministic
      console.warn('[ROUTER] LLM classification failed, falling back to deterministic routing:', err instanceof Error ? err.message : err);
      classification = classifyRequest(request);
    }
  } else {
    // Deterministic-only
    classification = classifyRequest(request);
  }

  // Store on the request for downstream use
  request.routerClassification = classification;

  // Emit routing decision event
  session.events.emitEvent({
    type: 'routing_decision',
    requestType: classification.requestType,
    selectedWorkflow: classification.selectedWorkflow,
    complexity: classification.complexity,
    reasoning: `[${routingMethod}] ${classification.reasoning}`,
    timestamp: eventTimestamp(),
  });

  return classification;
}

/**
 * LLM-based classification — calls the model with structured output.
 *
 * Uses query() with the RouterClassificationSchema as outputFormat.
 * Single-turn, no tools, no agents. Fast and cheap (~$0.01 per call).
 */
async function llmClassify(
  request: LegalRequest,
  model?: string,
): Promise<RouterClassification> {
  const workflowSummary = workflowRegistry.getSummaryForRouter();

  const userPrompt = buildRouterUserPrompt(request);

  const systemPromptText = `${routerPrompt}\n\n## Currently Registered Workflows\n\n${workflowSummary}`;

  const result = query({
    prompt: userPrompt,
    options: {
      systemPrompt: systemPromptText,
      model: model ?? 'claude-sonnet-4-5-20250929',
      maxTurns: 1,
      outputFormat: zodToOutputFormat(RouterClassificationSchema),
    },
  });

  // Consume the async generator to get the result
  let classificationResult: RouterClassification | null = null;

  for await (const message of result) {
    if ('type' in message && message.type === 'result') {
      const resultMessage = message as Record<string, unknown>;
      if (resultMessage.subtype === 'success' && resultMessage.structured_output) {
        // Parse and validate the structured output
        const parsed = RouterClassificationSchema.safeParse(resultMessage.structured_output);
        if (parsed.success) {
          classificationResult = parsed.data;
        }
      }
    }
  }

  if (!classificationResult) {
    throw new Error('LLM router did not return a valid classification');
  }

  return classificationResult;
}

/**
 * Build the user prompt for the Router from a LegalRequest.
 */
function buildRouterUserPrompt(request: LegalRequest): string {
  const parts: string[] = ['Classify this request:\n'];

  parts.push(`**Request Type**: ${request.type}`);

  if (request.documentPath) {
    parts.push(`**Document**: ${request.documentPath}`);
  }

  if (request.requestText) {
    parts.push(`**Request Text**: ${request.requestText}`);
  }

  if (request.matterId) {
    parts.push(`**Matter ID**: ${request.matterId} (existing client matter — check consistency)`);
  }

  if (request.context) {
    const ctx = request.context;
    if (ctx.moment) parts.push(`**Moment**: ${ctx.moment}`);
    if (ctx.audience) parts.push(`**Audience**: ${ctx.audience}`);
    if (ctx.jurisdiction) parts.push(`**Jurisdiction**: ${ctx.jurisdiction}`);
    if (ctx.documentType) parts.push(`**Document Type**: ${ctx.documentType}`);
    if (ctx.focus) parts.push(`**Focus**: ${ctx.focus}`);
  }

  parts.push('\nReturn your classification as structured JSON.');

  return parts.join('\n');
}

/**
 * Deterministic classification rules — matches the Router prompt's decision matrix.
 * This is the fallback when no LLM is available, and the primary classifier
 * during testing.
 */
export function classifyRequest(request: LegalRequest): RouterClassification {
  // Rule 1: Document redesign → legal-design (multidisciplinary panel, 10-step pipeline)
  if (request.type === 'document_redesign') {
    return {
      requestType: 'full_pipeline',
      complexity: 'high',
      riskLevel: 'medium',
      selectedWorkflow: 'legal-design',
      selectedSpecialists: [
        'design-reviewer', 'ethics-auditor', 'service-designer',
        'plain-language-specialist', 'client-proxy', 'synthesis-editor',
        'transformation-specialist', 'meaning-guardian',
      ],
      requiresDebate: true,
      requiresEthicsFirst: true,
      requiresConsistencyCheck: !!request.matterId,
      reasoning: 'Document redesign requires the legal-design pipeline with parallel expert panel, debate, and synthesis.',
    };
  }

  // Rule 2: Contract review → contract-review (specialist + evaluator + plain language)
  if (request.type === 'contract_review') {
    return {
      requestType: 'single_specialist',
      complexity: 'medium',
      riskLevel: 'medium',
      selectedWorkflow: 'contract-review',
      selectedSpecialists: [
        'contract-reviewer', 'plain-language-specialist', 'evaluator',
      ],
      requiresDebate: false,
      requiresEthicsFirst: false,
      requiresConsistencyCheck: !!request.matterId,
      reasoning: 'Contract review uses the contract-review pipeline with clause analysis, evaluator gate, and plain language summary.',
    };
  }

  // Rule 3: Legal research → research-memo (researcher + evaluator + red-team)
  if (request.type === 'legal_research') {
    return {
      requestType: 'single_specialist',
      complexity: 'medium',
      riskLevel: 'medium',
      selectedWorkflow: 'research-memo',
      selectedSpecialists: ['legal-researcher', 'evaluator', 'red-team'],
      requiresDebate: false,
      requiresEthicsFirst: false,
      requiresConsistencyCheck: !!request.matterId,
      reasoning: 'Legal research uses the research-memo pipeline: researcher produces memo, evaluator checks quality, red-team stress-tests.',
    };
  }

  // Rule 4: Risk assessment → simple-query (specialist + evaluator gate)
  if (request.type === 'risk_assessment') {
    return {
      requestType: 'single_specialist',
      complexity: 'low',
      riskLevel: 'low',
      selectedWorkflow: 'simple-query',
      selectedSpecialists: ['risk-pricer', 'evaluator'],
      requiresDebate: false,
      requiresEthicsFirst: false,
      requiresConsistencyCheck: !!request.matterId,
      reasoning: 'Risk assessment uses the simple-query pipeline with risk-pricer specialist and evaluator gate.',
    };
  }

  // Rule 5: Legal question → simple-query (specialist + evaluator gate)
  if (request.type === 'legal_question') {
    return {
      requestType: 'direct_answer',
      complexity: 'low',
      riskLevel: 'low',
      selectedWorkflow: 'simple-query',
      selectedSpecialists: ['evaluator'],
      requiresDebate: false,
      requiresEthicsFirst: false,
      requiresConsistencyCheck: !!request.matterId,
      reasoning: 'Simple legal question uses the simple-query pipeline with evaluator quality gate.',
    };
  }

  // Rule 6: General / fallback
  // If document path is present, treat as document work → contract-review
  if (request.documentPath) {
    return {
      requestType: 'single_specialist',
      complexity: 'medium',
      riskLevel: 'medium',
      selectedWorkflow: 'contract-review',
      selectedSpecialists: ['contract-reviewer', 'plain-language-specialist', 'evaluator'],
      requiresDebate: false,
      requiresEthicsFirst: false,
      requiresConsistencyCheck: !!request.matterId,
      reasoning: 'General request with document path — defaulting to contract-review pipeline.',
    };
  }

  // Default: simple-query for everything else
  return {
    requestType: 'direct_answer',
    complexity: 'low',
    riskLevel: 'low',
    selectedWorkflow: 'simple-query',
    selectedSpecialists: ['evaluator'],
    requiresDebate: false,
    requiresEthicsFirst: false,
    requiresConsistencyCheck: false,
    reasoning: 'General request without document — defaulting to simple-query pipeline.',
  };
}

/**
 * Get the Router prompt with available workflow context.
 * Used when wiring the LLM-based router.
 */
export function getRouterPromptWithContext(): string {
  const workflowSummary = workflowRegistry.getSummaryForRouter();
  return `${routerPrompt}\n\n## Available Workflows\n\n${workflowSummary}`;
}
