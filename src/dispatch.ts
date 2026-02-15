/**
 * Dispatch — The top-level entry point for The Shem.
 *
 * Flow:
 * 1. Create session
 * 2. Route request (LLM or deterministic, or use forceWorkflow override)
 * 3. If router selected legal-design + has documentPath → call runTheShem() (backward compat)
 * 4. Otherwise → call runGenericWorkflow() with the selected template
 *
 * `runTheShem(documentPath, context, options)` still works for backward compatibility.
 * `dispatch(request, options)` is the preferred entry point.
 */

import { runTheShem, type SchemOptions } from './orchestrator.js';
import { runGenericWorkflow } from './workflows/executor.js';
import { routeRequest } from './router/router.js';
import { workflowRegistry } from './workflows/registry.js';
import { SessionState } from './session/session-state.js';
import type { LegalRequest, DocumentContext, Moment, Audience, Jurisdiction } from './types/index.js';
import type { GateResolver } from './gates/gate-resolver.js';
import { type IntensityLevel, effortForIntensity } from './types/engagement.js';

// Ensure templates are registered
import './workflows/index.js';

export interface DispatchOptions extends SchemOptions {
  /** Force a specific workflow template instead of routing */
  forceWorkflow?: string;
  /** Use LLM-based routing (default: true). Set to false for deterministic-only. */
  useLlmRouter?: boolean;
  /** Model to use for LLM routing (default: claude-sonnet-4-5-20250929) */
  routerModel?: string;
  /** v8: Skip pre-engagement workflow (for backward compat or when matter already exists) */
  skipPreEngagement?: boolean;
  /** v8: Matter ID — loads the matter's selected team into the session */
  matterId?: string;
  /** v9: Engagement intensity level — controls team size, gate frequency, budget */
  intensity?: IntensityLevel;
  /** v9: YOLO mode — auto-approve all gates, fully automated */
  yoloMode?: boolean;
}

/**
 * Dispatch a legal request through the appropriate workflow.
 *
 * This is the universal entry point. It routes the request,
 * selects the workflow, and runs it.
 */
export async function dispatch(
  request: LegalRequest,
  options: DispatchOptions = {},
): Promise<SessionState> {

  // Create session
  const session = options.session ?? new SessionState(undefined, {
    gateResolver: options.gateResolver,
    budgetUsd: options.maxBudgetUsd,
  });

  // v8: If a matterId is provided, attach matter record context to the session
  // (The matter's selectedTeam will be used by the executor to filter agents)
  if (options.matterId && request.matterId) {
    // Matter data is expected to be pre-loaded on the session by the API layer
    // This is a signal to the executor to use session.selectedTeam
  }

  // v10: Resolve effort — explicit effort wins, otherwise derive from intensity
  if (!options.effort && options.intensity) {
    options.effort = effortForIntensity(options.intensity);
  }

  // Route request (or use forced workflow)
  let workflowId: string;

  if (options.forceWorkflow) {
    // Forced workflow — skip routing
    workflowId = options.forceWorkflow;
    request.routerClassification = {
      requestType: 'full_pipeline',
      complexity: 'medium',
      riskLevel: 'medium',
      selectedWorkflow: workflowId,
      selectedSpecialists: [],
      requiresDebate: false,
      requiresEthicsFirst: false,
      requiresConsistencyCheck: false,
      reasoning: `Workflow forced by user: ${workflowId}`,
    };
  } else {
    // Normal routing (LLM or deterministic)
    const classification = await routeRequest(request, session, {
      useLlm: options.useLlmRouter ?? true,
      model: options.routerModel,
    });
    workflowId = classification.selectedWorkflow;
  }

  // If legal-design + has documentPath → backward compat path
  if (workflowId === 'legal-design' && request.documentPath) {
    const context: DocumentContext = {
      moment: (request.context?.moment as Moment) ?? 'signup',
      audience: (request.context?.audience as Audience) ?? 'consumer',
      jurisdiction: (request.context?.jurisdiction as Jurisdiction) ?? 'US',
      documentType: request.context?.documentType,
      focus: request.context?.focus,
    };

    return runTheShem(request.documentPath, context, {
      ...options,
      session,
    });
  }

  // Generic workflow path
  const template = workflowRegistry.get(workflowId);
  if (!template) {
    throw new Error(`Unknown workflow template: ${workflowId}. Available: ${workflowRegistry.list().map(t => t.id).join(', ')}`);
  }

  const classification = request.routerClassification!;
  session.workflowTemplateId = template.id;

  return runGenericWorkflow(request, template, classification, session, options);
}
