/**
 * StrategyView — "Shape Your Engagement" page.
 *
 * Choose the approach (workflow), depth (intensity), team leader (orchestrator),
 * and autopilot mode. Presets have moved to TeamView.
 *
 * Flow: #/briefing → #/strategy → #/team → #/working
 */

import { useCallback, useMemo } from 'react';
import { motion } from 'motion/react';
import { useEngagementConfig } from './hooks/useEngagementConfig.js';
import { useWorkflows } from './hooks/useWorkflows.js';
import { useAgentProfiles } from './hooks/useAgentProfiles.js';
import { useResponsive } from '../hooks/useMediaQuery.js';
import { EngagementConfigurator } from './components/EngagementConfigurator.js';
import { colors, fonts, spacing, radii } from './styles/tokens.js';

// ── Orchestrator mapping ────────────────────────────────────────────────

const WORKFLOW_ORCHESTRATOR: Record<string, string> = {
  'counsel': 'orchestrator-fixer',
  'review': 'orchestrator-closer',
  'adversarial': 'orchestrator-professor',
  'roundtable': 'orchestrator-conductor',
  'legal-design': 'orchestrator-conductor',
};

// ── Component ───────────────────────────────────────────────────────────

interface Props {
  onComplete: () => void;
  onBack: () => void;
  onSkip?: () => void;
}

export default function StrategyView({ onComplete, onBack, onSkip }: Props) {
  const { isMobile, isTablet } = useResponsive();
  const { allProfiles } = useAgentProfiles();
  const { workflows, loading: workflowsLoading } = useWorkflows();
  const {
    config: engagementConfig,
    setWorkflow, setIntensity, setYolo, setVerification, setProvider,
    loading: recommendationLoading,
  } = useEngagementConfig();

  // Derive orchestrator from current workflow
  const orchestratorProfile = useMemo(() => {
    const role = WORKFLOW_ORCHESTRATOR[engagementConfig.workflowId];
    return role ? allProfiles.find(p => p.role === role) ?? null : null;
  }, [engagementConfig.workflowId, allProfiles]);

  // Persist config to sessionStorage and navigate to team
  const persistAndComplete = useCallback(() => {
    sessionStorage.setItem('shem-briefing-config', JSON.stringify(engagementConfig));
    onComplete();
  }, [engagementConfig, onComplete]);

  // "Choose Your Team" button
  const handleBrowse = useCallback(() => {
    sessionStorage.removeItem('shem-strategy-preset');
    persistAndComplete();
  }, [persistAndComplete]);

  return (
    <div style={{
      ...styles.container,
      ...(isMobile ? { padding: spacing.lg } : isTablet ? { padding: spacing.xl } : {}),
    }} id="main-content">
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <button
            onClick={onBack}
            style={styles.backButton}
            onMouseEnter={e => { const b = e.currentTarget; b.style.backgroundColor = colors.text; b.style.color = '#fff'; }}
            onMouseLeave={e => { const b = e.currentTarget; b.style.backgroundColor = 'transparent'; b.style.color = colors.text; }}
          >
            {'\u2190'} Back
          </button>
          <h1 style={styles.title}>Lavern <span style={{ fontStyle: 'italic' }}>Strategy</span></h1>
          {onSkip && (
            <button
              onClick={onSkip}
              style={styles.skipButton}
              onMouseEnter={e => { const b = e.currentTarget; b.style.backgroundColor = colors.text; b.style.color = '#fff'; b.style.borderColor = colors.text; }}
              onMouseLeave={e => { const b = e.currentTarget; b.style.backgroundColor = 'transparent'; b.style.color = colors.textMuted; b.style.borderColor = colors.border; }}
            >
              Skip {'\u2192'}
            </button>
          )}
        </div>
      </div>

      {/* Intro */}
      <p style={styles.intro}>
        Defaults work well for most engagements. Adjust only if you need to.
      </p>

      {/* Configurator: workflow cards, connector, orchestrator, depth, autopilot */}
      <EngagementConfigurator
        config={engagementConfig}
        workflows={workflows}
        workflowsLoading={workflowsLoading}
        recommendationLoading={recommendationLoading}
        orchestratorProfile={orchestratorProfile}
        onWorkflowChange={setWorkflow}
        onIntensityChange={setIntensity}
        onYoloChange={setYolo}
        onVerificationChange={setVerification}
        onProviderChange={setProvider}
        showCostSummary={false}
      />

      {/* CTA */}
      <motion.div
        style={styles.ctaRow}
        initial={false}
        animate={{ opacity: 1 }}
      >
        <button
          onClick={handleBrowse}
          style={styles.ctaButton}
          onMouseEnter={e => { const b = e.currentTarget; b.style.backgroundColor = 'transparent'; b.style.color = colors.text; }}
          onMouseLeave={e => { const b = e.currentTarget; b.style.backgroundColor = colors.text; b.style.color = '#fff'; }}
        >
          Choose Your Team {'\u2192'}
        </button>
      </motion.div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100%',
    minHeight: '100vh',
    backgroundColor: colors.bg,
    color: colors.text,
    fontFamily: fonts.sans,
    padding: `${spacing.xxxl}px`,
    maxWidth: 1400,
    margin: '0 auto',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xl,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'baseline',
    gap: spacing.lg,
    width: '100%',
  },
  backButton: {
    padding: '6px 14px',
    borderRadius: radii.sm,
    border: `1.5px solid ${colors.text}`,
    backgroundColor: 'transparent',
    color: colors.text,
    fontFamily: fonts.sans,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    cursor: 'pointer',
    transition: 'background-color 0.25s ease, color 0.25s ease, border-color 0.25s ease',
  },
  skipButton: {
    padding: '6px 14px',
    borderRadius: radii.sm,
    border: `1.5px solid ${colors.border}`,
    backgroundColor: 'transparent',
    color: colors.textMuted,
    fontFamily: fonts.sans,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    cursor: 'pointer',
    marginLeft: 'auto',
    transition: 'background-color 0.25s ease, color 0.25s ease, border-color 0.25s ease',
  },
  title: {
    fontSize: 32,
    fontWeight: 300,
    fontFamily: fonts.serif,
    color: colors.text,
    letterSpacing: -0.5,
    margin: 0,
  },
  ctaRow: {
    display: 'flex',
    justifyContent: 'center',
    padding: `${spacing.xxl}px 0`,
  },
  intro: {
    fontSize: 13,
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    color: colors.textMuted,
    margin: `0 0 ${spacing.lg}px`,
    lineHeight: 1.5,
  },
  ctaButton: {
    padding: '14px 44px',
    borderRadius: 100,
    border: `2px solid ${colors.text}`,
    backgroundColor: colors.text,
    color: '#fff',
    fontFamily: fonts.sans,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 3,
    textTransform: 'uppercase' as const,
    cursor: 'pointer',
    transition: 'background-color 0.25s ease, color 0.25s ease',
  },
};
