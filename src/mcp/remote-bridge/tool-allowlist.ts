/**
 * Remote MCP Bridge — Tool Allowlist (Stage 1, Counsel Subset).
 *
 * The Managed Agents service calls our bridge over HTTPS to invoke MCP tools.
 * Because the remote surface is far larger (internet-exposed) than the
 * in-process SDK surface (SessionState closure only), we pin exactly which
 * tools are reachable and deny everything else.
 *
 * Stage 1 covers the Counsel workflow — the lowest-blast-radius pilot:
 *   - no debate, no human gates, no document redesign
 *   - read-only memory access
 *   - knowledge-base lookups (all read-only, no mutations)
 *
 * When we expand to Review/Adversarial in Stage 3+, additional tools are
 * added to this allowlist explicitly. Do NOT loosen this by pattern match.
 */

/**
 * MCP tool names the remote bridge will expose for the Counsel workflow.
 * Mirrors the `availableTools` list in `src/workflows/templates/counsel.ts`
 * — minus the Claude Code built-ins (Read/Grep/Glob/Task/TodoWrite), which
 * are provided by the Managed Agents runtime itself, not by our bridge.
 */
export const COUNSEL_REMOTE_TOOLS = [
  // Workflow state machine
  'mcp__shem__get_current_step',
  'mcp__shem__advance_step',
  'mcp__shem__get_workflow_history',
  'mcp__shem__submit_handoff',
  'mcp__shem__get_handoffs',

  // Memory (read-only)
  'mcp__shem__query_institutional_memory',
  'mcp__shem__load_matter_memory',
  'mcp__shem__query_precedents',

  // Knowledge Base (read-only)
  'mcp__shem__search_knowledge_base',
  'mcp__shem__list_knowledge_base_collections',
  'mcp__shem__get_knowledge_base_entry',
  'mcp__shem__query_anti_patterns',
] as const;

export type CounselRemoteTool = (typeof COUNSEL_REMOTE_TOOLS)[number];

const ALLOWLIST = new Set<string>(COUNSEL_REMOTE_TOOLS);

/** True if `toolName` is reachable via the remote bridge. */
export function isRemoteToolAllowed(toolName: string): boolean {
  return ALLOWLIST.has(toolName);
}
