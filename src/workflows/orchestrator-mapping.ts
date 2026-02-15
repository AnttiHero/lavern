/**
 * Orchestrator Mapping — Which orchestrator type runs which workflow.
 *
 * Each workflow template is matched to the orchestrator best suited to its
 * coordination pattern:
 *
 *   The Conductor  → legal-design (multidisciplinary synthesis, parallel fan-out,
 *                    debate rounds, verification loops)
 *   The Closer     → contract-review, pre-engagement (sequential pipelines with
 *                    quality gates, linear handoff chains)
 *   The Professor  → research-memo (deep investigation, citation validation,
 *                    adversarial stress-testing)
 *   The Fixer      → simple-query (rapid triage, single-specialist dispatch,
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
  // ── The Conductor: multidisciplinary synthesis ──────────────────────────
  // 10-step pipeline with parallel fan-out, two debate rounds, verification
  // loops, and human gates. Requires managing 5+ specialist agents in parallel
  // and synthesising conflicting perspectives.
  'legal-design': 'orchestrator-conductor',

  // ── The Closer: sequential pipeline management ─────────────────────────
  // 6-step pipeline (contract-review) and 7-step pipeline (pre-engagement).
  // Linear handoff chains with quality gates. The Closer excels at driving
  // work through gates to completion without drift.
  'contract-review': 'orchestrator-closer',
  'pre-engagement': 'orchestrator-closer',

  // ── The Professor: deep research + adversarial testing ─────────────────
  // 5-step pipeline with emphasis on citation quality, intellectual honesty,
  // and surviving adversarial review. The Professor will loop the researcher
  // and red team until the argument is bulletproof.
  'research-memo': 'orchestrator-professor',

  // ── The Fixer: rapid triage + single-specialist dispatch ───────────────
  // 4-step minimal pipeline. Classify → dispatch → gate → deliver.
  // The Fixer's speed and triage instinct make simple queries fast and cheap.
  'simple-query': 'orchestrator-fixer',
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
