/**
 * WorkflowStepCard — Narrative phase divider in the insight feed.
 *
 * Full-width centered layout with step name in small caps and
 * a human-readable narrative description of what's happening.
 */

import type { StreamCard } from '../hooks/useWorkingState.js';
import { STEP_LABELS } from '../../types/events.js';
import { colors, fonts } from '../../staffing/styles/tokens.js';

type StepData = Extract<StreamCard, { kind: 'workflow_step' }>;

interface WorkflowStepCardProps {
  card: StepData;
}

/** Human-readable narrative for each workflow phase. */
const PHASE_NARRATIVES: Record<string, string> = {
  'intake': 'Reading and understanding the document',
  'parallel_analysis': 'Agents are independently reviewing the document',
  'debate_1': 'Agents are debating their findings',
  'ethics_gate': 'Ethical review checkpoint',
  'transformation': 'Transforming the document based on analysis',
  'parallel_verification': 'Verifying the transformation',
  'debate_2': 'Agents are debating the transformation',
  'meaning_gate': 'Checking that legal meaning is preserved',
  'synthesis': 'Assembling the final deliverable',
  'final_gate': 'Final review before delivery',
  'delivered': 'Analysis complete',
  'specialist_analysis': 'Specialist agents are reviewing the document',
  'evaluator_gate': 'Quality evaluation in progress',
  'plain_language_review': 'Reviewing for plain language compliance',
  'contract_analysis': 'Analyzing contract terms and conditions',
  'build': 'Building arguments from evidence',
};

export function WorkflowStepCard({ card }: WorkflowStepCardProps) {
  const label = STEP_LABELS[card.step] ?? card.step;
  const narrative = PHASE_NARRATIVES[card.step] ?? '';
  const time = new Date(card.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <div style={styles.card}>
      <div style={styles.rule} />
      <div style={styles.content}>
        <span style={styles.label}>{label}</span>
        {narrative && <span style={styles.narrative}>{narrative}</span>}
        <span style={styles.time}>{time}</span>
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
    padding: '12px 0',
  },
  rule: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  content: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 2,
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
    fontFamily: fonts.sans,
    fontWeight: 400,
    color: colors.textDim,
  },
  time: {
    fontSize: 9,
    color: colors.textDim,
    fontFamily: fonts.mono,
    marginTop: 2,
  },
};
