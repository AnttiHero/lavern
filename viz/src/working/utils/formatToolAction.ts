/**
 * formatToolAction — Maps MCP tool names to human-readable descriptions.
 *
 * Used in tooltips and activity feeds to show what an agent is doing.
 */

const TOOL_DESCRIPTIONS: Record<string, string> = {
  // Debate board tools
  post_finding: 'Posting a finding',
  challenge_finding: 'Challenging a finding',
  resolve_debate: 'Resolving a debate',
  get_debate_board: 'Reviewing findings',

  // Scoring tools
  get_baseline_scores: 'Checking baseline scores',
  post_after_scores: 'Submitting quality scores',
  score_document: 'Scoring the document',

  // Verification tools
  verify_step: 'Running verification',
  cross_verify: 'Cross-verifying work',
  self_verify: 'Self-checking output',

  // Knowledge & memory
  search_knowledge_base: 'Searching knowledge base',
  search_precedents: 'Searching precedents',
  save_precedent: 'Saving precedent',
  get_memory: 'Retrieving memory',
  store_memory: 'Storing insight',

  // Workflow control
  get_current_step: 'Checking progress',
  advance_step: 'Advancing to next step',
  post_gate_decision: 'Making gate decision',

  // Document operations
  read_document: 'Reading document',
  parse_document: 'Parsing document',

  // Quality
  quality_check: 'Running quality check',
  report_card: 'Generating report card',

  // Risk & pricing
  assess_risk: 'Assessing risk',
  price_engagement: 'Calculating pricing',

  // Agent SDK internals
  document_assembly_start: 'Starting document assembly',
  document_assembly_complete: 'Assembly complete',
  document_assembly_retry: 'Retrying assembly',
};

/**
 * Format a tool name into a human-readable action description.
 * Falls back to title-casing the tool name.
 */
export function formatToolAction(toolName: string): string {
  if (TOOL_DESCRIPTIONS[toolName]) {
    return TOOL_DESCRIPTIONS[toolName];
  }

  // Fallback: title-case the tool name
  return toolName
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Format an agent role and tool into a compact activity description.
 * e.g., "Ethics Auditor is posting a finding"
 */
export function formatActivity(agentRole: string, toolName: string): string {
  const displayName = agentRole
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
  const action = formatToolAction(toolName).toLowerCase();
  return `${displayName} is ${action.startsWith('posting') || action.startsWith('checking') || action.startsWith('running') || action.startsWith('reviewing') || action.startsWith('searching') || action.startsWith('resolving') || action.startsWith('starting') || action.startsWith('making') || action.startsWith('reading') || action.startsWith('scoring') || action.startsWith('calculating') || action.startsWith('assessing') || action.startsWith('retrieving') || action.startsWith('saving') || action.startsWith('cross') || action.startsWith('self') || action.startsWith('advancing') || action.startsWith('retrying') || action.startsWith('generating') || action.startsWith('submitting') || action.startsWith('challenging') || action.startsWith('parsing') || action.startsWith('storing')
    ? action
    : `working on ${action}`}`;
}
