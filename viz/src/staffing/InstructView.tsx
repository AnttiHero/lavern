/**
 * InstructView — "Tell Your Team Lead What Matters" page.
 *
 * A dedicated prompt page between Strategy and Team. The user speaks directly
 * to the orchestrator they selected — personalized, intimate, warm.
 *
 * Flow: #/strategy → #/instruct → #/team → #/working
 */

import { useState, useCallback, useMemo } from 'react';
import { motion } from 'motion/react';
import { useEngagementConfig } from './hooks/useEngagementConfig.js';
import { useAgentProfiles } from './hooks/useAgentProfiles.js';
import { OrchestratorMiniCard } from './components/OrchestratorMiniCard.js';
import { colors, fonts, spacing, radii } from './styles/tokens.js';

// ── Orchestrator mapping (same as StrategyView) ─────────────────────────

const WORKFLOW_ORCHESTRATOR: Record<string, string> = {
  'counsel': 'orchestrator-fixer',
  'review': 'orchestrator-closer',
  'adversarial': 'orchestrator-professor',
  'roundtable': 'orchestrator-conductor',
  'legal-design': 'orchestrator-conductor',
};

// ── Prompt starters by workflow ─────────────────────────────────────────

const PROMPT_STARTERS: Record<string, string[]> = {
  'counsel': [
    'Focus on the key question',
    'We have a tight deadline',
    'Risk tolerance is low',
    'Jurisdiction matters here',
  ],
  'review': [
    'Watch the indemnification clause',
    'Flag IP ownership issues',
    'The counterparty is aggressive',
    'We need redline suggestions',
  ],
  'adversarial': [
    'Find our weakest argument',
    'What will the other side argue?',
    'These are our must-win points',
    'We have high risk appetite',
  ],
  'roundtable': [
    'Primary audience is non-lawyers',
    'Accessibility is a priority',
    'Simplify without losing meaning',
    'Multiple stakeholders involved',
  ],
};

const DEFAULT_STARTERS = [
  'Focus on the most critical issues',
  'We need this done thoroughly',
  'Flag anything unusual',
  'Time is a factor',
];

// ── Placeholders by workflow ────────────────────────────────────────────

const PLACEHOLDERS: Record<string, string> = {
  'counsel': 'e.g., I need to know if we can terminate this agreement early. The counterparty has been non-responsive for 60 days...',
  'review': 'e.g., Focus on the indemnification clause and IP ownership. The counterparty is very aggressive. We need this by Friday...',
  'adversarial': 'e.g., Test whether our position on the non-compete survives scrutiny. The other side will argue changed circumstances...',
  'roundtable': 'e.g., The primary audience is small business owners. The document needs to be understandable without legal training...',
};

const DEFAULT_PLACEHOLDER = 'e.g., Focus on the most critical issues. Prioritize thoroughness over speed...';

// ── Component ───────────────────────────────────────────────────────────

interface Props {
  onComplete: () => void;
  onBack: () => void;
  onSkip?: () => void;
}

