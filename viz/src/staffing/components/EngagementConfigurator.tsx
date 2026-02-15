/**
 * EngagementConfigurator — Control panel for workflow, intensity, budget, and YOLO mode.
 *
 * Sits above the agent card grid in StaffingView. 2-column layout.
 * Warm editorial design — paper panel with subtle border.
 */

import { motion } from 'motion/react';
import { WorkflowPicker } from './WorkflowPicker.js';
import { IntensitySelector } from './IntensitySelector.js';
import { BudgetSlider } from './BudgetSlider.js';
import { YoloToggle } from './YoloToggle.js';
import { colors, fonts, radii, spacing } from '../styles/tokens.js';
import type { WorkflowSummary } from '../hooks/useWorkflows.js';
import type { IntensityLevel, EngagementConfig } from '../hooks/useEngagementConfig.js';

interface Props {
  config: EngagementConfig;
  workflows: WorkflowSummary[];
  workflowsLoading: boolean;
  estimatedCost: number;
  teamSize: number;
  recommendationLoading: boolean;
  onWorkflowChange: (id: string) => void;
  onIntensityChange: (level: IntensityLevel) => void;
  onBudgetChange: (budget: number) => void;
  onYoloChange: (yolo: boolean) => void;
}

export function EngagementConfigurator({
  config,
  workflows,
  workflowsLoading,
  estimatedCost,
  teamSize,
  recommendationLoading,
  onWorkflowChange,
  onIntensityChange,
  onBudgetChange,
  onYoloChange,
}: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      style={styles.container}
    >
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.title}>Engagement Configuration</span>
        {recommendationLoading && (
          <span style={styles.loadingDot}>{'\u2022'} updating...</span>
        )}
      </div>

      {/* Workflow picker — full width */}
      <WorkflowPicker
        workflows={workflows}
        activeWorkflow={config.workflowId}
        onSelect={onWorkflowChange}
        loading={workflowsLoading}
      />

      {/* Two-column layout */}
      <div style={styles.columns}>
        {/* Left column: Intensity */}
        <div style={styles.column}>
          <IntensitySelector
            intensity={config.intensity}
            onSelect={onIntensityChange}
          />
        </div>

        {/* Right column: Budget + YOLO */}
        <div style={styles.column}>
          <BudgetSlider
            budget={config.budgetUsd}
            estimatedCost={estimatedCost}
            teamSize={teamSize}
            onBudgetChange={onBudgetChange}
          />
          <div style={{ marginTop: spacing.md }}>
            <YoloToggle
              enabled={config.yoloMode}
              onToggle={onYoloChange}
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    backgroundColor: colors.bgPanel,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.lg,
    padding: spacing.xl,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.lg,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 14,
    fontFamily: fonts.sans,
    color: colors.text,
    fontWeight: 600,
  },
  loadingDot: {
    fontSize: 11,
    fontFamily: fonts.sans,
    color: colors.textDim,
    fontStyle: 'italic',
  },
  columns: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: spacing.xl,
  },
  column: {
    display: 'flex',
    flexDirection: 'column',
  },
};
