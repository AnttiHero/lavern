/**
 * WorkflowPicker — Horizontal row of selectable workflow pills.
 * Warm editorial design.
 */

import { colors, fonts, radii, spacing } from '../styles/tokens.js';
import type { WorkflowSummary } from '../hooks/useWorkflows.js';

const WORKFLOW_DISPLAY: Record<string, { icon: string; label: string }> = {
  'simple-query': { icon: '\u2014', label: 'Advisory' },
  'contract-review': { icon: '\u00A7', label: 'Contract Review' },
  'research-memo': { icon: '\u00B6', label: 'Research Memo' },
  'legal-design': { icon: '\u25CA', label: 'Document Review' },
  'pre-engagement': { icon: '\u2022', label: 'Client Onboarding' },
};

interface Props {
  workflows: WorkflowSummary[];
  activeWorkflow: string;
  onSelect: (id: string) => void;
  loading?: boolean;
}

export function WorkflowPicker({ workflows, activeWorkflow, onSelect, loading }: Props) {
  if (loading) {
    return (
      <div style={styles.container}>
        <span style={styles.label}>Workflow</span>
        <span style={styles.loadingText}>Loading workflows...</span>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <span style={styles.label}>Workflow</span>
      <div style={styles.pills}>
        {workflows.map(w => {
          const isActive = w.id === activeWorkflow;
          return (
            <button
              key={w.id}
              onClick={() => onSelect(w.id)}
              style={{
                ...styles.pill,
                borderColor: isActive ? colors.text : colors.border,
                backgroundColor: isActive ? colors.text : 'transparent',
                color: isActive ? '#fff' : colors.textMuted,
              }}
              title={w.description}
            >
              <span style={styles.icon}>{WORKFLOW_DISPLAY[w.id]?.icon ?? '\u2699'}</span>
              <span>{WORKFLOW_DISPLAY[w.id]?.label ?? w.name}</span>
              <span style={{ ...styles.stepCount, color: isActive ? 'rgba(255,255,255,0.6)' : colors.textDim }}>
                {w.stepCount} steps
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
  },
  label: {
    fontSize: 11,
    fontFamily: fonts.sans,
    fontWeight: 500,
    color: colors.textDim,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  pills: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  pill: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '7px 16px',
    borderRadius: radii.lg,
    border: `1px solid ${colors.border}`,
    backgroundColor: colors.bgCard,
    fontFamily: fonts.sans,
    fontSize: 12,
    cursor: 'pointer',
    transition: 'background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease',
    whiteSpace: 'nowrap',
  },
  icon: {
    fontSize: 14,
  },
  stepCount: {
    fontSize: 10,
    color: colors.textDim,
  },
  loadingText: {
    fontSize: 12,
    fontFamily: fonts.sans,
    color: colors.textDim,
    fontStyle: 'italic',
  },
};
