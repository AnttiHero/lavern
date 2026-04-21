/**
 * Dispatch — The top-level entry point for The Shem.
 *
 * Flow:
 * 1. Create session
 * 2. Route request (LLM or deterministic, or use forceWorkflow override)
 * 3. Look up the workflow template from the registry
 * 4. Run runGenericWorkflow() with the selected template
 *
 * v11: The legacy runTheShem() backward compat path is sunset.
 * All workflows go through runGenericWorkflow(). Eight workflow templates:
 * counsel, review, adversarial, roundtable, full-bench, legal-design,
 * pre-engagement, verification.
 */

import { type SchemOptions } from './orchestrator.js';
import { runGenericWorkflow } from './workflows/executor.js';
import { routeRequest } from './router/router.js';
import { workflowRegistry } from './workflows/registry.js';
import { SessionState } from './session/session-state.js';
import type { LegalRequest } from './types/index.js';
import type { GateResolver } from './gates/gate-resolver.js';
import { type IntensityLevel, effortForIntensity } from './types/engagement.js';

// Ensure templates are registered
import './workflows/index.js';

export interface DispatchOptions extends SchemOptions {
  /** Force a specific workflow template instead of routing */
  forceWorkflow?: string;
  /** Use LLM-based routing (default: true). Set to false for deterministic-only. */
  useLlmRouter?: boolean;
  /** Model to use for LLM routing (default: claude-sonnet-4-5) */
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
  // Clone options to avoid mutating the caller's object
  const opts = { ...options };

  // Create session
  const session = opts.session ?? new SessionState(undefined, {
    gateResolver: opts.gateResolver,
    budgetUsd: opts.maxBudgetUsd,
  });

  // v18: Store provider on session for per-session override
  if (opts.provider) {
    session.provider = opts.provider;
  }

  // v8: Matter data (including selectedTeam) is pre-loaded on the session by
  // the API layer when a matterId is provided. The executor reads session.selectedTeam.

  // v10: Resolve effort — explicit effort wins, otherwise derive from intensity
  if (!opts.effort && opts.intensity) {
    opts.effort = effortForIntensity(opts.intensity);
  }

  // Route request (or use forced workflow)
  let workflowId: string;

  if (opts.forceWorkflow) {
    // Forced workflow — skip routing
    workflowId = opts.forceWorkflow;
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
      useLlm: opts.useLlmRouter ?? true,
      model: opts.routerModel,
      provider: opts.provider,
    });
    workflowId = classification.selectedWorkflow;
  }

  // v11: All patterns (including roundtable, formerly legal-design) run through
  // runGenericWorkflow(). No special-case paths.

  // Look up template from registry
  const template = workflowRegistry.get(workflowId);
  if (!template) {
    throw new Error(`Unknown workflow template: ${workflowId}. Available: ${workflowRegistry.list().map(t => t.id).join(', ')}`);
  }

  const classification = request.routerClassification;
  if (!classification) {
    throw new Error('Router classification missing after routing — cannot dispatch workflow');
  }
  session.workflowTemplateId = template.id;

  return runGenericWorkflow(request, template, classification, session, opts);
}
