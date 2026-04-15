/**
 * Managed Agents executor — parallel to src/providers/mistral-executor.ts.
 *
 * Stage 0 scaffold. Throws until Stage 2 lands the real implementation.
 *
 * The contract, once implemented, is identical to `runMistralWorkflow`:
 * accept the same args, emit the same `ShemEvent` shapes, return the updated
 * `SessionState` on success. Downstream (viz, archive, delivery) must not
 * need to know which provider ran.
 */

import type { SessionState } from '../../session/session-state.js';
import type { LegalRequest, RouterClassification } from '../../types/index.js';
import type { WorkflowTemplate } from '../../types/workflow.js';
import type { SchemOptions } from '../../orchestrator.js';

/**
 * Run a workflow via Anthropic Managed Agents.
 *
 * NOT YET IMPLEMENTED. The executor entry in `src/workflows/executor.ts` is
 * guarded so this cannot be reached at runtime.
 */
export async function runManagedAgentsWorkflow(
  _request: LegalRequest,
  _template: WorkflowTemplate,
  _classification: RouterClassification,
  _session: SessionState,
  _options: SchemOptions = {},
): Promise<SessionState> {
  throw new Error(
    'runManagedAgentsWorkflow is scaffolded but not implemented. ' +
    'See docs/managed-agents-migration.md, Stage 2.'
  );
}
