/**
 * toolLabels — Shared tool label maps for the Working view.
 *
 * Extracted from AgentThinkingBubble so that both the thinking bubbles
 * and the new ActivityCard can render human-readable tool descriptions.
 */

/** Human-readable labels for MCP tools. */
export const TOOL_LABELS: Record<string, string> = {
  'read_document': 'Reading document',
  'search_sections': 'Searching sections',
  'analyze_heading_structure': 'Checking heading structure',
  'check_wcag_compliance': 'Checking accessibility',
  'compute_readability': 'Measuring readability',
  'calculate_readability_score': 'Measuring readability',
  'search_case_law': 'Researching case law',
  'search_precedents': 'Checking precedents',
  'read_memory': 'Consulting memory',
  'search_knowledge_base': 'Searching knowledge base',
  'score_dimensions': 'Scoring dimensions',
  'price_risk': 'Pricing risk',
  'measure_visual_hierarchy': 'Analyzing visual hierarchy',
  'run_contrast_check': 'Checking color contrast',
  'measure_sentence_length': 'Measuring sentence length',
  'count_passive_voice': 'Counting passive voice',
  'semantic_diff': 'Comparing semantics',
  'clause_comparison': 'Comparing clauses',
  'defined_term_consistency_check': 'Checking defined terms',
  'restructure_heading_tree': 'Restructuring headings',
  'rebuild_pdf_bookmarks': 'Rebuilding bookmarks',
  'simplify_sentence_structure': 'Simplifying sentences',
  'convert_passive_to_active': 'Converting to active voice',
  'split_compound_sentences': 'Splitting long sentences',
  'apply_revision_guidance': 'Applying revisions',
  'recalculate_readability': 'Recalculating readability',
  'merge_revision_layers': 'Merging revisions',
  'generate_change_log': 'Generating change log',
};

/** Emoji icons for tools shown in the feed. */
export const TOOL_ICONS: Record<string, string> = {
  'read_document': '\uD83D\uDCC4',
  'search_sections': '\uD83D\uDD0D',
  'analyze_heading_structure': '\uD83D\uDCCA',
  'check_wcag_compliance': '\u267F',
  'compute_readability': '\uD83D\uDCD6',
  'calculate_readability_score': '\uD83D\uDCD6',
  'search_case_law': '\u2696\uFE0F',
  'search_precedents': '\uD83D\uDCDA',
  'read_memory': '\uD83E\uDDE0',
  'search_knowledge_base': '\uD83D\uDCDA',
  'score_dimensions': '\uD83D\uDCD0',
  'price_risk': '\uD83D\uDCB0',
  'measure_visual_hierarchy': '\uD83D\uDCCA',
  'run_contrast_check': '\uD83C\uDFA8',
  'measure_sentence_length': '\uD83D\uDCCF',
  'count_passive_voice': '\u270D\uFE0F',
  'semantic_diff': '\uD83D\uDD00',
  'clause_comparison': '\uD83D\uDD0D',
  'defined_term_consistency_check': '\u2611\uFE0F',
  'restructure_heading_tree': '\uD83C\uDFD7\uFE0F',
  'rebuild_pdf_bookmarks': '\uD83D\uDD16',
  'simplify_sentence_structure': '\u2702\uFE0F',
  'convert_passive_to_active': '\u26A1',
  'split_compound_sentences': '\u2702\uFE0F',
  'apply_revision_guidance': '\uD83D\uDD27',
  'recalculate_readability': '\uD83D\uDCD6',
  'merge_revision_layers': '\uD83D\uDD00',
  'generate_change_log': '\uD83D\uDCDD',
};

/** Tools worth showing as activity in the feed (analysis, not infrastructure). */
export const INTERESTING_TOOLS = new Set([
  'read_document', 'search_sections', 'analyze_heading_structure',
  'check_wcag_compliance', 'compute_readability', 'calculate_readability_score',
  'search_case_law', 'search_precedents', 'read_memory', 'search_knowledge_base',
  'score_dimensions', 'price_risk', 'measure_visual_hierarchy', 'run_contrast_check',
  'measure_sentence_length', 'count_passive_voice', 'semantic_diff',
  'clause_comparison', 'defined_term_consistency_check', 'restructure_heading_tree',
  'rebuild_pdf_bookmarks', 'simplify_sentence_structure', 'convert_passive_to_active',
  'split_compound_sentences', 'apply_revision_guidance', 'recalculate_readability',
  'merge_revision_layers', 'generate_change_log',
]);

/** Get human-readable label for a tool name. */
export function formatToolName(tool: string): string {
  if (TOOL_LABELS[tool]) return TOOL_LABELS[tool];
  const label = tool.replace(/_/g, ' ');
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Get emoji icon for a tool. */
export function toolIcon(tool: string): string {
  return TOOL_ICONS[tool] ?? '\uD83D\uDD27';
}
