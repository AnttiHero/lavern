/**
 * WorkflowPicker — 2×2 card grid for choosing the engagement approach.
 *
 * Each card shows icon, branded name, description, "best for" tagline,
 * and step/gate counts. Warm editorial design.
 *
 * v2: Replaced horizontal pill row with rich info cards.
 */

import { motion } from 'motion/react';
import { useResponsive } from '../../hooks/useMediaQuery.js';
import { colors, fonts, radii, spacing } from '../styles/tokens.js';
import type { WorkflowSummary } from '../hooks/useWorkflows.js';

const WORKFLOW_DISPLAY: Record<string, {
  icon: string;
  label: string;
  whyUse: string;
}> = {
  'counsel': {
    icon: '\u2014',
    label: 'Quick Counsel',
    whyUse: 'Best for: Fast answers to specific questions.',
  },
  'review': {
    icon: '\u00A7',
    label: 'Deep Review',
    whyUse: 'Best for: Contracts that need clause-by-clause analysis.',
  },
  'adversarial': {
    icon: '\u00B6',
    label: 'Stress Test',
    whyUse: 'Best for: Testing whether your position can survive attack.',
  },
  'roundtable': {
    icon: '\u25CA',
    label: 'The Roundtable',
    whyUse: 'Best for: Documents that need multidisciplinary redesign.',
  },
};

/** Legacy / non-selectable workflow IDs — filtered from display. */
const HIDDEN_WORKFLOW_IDS = new Set([
  'legal-design', // legacy alias
  'full-bench', 'pre-engagement', // not user-selectable workflow patterns
]);

interface Props {
  workflows: WorkflowSummary[];
  activeWorkflow: string;
  onSelect: (id: string) => void;
  loading?: boolean;
}

export function WorkflowPicker({ workflows, activeWorkflow, onSelect, loading }: Props) {
  const { isMobile } = useResponsive();

  if (loading) {
    return (
      <div style={styles.container}>
        <span style={styles.label}>Approach</span>
        <span style={styles.loadingText}>Loading workflows...</span>
      </div>
    );
  }

  const visible = workflows.filter(w => !HIDDEN_WORKFLOW_IDS.has(w.id));

  return (
    <div style={styles.container}>
      <span style={styles.label}>Approach</span>
      <div style={{
          ...styles.grid,
          ...(isMobile ? { gridTemplateColumns: '1fr' } : {}),
        }} role="radiogroup" aria-label="Engagement approach">
        {visible.map(w => {
          const isActive = w.id === activeWorkflow;
          const display = WORKFLOW_DISPLAY[w.id];
          const label = display?.label ?? w.name;
          const whyUse = display?.whyUse ?? '';
          const icon = display?.icon ?? '\u2699';

          return (
            <motion.button
              key={w.id}
              role="radio"
              aria-checked={isActive}
              onClick={() => onSelect(w.id)}
              whileHover={{ y: -2 }}
              transition={{ duration: 0.15 }}
              style={{
                ...styles.card,
                borderColor: isActive ? colors.text : colors.border,
                backgroundColor: isActive ? colors.text : colors.bgCard,
              }}
            >
              {/* Icon + Name row */}
              <div style={styles.cardHeader}>
                <span style={{
                  ...styles.icon,
                  color: isActive ? 'rgba(255,255,255,0.5)' : colors.textDim,
                }}>{icon}</span>
                <span style={{
                  ...styles.cardTitle,
                  color: isActive ? '#fff' : colors.text,
                }}>{label}</span>
                {w.id === 'counsel' && (
                  <span style={{
                    fontSize: 9,
                    fontWeight: 600,
                    letterSpacing: 0.5,
                    textTransform: 'uppercase' as const,
                    color: isActive ? 'rgba(255,255,255,0.6)' : colors.accent,
                    border: `1px solid ${isActive ? 'rgba(255,255,255,0.25)' : 'rgba(232,132,92,0.3)'}`,
                    borderRadius: radii.pill,
                    padding: '1px 7px',
                    marginLeft: 'auto',
                    flexShrink: 0,
                  }}>Default</span>
                )}
              </div>

              {/* Description */}
              <div style={{
                ...styles.description,
                color: isActive ? 'rgba(255,255,255,0.7)' : colors.textMuted,
              }}>
                {w.description}
              </div>

              {/* Why use tagline */}
              {whyUse && (
                <div style={{
                  ...styles.whyUse,
                  color: isActive ? 'rgba(255,255,255,0.55)' : colors.textDim,
                }}>
                  {whyUse}
                </div>
              )}

              {/* Step + gate counts */}
              <div style={{
                ...styles.meta,
                color: isActive ? 'rgba(255,255,255,0.45)' : colors.textDim,
              }}>
                {w.stepCount} steps{w.hasGates ? ` \u00B7 ${w.gateCount} human gate${w.gateCount !== 1 ? 's' : ''}` : ' \u00B7 no gates'}
              </div>
            </motion.button>
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
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: spacing.md,
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    padding: '14px 16px',
    borderRadius: radii.md,
    border: `1px solid ${colors.border}`,
    backgroundColor: colors.bgCard,
    fontFamily: fonts.sans,
    cursor: 'pointer',
    transition: 'background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease',
    textAlign: 'left',
    minHeight: 0,
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  icon: {
    fontSize: 16,
    color: colors.textDim,
    flexShrink: 0,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: colors.text,
  },
  description: {
    fontSize: 12,
    lineHeight: '16px',
    color: colors.textMuted,
  },
  whyUse: {
    fontSize: 11,
    fontStyle: 'italic',
    lineHeight: '15px',
    color: colors.textDim,
    marginTop: 2,
  },
  meta: {
    fontSize: 10,
    color: colors.textDim,
    marginTop: 'auto',
    paddingTop: 4,
  },
  loadingText: {
    fontSize: 12,
    fontFamily: fonts.sans,
    color: colors.textDim,
    fontStyle: 'italic',
  },
};
