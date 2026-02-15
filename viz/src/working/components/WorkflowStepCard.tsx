/**
 * WorkflowStepCard — Phase transition announcement in the thinking stream.
 */

import type { StreamCard } from '../hooks/useWorkingState.js';
import { STEP_LABELS } from '../../types/events.js';
import { colors, fonts, radii } from '../../staffing/styles/tokens.js';

type StepData = Extract<StreamCard, { kind: 'workflow_step' }>;

interface WorkflowStepCardProps {
  card: StepData;
}

export function WorkflowStepCard({ card }: WorkflowStepCardProps) {
  const label = STEP_LABELS[card.step] ?? card.step;
  const time = new Date(card.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <div style={styles.card}>
      <div style={styles.line} />
      <div style={styles.content}>
        <span style={styles.label}>{label}</span>
        <span style={styles.time}>{time}</span>
      </div>
      <div style={styles.line} />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '6px 0',
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  content: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  label: {
    fontSize: 12,
    fontFamily: fonts.serif,
    fontWeight: 300,
    color: colors.textMuted,
    letterSpacing: 0.3,
    textTransform: 'uppercase' as const,
  },
  time: {
    fontSize: 9,
    color: colors.textDim,
    fontFamily: fonts.mono,
  },
};
