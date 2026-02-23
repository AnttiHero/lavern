/**
 * OrchestratorPanel — Shows the auto-assigned orchestrator for the selected workflow.
 *
 * Compact horizontal card with avatar, name, archetype, and work style.
 * Not selectable — this is a context display showing who leads the team.
 * Warm editorial design — terracotta accent, paper panel.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { colors, fonts, radii, spacing } from '../styles/tokens.js';
import type { AgentProfile } from '../hooks/useAgentProfiles.js';

interface Props {
  profile: AgentProfile;
  workflowId: string;
}

const WORKFLOW_LABELS: Record<string, string> = {
  'counsel': 'Counsel',
  'review': 'Review',
  'adversarial': 'Adversarial',
  'roundtable': 'Roundtable',
};

function avatarUrl(seed: string, extra?: string): string {
  const base = `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(seed)}&backgroundColor=transparent`;
  return extra ? `${base}&${extra}` : base;
}

export function OrchestratorPanel({ profile, workflowId }: Props) {
  const [imgError, setImgError] = useState(false);
  const workflowLabel = WORKFLOW_LABELS[workflowId] ?? workflowId;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={profile.role}
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 6 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        style={styles.container}
      >
        {/* Avatar */}
        <div style={styles.avatarWrap}>
          {imgError ? (
            <div style={styles.avatarFallback}>
              {profile.displayName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
            </div>
          ) : (
            <img
              src={avatarUrl(profile.displayName, profile.avatarExtra)}
              alt={profile.displayName}
              width={56}
              height={56}
              onError={() => setImgError(true)}
              style={{ display: 'block' }}
            />
          )}
        </div>

        {/* Info */}
        <div style={styles.info}>
          <div style={styles.topRow}>
            <span style={styles.name}>{profile.displayName}</span>
            <span style={styles.roleTag}>Team Lead</span>
          </div>
          <div style={styles.archetype}>
            {profile.personality.archetype}
          </div>
          <div style={styles.workStyle}>
            &ldquo;{profile.personality.workStyle}&rdquo;
          </div>
        </div>

        {/* Workflow badge */}
        <div style={styles.workflowBadge}>
          <span style={styles.workflowLabel}>Assigned for</span>
          <span style={styles.workflowName}>{workflowLabel}</span>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.lg,
    padding: `${spacing.md}px ${spacing.lg}px`,
    backgroundColor: colors.bgPanel,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.lg,
    borderLeft: `3px solid ${colors.accent}`,
  },
  avatarWrap: {
    width: 56,
    height: 56,
    borderRadius: '50%',
    overflow: 'hidden',
    border: `2px solid ${colors.accent}`,
    backgroundColor: colors.bgPanel,
    flexShrink: 0,
  },
  avatarFallback: {
    width: 56,
    height: 56,
    borderRadius: '50%',
    backgroundColor: colors.bgPanel,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 16,
    fontFamily: fonts.sans,
    fontWeight: 600,
    color: colors.textMuted,
  },
  info: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    minWidth: 0,
  },
  topRow: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
  },
  name: {
    fontSize: 14,
    fontFamily: fonts.sans,
    fontWeight: 600,
    color: colors.text,
  },
  roleTag: {
    fontSize: 9,
    fontFamily: fonts.sans,
    fontWeight: 500,
    color: colors.accent,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    padding: '1px 6px',
    borderRadius: radii.sm,
    backgroundColor: `rgba(196, 93, 62, 0.08)`,
  },
  archetype: {
    fontSize: 11,
    fontFamily: fonts.sans,
    fontStyle: 'italic',
    color: colors.accent,
  },
  workStyle: {
    fontSize: 10,
    fontFamily: fonts.sans,
    fontStyle: 'italic',
    color: colors.textDim,
    lineHeight: '14px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  workflowBadge: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 2,
    flexShrink: 0,
  },
  workflowLabel: {
    fontSize: 9,
    fontFamily: fonts.sans,
    color: colors.textDim,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  workflowName: {
    fontSize: 12,
    fontFamily: fonts.sans,
    fontWeight: 600,
    color: colors.textSecondary,
  },
};
