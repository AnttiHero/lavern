/**
 * OrchestratorMiniCard — Compact orchestrator display for the EngagementConfigurator.
 *
 * Shows who will lead the team for the selected workflow.
 * Designed to fit inside the configurator's right column.
 * Text wraps instead of truncating so the tagline is actually readable.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { colors, fonts, radii, spacing } from '../styles/tokens.js';
import type { AgentProfile } from '../hooks/useAgentProfiles.js';

interface Props {
  profile: AgentProfile;
  workflowId: string;
  /** Show the orchestrator's tagline (from profile) above the work style. */
  showTagline?: boolean;
}

const WORKFLOW_LABELS: Record<string, string> = {
  'counsel': 'Quick Counsel',
  'review': 'Deep Review',
  'adversarial': 'Stress Test',
  'roundtable': 'The Roundtable',
  'legal-design': 'The Roundtable',
};

function avatarUrl(seed: string, extra?: string): string {
  const base = `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(seed)}&backgroundColor=transparent`;
  return extra ? `${base}&${extra}` : base;
}

export function OrchestratorMiniCard({ profile, workflowId, showTagline = false }: Props) {
  const [imgError, setImgError] = useState(false);
  const workflowLabel = WORKFLOW_LABELS[workflowId] ?? workflowId;

  // Skip archetype if it's the same as displayName (e.g. "The Fixer" / "The Fixer")
  const showArchetype =
    profile.personality.archetype &&
    profile.personality.archetype !== profile.displayName;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={profile.role}
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 4 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        style={styles.container}
      >
        {/* Row: Avatar + Info */}
        <div style={styles.row}>
          <div style={styles.avatarWrap}>
            {imgError ? (
              <div style={styles.avatarFallback}>
                {profile.displayName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
              </div>
            ) : (
              <img
                src={avatarUrl(profile.displayName, profile.avatarExtra)}
                alt={profile.displayName}
                width={40}
                height={40}
                onError={() => setImgError(true)}
                style={{ display: 'block' }}
              />
            )}
          </div>

          <div style={styles.info}>
            <div style={styles.nameRow}>
              <span style={styles.name}>{profile.displayName}</span>
              <span style={styles.badge}>Team Lead</span>
            </div>
            {showArchetype && (
              <div style={styles.archetype}>{profile.personality.archetype}</div>
            )}
            <div style={styles.workflow}>For {workflowLabel}</div>
          </div>
        </div>

        {/* Tagline — big italic pull-quote when enabled */}
        {showTagline && profile.tagline && (
          <div style={styles.tagline}>
            {profile.tagline}
          </div>
        )}

        {/* Work style — wraps, not truncated */}
        {profile.personality.workStyle && (
          <div style={styles.workStyle}>
            &ldquo;{profile.personality.workStyle}&rdquo;
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: `${spacing.sm}px ${spacing.md}px`,
    borderRadius: radii.md,
    borderLeft: `2px solid ${colors.accent}`,
    backgroundColor: `rgba(196, 93, 62, 0.04)`,
    marginBottom: spacing.sm,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
  },
  avatarWrap: {
    width: 40,
    height: 40,
    borderRadius: '50%',
    overflow: 'hidden',
    border: `1.5px solid ${colors.accent}`,
    backgroundColor: colors.bgPanel,
    flexShrink: 0,
  },
  avatarFallback: {
    width: 40,
    height: 40,
    borderRadius: '50%',
    backgroundColor: colors.bgPanel,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 13,
    fontFamily: fonts.sans,
    fontWeight: 600,
    color: colors.textMuted,
  },
  info: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 1,
    minWidth: 0,
  },
  nameRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  name: {
    fontSize: 12,
    fontFamily: fonts.sans,
    fontWeight: 600,
    color: colors.text,
  },
  badge: {
    fontSize: 8,
    fontFamily: fonts.sans,
    fontWeight: 500,
    color: colors.accent,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    padding: '1px 5px',
    borderRadius: radii.sm,
    backgroundColor: `rgba(196, 93, 62, 0.08)`,
  },
  archetype: {
    fontSize: 10,
    fontFamily: fonts.sans,
    fontStyle: 'italic',
    color: colors.accent,
  },
  workflow: {
    fontSize: 10,
    fontFamily: fonts.sans,
    color: colors.textDim,
  },
  tagline: {
    fontSize: 12,
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    color: colors.text,
    lineHeight: '17px',
    marginTop: 6,
    opacity: 0.85,
  },
  workStyle: {
    fontSize: 10,
    fontFamily: fonts.sans,
    fontStyle: 'italic',
    color: colors.textDim,
    lineHeight: '14px',
    marginTop: 4,
    // Key fix: wrap instead of truncate
    display: '-webkit-box',
    WebkitLineClamp: 3,
    WebkitBoxOrient: 'vertical' as const,
    overflow: 'hidden',
  },
};
