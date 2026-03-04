/**
 * ProgressSidebar — Vertical checklist showing workflow progress.
 *
 * Inspired by "plan-ahead" sidebars: shows every step in the pipeline
 * with clear status (done / active / upcoming) so the client always
 * knows where they are and what's next.
 *
 * Layout: vertical list of steps connected by a thin line.
 *   ✓  Done steps — green check, muted label
 *   ●  Current step — pulsing dot, bold label, description visible
 *   ○  Upcoming steps — gray circle, dim label, description visible
 */

import { useMemo, useState } from 'react';
import type { WorkflowStep } from '../../types/events.js';
import { WORKFLOW_STEP_MAP, WORKFLOW_STEPS, STEP_LABELS } from '../../types/events.js';
import { PHASE_DESCRIPTIONS } from '../data/phase-descriptions.js';
import { colors, fonts, radii } from '../../staffing/styles/tokens.js';

interface ProgressSidebarProps {
  currentStep: WorkflowStep;
  completedSteps: WorkflowStep[];
}

export function ProgressSidebar({ currentStep, completedSteps }: ProgressSidebarProps) {
  // Resolve the correct pipeline for this workflow
  const [workflowId] = useState<string>(() => {
    try {
      const configStr = sessionStorage.getItem('shem-briefing-config');
      if (configStr) {
        const config = JSON.parse(configStr);
        return config.workflowId ?? '';
      }
    } catch { /* ignore */ }
    return '';
  });

  const pipelineSteps = useMemo(() => {
    if (workflowId && WORKFLOW_STEP_MAP[workflowId]) {
      return WORKFLOW_STEP_MAP[workflowId];
    }
    if (currentStep && !WORKFLOW_STEPS.includes(currentStep)) {
      const seen = new Set<WorkflowStep>();
      const ordered: WorkflowStep[] = [];
      for (const s of completedSteps) {
        if (!seen.has(s)) { seen.add(s); ordered.push(s); }
      }
      if (!seen.has(currentStep)) {
        seen.add(currentStep);
        ordered.push(currentStep);
      }
      if (!seen.has('delivered')) ordered.push('delivered');
      return ordered;
    }
    return WORKFLOW_STEPS;
  }, [workflowId, currentStep, completedSteps]);

  // Estimated time remaining (sum of current + upcoming steps)
  const estMinutes = useMemo(() => {
    let total = 0;
    let pastCurrent = false;
    for (const step of pipelineSteps) {
      const isCurrent = step === currentStep;
      const isCompleted = completedSteps.includes(step);
      if (isCurrent) pastCurrent = true;
      if (!isCompleted || isCurrent) {
        if (pastCurrent || isCurrent) {
          total += PHASE_DESCRIPTIONS[step]?.estimatedMinutes ?? 1;
        }
      }
    }
    return total;
  }, [pipelineSteps, currentStep, completedSteps]);

  // Find the current step index for progress calculation
  const currentIndex = pipelineSteps.indexOf(currentStep);
  const totalSteps = pipelineSteps.length;
  const progressLabel = currentIndex >= 0
    ? `${Math.min(currentIndex + 1, totalSteps)} of ${totalSteps}`
    : '';

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.headerLabel}>Progress</span>
        {progressLabel && (
          <span style={styles.headerCount}>{progressLabel}</span>
        )}
      </div>

      {/* Steps */}
      <div style={styles.stepList}>
        {pipelineSteps.map((step, idx) => {
          const isCompleted = completedSteps.includes(step);
          const isCurrent = step === currentStep;
          const isUpcoming = !isCompleted && !isCurrent;
          const isLast = idx === pipelineSteps.length - 1;
          const phase = PHASE_DESCRIPTIONS[step];
          const label = STEP_LABELS[step] ?? step.replace(/_/g, ' ');

          return (
            <div key={step} style={styles.stepRow}>
              {/* Indicator column: dot + connecting line */}
              <div style={styles.indicatorCol}>
                {/* Status dot */}
                <div
                  style={{
                    ...styles.dot,
                    ...(isCompleted ? styles.dotDone : {}),
                    ...(isCurrent ? styles.dotCurrent : {}),
                    ...(isUpcoming ? styles.dotUpcoming : {}),
                  }}
                >
                  {isCompleted && (
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M2 5L4.5 7.5L8 3" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                {/* Connecting line */}
                {!isLast && (
                  <div
                    style={{
                      ...styles.line,
                      backgroundColor: isCompleted ? colors.success : colors.border,
                    }}
                  />
                )}
              </div>

              {/* Content column */}
              <div style={styles.contentCol}>
                <span
                  style={{
                    ...styles.stepLabel,
                    ...(isCurrent ? styles.stepLabelCurrent : {}),
                    ...(isCompleted ? styles.stepLabelDone : {}),
                    ...(isUpcoming ? styles.stepLabelUpcoming : {}),
                  }}
                >
                  {label}
                </span>
                {(isCurrent || isUpcoming) && phase?.description && (
                  <span
                    style={{
                      ...styles.stepDesc,
                      ...(isCurrent ? styles.stepDescCurrent : {}),
                    }}
                  >
                    {phase.description}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer: estimated time */}
      {estMinutes > 0 && currentStep !== 'delivered' && (
        <div style={styles.footer}>
          <span style={styles.footerText}>
            ~{estMinutes} min remaining
          </span>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: 220,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    borderRight: `1px solid ${colors.border}`,
    backgroundColor: colors.bgPanel,
    overflow: 'hidden',
  },
  header: {
    padding: '14px 16px 10px',
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    borderBottom: `1px solid ${colors.border}`,
  },
  headerLabel: {
    fontSize: 11,
    fontFamily: fonts.sans,
    fontWeight: 600,
    color: colors.textMuted,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
  },
  headerCount: {
    fontSize: 10,
    fontFamily: fonts.mono,
    color: colors.textDim,
  },
  stepList: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '12px 16px',
  },
  stepRow: {
    display: 'flex',
    gap: 10,
    minHeight: 28,
  },
  indicatorCol: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    width: 16,
    flexShrink: 0,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    transition: 'all 0.4s ease',
  },
  dotDone: {
    backgroundColor: colors.success,
  },
  dotCurrent: {
    backgroundColor: colors.warning,
    boxShadow: `0 0 0 3px rgba(184, 134, 11, 0.15)`,
    animation: 'activeThinkingPulse 2s ease-in-out infinite',
  },
  dotUpcoming: {
    backgroundColor: 'transparent',
    border: `1.5px solid ${colors.border}`,
  },
  line: {
    width: 1.5,
    flex: 1,
    minHeight: 8,
    transition: 'background-color 0.4s ease',
  },
  contentCol: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 2,
    paddingBottom: 12,
    minWidth: 0,
  },
  stepLabel: {
    fontSize: 12,
    fontFamily: fonts.sans,
    fontWeight: 500,
    lineHeight: '16px',
    transition: 'color 0.3s ease',
  },
  stepLabelCurrent: {
    color: colors.text,
    fontWeight: 600,
  },
  stepLabelDone: {
    color: colors.textMuted,
  },
  stepLabelUpcoming: {
    color: colors.textDim,
  },
  stepDesc: {
    fontSize: 11,
    fontFamily: fonts.sans,
    color: colors.textDim,
    lineHeight: 1.35,
  },
  stepDescCurrent: {
    color: colors.textMuted,
  },
  footer: {
    padding: '10px 16px',
    borderTop: `1px solid ${colors.border}`,
  },
  footerText: {
    fontSize: 10,
    fontFamily: fonts.mono,
    color: colors.textDim,
  },
};
