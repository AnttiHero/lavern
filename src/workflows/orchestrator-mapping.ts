/**
 * Orchestrator Mapping — Which orchestrator type runs which workflow.
 *
 * Each workflow template is matched to the orchestrator best suited to its
 * coordination pattern:
 *
 *   The Conductor  → roundtable, full-bench, legal-design (multidisciplinary
 *                    synthesis, parallel fan-out, debate rounds)
 *   The Closer     → review, pre-engagement (sequential pipelines with
 *                    quality gates, linear handoff chains)
 *   The Professor  → adversarial (stress-testing, citation validation,
 *                    adversarial challenge-response)
 *   The Fixer      → counsel (rapid triage, single-specialist dispatch,
 *                    minimal overhead)
 *
 * Design rationale:
 *   - Orchestrator-workers pattern works best when the orchestrator is
 *     specialised for the coordination pattern, not just the domain.
 *   - Compound failure rates mean different pipeline lengths need different
 *     management strategies. A 10-step pipeline needs a thorough conductor;
 *     a 4-step pipeline needs a fast fixer.
 *   - Scaling effort to query complexity is embedded in the orchestrator
 *     selection, not left to a generic agent.
 */

/**
 * Map a workflow template ID to the orchestrator role that should run it.
 * Returns undefined if no specific orchestrator is mapped (falls back to
 * the generic orchestrator prompt in the template).
 */
export function getOrchestratorForWorkflow(workflowId: string): string {
  return WORKFLOW_ORCHESTRATOR_MAP[workflowId] ?? 'orchestrator-conductor';
}

/**
 * Workflow ID → Orchestrator role mapping.
 *
 * The Conductor handles anything not explicitly mapped — it's the most
 * general-purpose orchestrator and can adapt to unfamiliar workflows.
 */
const WORKFLOW_ORCHESTRATOR_MAP: Record<string, string> = {
  // ── v11: Five Engagement Patterns ──────────────────────────────────────

  // The Fixer: rapid triage, single-specialist dispatch
  'counsel': 'orchestrator-fixer',

  // The Closer: sequential pipeline with quality gates
  'review': 'orchestrator-closer',
  'pre-engagement': 'orchestrator-closer',

  // The Professor: adversarial testing, intellectual honesty
  'adversarial': 'orchestrator-professor',

  // The Conductor: multidisciplinary synthesis, parallel fan-out, debate
  'roundtable': 'orchestrator-conductor',
  'full-bench': 'orchestrator-conductor',

  // Original flagship pipeline
  'legal-design': 'orchestrator-conductor',
};

/**
 * All orchestrator roles, in display order.
 * Useful for UI rendering and validation.
 */
export const ORCHESTRATOR_ROLES = [
  'orchestrator-conductor',
  'orchestrator-closer',
  'orchestrator-professor',
  'orchestrator-fixer',
] as const;

export type OrchestratorRole = typeof ORCHESTRATOR_ROLES[number];