export default function InstructView({ onComplete, onBack, onSkip }: Props) {
  const { allProfiles } = useAgentProfiles();
  const { config: engagementConfig } = useEngagementConfig();

  // Restore instruction if user navigated back
  const [instruction, setInstruction] = useState(() => {
    return sessionStorage.getItem('shem-instruct-prompt') ?? '';
  });

  // Derive orchestrator
  const orchestratorProfile = useMemo(() => {
    const role = WORKFLOW_ORCHESTRATOR[engagementConfig.workflowId];
    return role ? allProfiles.find(p => p.role === role) ?? null : null;
  }, [engagementConfig.workflowId, allProfiles]);

  // Prompt starters for current workflow
  const starters = PROMPT_STARTERS[engagementConfig.workflowId] ?? DEFAULT_STARTERS;
  const placeholder = PLACEHOLDERS[engagementConfig.workflowId] ?? DEFAULT_PLACEHOLDER;

  // Append a starter to the textarea
  const handleStarter = useCallback((text: string) => {
    setInstruction(prev => {
      const trimmed = prev.trim();
      if (trimmed.length === 0) return text;
      // Add on a new line if there's already content
      return trimmed + '\n' + text;
    });
  }, []);

  // Save and proceed
  const handleComplete = useCallback(() => {
    sessionStorage.setItem('shem-instruct-prompt', instruction.trim());
    onComplete();
  }, [instruction, onComplete]);

  // Skip — still save whatever they typed
  const handleSkip = useCallback(() => {
    if (instruction.trim()) {
      sessionStorage.setItem('shem-instruct-prompt', instruction.trim());
    }
    onSkip?.();
  }, [instruction, onSkip]);

  const orchestratorName = orchestratorProfile?.displayName ?? 'your team lead';

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <button
            onClick={onBack}
            style={styles.backButton}
            onMouseEnter={e => { const b = e.currentTarget; b.style.backgroundColor = colors.text; b.style.color = '#fff'; }}
            onMouseLeave={e => { const b = e.currentTarget; b.style.backgroundColor = 'transparent'; b.style.color = colors.text; }}
          >
            {'\u2190'} Strategy
          </button>
          <h1 style={styles.title}>Lavern <span style={{ fontStyle: 'italic' }}>Instruct</span></h1>
          {onSkip && (
            <button
              onClick={handleSkip}
              style={styles.skipButton}
              onMouseEnter={e => { const b = e.currentTarget; b.style.backgroundColor = colors.text; b.style.color = '#fff'; b.style.borderColor = colors.text; }}
              onMouseLeave={e => { const b = e.currentTarget; b.style.backgroundColor = 'transparent'; b.style.color = colors.textMuted; b.style.borderColor = colors.border; }}
            >
              Skip {'\u2192'}
            </button>
          )}
        </div>
      </div>

      {/* Content — narrow, centered */}
      <div style={styles.content}>
        {/* Orchestrator card */}
        {orchestratorProfile && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <OrchestratorMiniCard
              profile={orchestratorProfile}
              workflowId={engagementConfig.workflowId}
              showTagline
            />
          </motion.div>
        )}

        {/* Heading */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
        >
          <h2 style={styles.promptHeading}>
            What should {orchestratorName} focus on?
          </h2>
          <p style={styles.promptSubtitle}>
            Anything you type here goes directly to your team lead.
            Priorities, concerns, deadlines, constraints — whatever matters most.
          </p>
        </motion.div>

        {/* Textarea */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <textarea
            value={instruction}
            onChange={e => setInstruction(e.target.value)}
            placeholder={placeholder}
            style={styles.textarea}
            rows={8}
            autoFocus
          />
        </motion.div>

        {/* Prompt starters */}
        <motion.div
          style={styles.startersSection}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25 }}
        >
          <span style={styles.startersLabel}>Try:</span>
          <div style={styles.startersPills}>
            {starters.map(s => (
              <button
                key={s}
                onClick={() => handleStarter(s)}
                style={styles.starterPill}
                onMouseEnter={e => { const b = e.currentTarget; b.style.borderColor = colors.text; b.style.color = colors.text; }}
                onMouseLeave={e => { const b = e.currentTarget; b.style.borderColor = colors.border; b.style.color = colors.textMuted; }}
              >
                {s}
              </button>
            ))}
          </div>
        </motion.div>

        {/* CTA */}
        <motion.div
          style={styles.ctaRow}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <button
            onClick={handleComplete}
            style={styles.ctaButton}
            onMouseEnter={e => { const b = e.currentTarget; b.style.backgroundColor = 'transparent'; b.style.color = colors.text; }}
            onMouseLeave={e => { const b = e.currentTarget; b.style.backgroundColor = colors.text; b.style.color = '#fff'; }}
          >
            Choose Your Team {'\u2192'}
          </button>
        </motion.div>
      </div>
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
  content: {
    maxWidth: 700,
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.lg,
  },
  promptHeading: {
    fontSize: 22,
    fontWeight: 400,
    fontFamily: fonts.serif,
    color: colors.text,
    margin: 0,
    marginTop: spacing.md,
    lineHeight: 1.3,
  },
  promptSubtitle: {
    fontSize: 14,
    fontFamily: fonts.sans,
    color: colors.textMuted,
    lineHeight: 1.5,
    margin: 0,
    marginTop: spacing.xs,
  },
  textarea: {
    width: '100%',
    backgroundColor: colors.bgInput,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.md,
    color: colors.text,
    fontFamily: fonts.sans,
    fontSize: 15,
    lineHeight: 1.7,
    padding: '16px 18px',
    resize: 'vertical' as const,
    minHeight: 180,
    boxSizing: 'border-box' as const,
    transition: 'border-color 0.2s ease',
  },
  startersSection: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: spacing.sm,
    flexWrap: 'wrap' as const,
  },
  startersLabel: {
    fontSize: 11,
    fontFamily: fonts.sans,
    fontWeight: 500,
    color: colors.textDim,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
    paddingTop: 6,
    flexShrink: 0,
  },
  startersPills: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 6,
  },
  starterPill: {
    padding: '5px 12px',
    borderRadius: radii.lg,
    border: `1px solid ${colors.border}`,
    backgroundColor: 'transparent',
    color: colors.textMuted,
    fontFamily: fonts.sans,
    fontSize: 12,
    cursor: 'pointer',
    transition: 'border-color 0.2s ease, color 0.2s ease',
    whiteSpace: 'nowrap' as const,
  },
  ctaRow: {
    display: 'flex',
    justifyContent: 'center',
    padding: `${spacing.xl}px 0`,
  },
  ctaButton: {
    padding: '12px 32px',
    borderRadius: radii.lg,
    border: `1.5px solid ${colors.text}`,
    backgroundColor: colors.text,
    color: '#fff',
    fontFamily: fonts.sans,
    fontSize: 13,
    fontWeight: 600,
    letterSpacing: 0.5,
    cursor: 'pointer',
    transition: 'background-color 0.25s ease, color 0.25s ease',
  },
};
