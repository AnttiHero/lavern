/**
 * BriefingHeader — Title, matter summary, back button, progress stepper.
 */

import { ProgressStepper, type BriefingPhase } from './ProgressStepper.js';
import { colors, fonts, radii } from '../../staffing/styles/tokens.js';

const WORKFLOW_LABELS: Record<string, string> = {
  'counsel': 'Counsel',
  'review': 'Review',
  'adversarial': 'Adversarial',
  'roundtable': 'Roundtable',
  'full-bench': 'Full Bench',
  'pre-engagement': 'Client Onboarding',
  // Backward-compatible alias for old workflow ID
  'legal-design': 'Roundtable',
};

interface Props {
  matterNumber?: string;
  matterTitle?: string;
  workflowId: string;
  jurisdiction?: string;
  phase: BriefingPhase;
  onBack: () => void;
  onSkip?: () => void;
}

export function BriefingHeader({ matterNumber, matterTitle, workflowId, jurisdiction, phase, onBack, onSkip }: Props) {
  const workflowLabel = WORKFLOW_LABELS[workflowId] ?? workflowId;

  // Build subtitle parts
  const parts: string[] = [];
  if (matterNumber) parts.push(matterNumber);
  parts.push(workflowLabel);
  if (jurisdiction) parts.push(jurisdiction);

  return (
    <div style={styles.container}>
      <button
        onClick={onBack}
        style={styles.backButton}
        onMouseEnter={e => { const b = e.currentTarget; b.style.backgroundColor = colors.text; b.style.color = '#fff'; }}
        onMouseLeave={e => { const b = e.currentTarget; b.style.backgroundColor = 'transparent'; b.style.color = colors.text; }}
      >
        {'\u2190'} Back
      </button>
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

      <h1 style={styles.title}>
        Lavern <span style={{ fontStyle: 'italic' }}>Briefing</span>
      </h1>

      <p style={styles.subtitle}>
        {parts.join(' · ')}
      </p>

      <ProgressStepper currentPhase={phase} />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    textAlign: 'center',
    marginBottom: 24,
  },
  backButton: {
    position: 'absolute' as const,
    left: 48,
    top: 48,
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
  title: {
    fontSize: 32,
    fontFamily: fonts.serif,
    fontWeight: 300,
    color: colors.text,
    margin: 0,
    lineHeight: 1.2,
  },
  skipButton: {
    position: 'absolute' as const,
    right: 48,
    top: 48,
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
    transition: 'background-color 0.25s ease, color 0.25s ease, border-color 0.25s ease',
  },
  subtitle: {
    fontSize: 13,
    fontFamily: fonts.sans,
    color: colors.textMuted,
    marginTop: 8,
    textTransform: 'capitalize' as const,
  },
};
