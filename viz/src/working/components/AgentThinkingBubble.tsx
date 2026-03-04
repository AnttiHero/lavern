/**
 * AgentThinkingBubble — Ephemeral "agent is analyzing..." indicator.
 *
 * Shows at the bottom of the InsightFeed when agents are actively working.
 * Displays the agent's avatar with a breathing glow, an animated dots indicator,
 * and human-readable labels for the tools they're using.
 *
 * Only "interesting" tools are shown (reading, analysis, research).
 * Infrastructure tools (post_finding, record_resolution) are hidden
 * because they produce their own cards in the feed.
 */

import type { ActiveThinkingAgent } from '../hooks/useWorkingState.js';
import type { AgentProfile } from '../../staffing/hooks/useAgentProfiles.js';
import { AgentAvatar } from './AgentAvatar.js';
import { colors, fonts, radii, categoryColor } from '../../staffing/styles/tokens.js';

interface AgentThinkingBubbleProps {
  agent: ActiveThinkingAgent;
  profile?: AgentProfile;
}

/** Translate raw tool names to human-readable text. */
const TOOL_LABELS: Record<string, string> = {
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

/** Tools worth showing in the thinking bubble. */
const INTERESTING_TOOLS = new Set([
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

function formatToolName(tool: string): string {
  if (TOOL_LABELS[tool]) return TOOL_LABELS[tool];
  // Fallback: underscores → spaces, capitalize first letter
  const label = tool.replace(/_/g, ' ');
  return label.charAt(0).toUpperCase() + label.slice(1);
}

const TOOL_ICONS: Record<string, string> = {
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

function toolIcon(tool: string): string {
  return TOOL_ICONS[tool] ?? '\uD83D\uDD27';
}

export function AgentThinkingBubble({ agent, profile }: AgentThinkingBubbleProps) {
  const color = profile ? categoryColor(profile.category) : colors.textMuted;
  const displayName = profile?.displayName ?? agent.role.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  // Filter to interesting tools, take last 3
  const visibleTools = agent.toolsUsed
    .filter(t => INTERESTING_TOOLS.has(t))
    .slice(-3);

  return (
    <div style={styles.row}>
      <div style={{
        ...styles.avatarWrap,
        boxShadow: `0 0 8px ${color}40, 0 0 16px ${color}20`,
        animation: 'thinkingGlow 2s ease-in-out infinite',
      }}>
        <AgentAvatar role={agent.role} size="lg" profile={profile} />
      </div>

      <div style={{ ...styles.bubble, borderLeftColor: color }}>
        <div style={styles.header}>
          <span style={{ ...styles.agentName, color }}>{displayName}</span>
          <span style={styles.analyzing}>
            is analyzing
            <span style={styles.dots}>
              <span style={styles.dot1}>.</span>
              <span style={styles.dot2}>.</span>
              <span style={styles.dot3}>.</span>
            </span>
          </span>
        </div>

        {/* Tool activity labels */}
        {visibleTools.length > 0 && (
          <div style={styles.toolList}>
            {visibleTools.map((tool, i) => (
              <div key={`${tool}-${i}`} style={styles.toolItem}>
                <span style={styles.toolIcon}>{toolIcon(tool)}</span>
                <span style={styles.toolLabel}>{formatToolName(tool)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  row: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
  },
  avatarWrap: {
    borderRadius: '50%',
    flexShrink: 0,
  },
  bubble: {
    flex: 1,
    backgroundColor: colors.bgPanel,
    border: `1px solid ${colors.border}`,
    borderLeft: '3px solid',
    borderRadius: radii.md,
    padding: '10px 14px',
    minWidth: 0,
  },
  header: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 6,
  },
  agentName: {
    fontSize: 12,
    fontFamily: fonts.sans,
    fontWeight: 600,
  },
  analyzing: {
    fontSize: 12,
    fontFamily: fonts.sans,
    fontWeight: 400,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  dots: {
    display: 'inline',
    letterSpacing: 1,
  },
  dot1: {
    animation: 'dotPulse 1.4s ease-in-out 0s infinite',
  },
  dot2: {
    animation: 'dotPulse 1.4s ease-in-out 0.2s infinite',
  },
  dot3: {
    animation: 'dotPulse 1.4s ease-in-out 0.4s infinite',
  },
  toolList: {
    marginTop: 8,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 4,
  },
  toolItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  toolIcon: {
    fontSize: 12,
    flexShrink: 0,
    width: 16,
    textAlign: 'center' as const,
  },
  toolLabel: {
    fontSize: 11,
    fontFamily: fonts.sans,
    fontWeight: 400,
    color: colors.textDim,
  },
};
