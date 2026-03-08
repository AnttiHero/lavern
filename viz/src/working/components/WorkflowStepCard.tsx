/**
 * WorkflowStepCard — Beautiful phase transition divider in the feed.
 *
 * v18: Upgraded from plain horizontal rule to warm, editorial-style
 * phase separator with serif italic text and gradient rules.
 * Includes a warm completion message for the previous step.
 */

import type { StreamCard } from '../hooks/useWorkingState.js';
import { STEP_LABELS } from '../../types/events.js';
import { PHASE_DESCRIPTIONS } from '../data/phase-descriptions.js';
import { colors, fonts } from '../../staffing/styles/tokens.js';

type StepData = Extract<StreamCard, { kind: 'workflow_step' }>;

interface WorkflowStepCardProps {
  card: StepData;
}

/** Warm transition messages. */
const TRANSITION_PHRASES: Record<string, string> = {
  'parallel_analysis': 'Your team is diving in',
  'debate_1': 'Analysis complete \u2014 time to challenge the findings',
  'ethics_gate': 'Debate resolved \u2014 ethics review next',
  'transformation': 'Green light \u2014 transforming your document',
  'parallel_verification': 'Transformation done \u2014 verifying the work',
  'debate_2': 'Verification passed \u2014 one final review',
  'meaning_gate': 'Checking that every legal meaning is preserved',
  'synthesis': 'Almost there \u2014 assembling your final document',
  'final_gate': 'Final partner review before delivery',
  'delivered': '\u2728 Your work is ready!',
  'specialist_analysis': 'Your specialist is starting the deep dive',
  'evaluator_gate': 'Analysis complete \u2014 quality check time',
  'plain_language_review': 'Making everything crystal clear',
  'contract_analysis': 'Reviewing every clause and condition',
  'build': 'Building the strongest possible arguments',
  'attack': 'Time for the red team \u2014 stress testing your position',
  'synthesize': 'Surviving arguments are being combined',
  'specialist_execution': 'Your specialist is working through the problem',
  'debate': 'The roundtable is convening',
  'research_execution': 'Researchers are investigating in depth',
  'decomposition': 'Breaking the problem into workstreams',
  'workstream_execution': 'Full team working in parallel',
  'senior_review': 'Senior partner is reviewing everything',
};

export function WorkflowStepCard({ card }: WorkflowStepCardProps) {
  const label = STEP_LABELS[card.step] ?? card.step.replace(/_/g, ' ');
  const phase = PHASE_DESCRIPTIONS[card.step];
  const transition = TRANSITION_PHRASES[card.step] ?? phase?.description ?? '';

  return (
    <div style={styles.card}>
      <div style={styles.rule} />
      <div style={styles.content}>
        <span style={styles.label}>{label}</span>
        {transition && <span style={styles.narrative}>{transition}</span>}
      </div>
      <div style={styles.rule} />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    padding: '14px 0',
    margin: '6px 0',
  },
  rule: {
    flex: 1,
    height: 1,
    background: `linear-gradient(90deg, transparent, ${colors.border}, transparent)`,
  },
  content: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 3,
    flexShrink: 0,
  },
  label: {
    fontSize: 11,
    fontFamily: fonts.sans,
    fontWeight: 600,
    color: colors.textMuted,
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
  },
  narrative: {
    fontSize: 13,
    fontFamily: fonts.serif,
    fontWeight: 400,
    fontStyle: 'italic' as const,
    color: colors.textSecondary,
  },
};
