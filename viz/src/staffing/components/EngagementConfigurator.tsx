/**
 * EngagementConfigurator — Control panel for workflow, intensity, team lead, and autopilot.
 *
 * Sits above the agent card grid in StaffingView / StrategyView.
 *
 * v15: Restructured layout — cards → connector text → orchestrator → depth + autopilot.
 *      Connector sentence makes the approach → team lead relationship explicit.
 */

import { motion } from 'motion/react';
import { useResponsive } from '../../hooks/useMediaQuery.js';
import { WorkflowPicker } from './WorkflowPicker.js';
import { IntensitySelector } from './IntensitySelector.js';
import { TeamCostSummary } from './TeamCostSummary.js';
import { YoloToggle } from './YoloToggle.js';
import { VerificationToggle } from './VerificationToggle.js';
import { ProviderToggle } from './ProviderToggle.js';
import { OrchestratorMiniCard } from './OrchestratorMiniCard.js';
import { colors, fonts, radii, spacing } from '../styles/tokens.js';
import type { WorkflowSummary } from '../hooks/useWorkflows.js';
import type { IntensityLevel, LLMProvider, EngagementConfig } from '../hooks/useEngagementConfig.js';
import type { AgentProfile } from '../hooks/useAgentProfiles.js';

/** Branded workflow names for the connector sentence. */
const WORKFLOW_BRANDED: Record<string, string> = {
  'counsel': 'Quick Counsel',
  'review': 'Deep Review',
  'adversarial': 'Stress Test',
  'roundtable': 'The Roundtable',
  'legal-design': 'The Roundtable',
};

interface Props {
  config: EngagementConfig;
  workflows: WorkflowSummary[];
  workflowsLoading: boolean;
  selectedProfiles?: AgentProfile[];
  totalCost?: number;
  teamSize?: number;
  recommendationLoading: boolean;
  orchestratorProfile: AgentProfile | null;
  onWorkflowChange: (id: string) => void;
  onIntensityChange: (level: IntensityLevel) => void;
  onYoloChange: (yolo: boolean) => void;
  onVerificationChange: (enabled: boolean) => void;
  onProviderChange: (provider: LLMProvider) => void;
  showCostSummary?: boolean;
}

export function EngagementConfigurator({
  config,
  workflows,
  workflowsLoading,
  selectedProfiles = [],
  totalCost = 0,
  teamSize = 0,
  recommendationLoading,
  orchestratorProfile,
  onWorkflowChange,
  onIntensityChange,
  onYoloChange,
  onVerificationChange,
  onProviderChange,
  showCostSummary = true,
}: Props) {
  const { isMobile } = useResponsive();
  const brandedName = WORKFLOW_BRANDED[config.workflowId] ?? config.workflowId;

  return (
    <motion.div
      initial={false}
      animate={{ opacity: 1, y: 0 }}
      style={styles.container}
    >
      {/* Loading indicator */}
      {recommendationLoading && (
        <div style={styles.header}>
          <span style={styles.loadingDot}>{'\u2022'} updating...</span>
        </div>
      )}

      {/* Workflow picker — 2×2 card grid, full width */}
      <WorkflowPicker
        workflows={workflows}
        activeWorkflow={config.workflowId}
        onSelect={onWorkflowChange}
        loading={workflowsLoading}
      />

      {/* Connector text + Orchestrator — full width */}
      {orchestratorProfile && (
        <div style={styles.orchestratorSection}>
          <div style={styles.connector}>
            <span style={styles.connectorText}>
              {brandedName} is led by
            </span>
          </div>
          <OrchestratorMiniCard
            profile={orchestratorProfile}
            workflowId={config.workflowId}
            showTagline
          />
        </div>
      )}

      {/* Two-column: Depth + Autopilot */}
      <div style={{
        ...styles.columns,
        ...(isMobile ? { gridTemplateColumns: '1fr' } : {}),
      }}>
        {/* Left column: Intensity */}
        <div style={styles.column}>
          <IntensitySelector
            intensity={config.intensity}
            onSelect={onIntensityChange}
          />
        </div>

        {/* Right column: Cost (optional) + Autopilot */}
        <div style={styles.column}>
          {showCostSummary && (
            <TeamCostSummary
              selectedProfiles={selectedProfiles}
              totalCost={totalCost}
              teamSize={teamSize}
            />
          )}
          <div style={{ marginTop: showCostSummary ? spacing.md : 0 }}>
            <YoloToggle
              enabled={config.yoloMode}
              onToggle={onYoloChange}
            />
          </div>
          <div style={{ marginTop: spacing.md }}>
            <VerificationToggle
              enabled={config.verification}
              onToggle={onVerificationChange}
            />
          </div>
          <div style={{ marginTop: spacing.md }}>
            <ProviderToggle
              provider={config.provider}
              onToggle={onProviderChange}
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
  loadingDot: {
    fontSize: 11,
    fontFamily: fonts.sans,
    color: colors.textDim,
    fontStyle: 'italic',
  },
  orchestratorSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
  },
  connector: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
  },
  connectorText: {
    fontSize: 14,
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    color: colors.textMuted,
    letterSpacing: 0.2,
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
