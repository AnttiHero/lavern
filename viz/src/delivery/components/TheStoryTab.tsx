/**
 * TheStoryTab — Storified project narrative.
 * Renders editorial prose for each workflow phase,
 * with highlighted decision moments and agent mentions.
 */

import type { DeliveryData } from '../hooks/useDeliveryData.js';
import { colors, fonts, radii, spacing } from '../../staffing/styles/tokens.js';

interface Props {
  data: DeliveryData;
}

export function TheStoryTab({ data }: Props) {
  if (data.narrative.length === 0) {
    return (
      <div style={styles.empty}>
        <div style={styles.emptyText}>
          The project narrative will be available after a live session completes.
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 style={styles.heading}>How the Work Was Done</h2>
      <p style={styles.intro}>
        A record of the deliberation process — from initial analysis through final approval.
      </p>

      <div style={styles.timeline}>
        {data.narrative.map((section, i) => (
          <div key={i} style={styles.section}>
            {/* Phase marker */}
            <div style={styles.phaseRow}>
              <div style={styles.phaseDot} />
              <div style={styles.phaseLabel}>{section.phase}</div>
            </div>

            {/* Content */}
            <div style={styles.content}>
              <h3 style={styles.sectionHeading}>{section.heading}</h3>
              <p style={styles.body}>{section.body}</p>

              {/* Highlight */}
              {section.highlight && (
                <div style={styles.highlight}>
                  <div style={styles.highlightText}>{section.highlight}</div>
                </div>
              )}

              {/* Agent mentions */}
              {section.agents.length > 0 && (
                <div style={styles.agentRow}>
                  {section.agents.map((agent, j) => (
                    <span key={j} style={styles.agentChip}>{agent}</span>
                  ))}
                </div>
              )}
            </div>

            {/* Connector line (not on last item) */}
            {i < data.narrative.length - 1 && (
              <div style={styles.connector} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  heading: {
    fontSize: 28,
    fontWeight: 300,
    fontFamily: fonts.serif,
    color: colors.text,
    margin: '0 0 8px',
    letterSpacing: -0.3,
  },
  intro: {
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 1.6,
    margin: '0 0 32px',
  },

  // Timeline
  timeline: {
    position: 'relative' as const,
  },
  section: {
    position: 'relative' as const,
    paddingLeft: 28,
    marginBottom: spacing.xl,
    overflow: 'visible' as const,
  },

  // Phase marker
  phaseRow: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
    position: 'relative' as const,
    left: -28,
  },
  phaseDot: {
    width: 10,
    height: 10,
    borderRadius: '50%',
    backgroundColor: colors.accent,
    flexShrink: 0,
  },
  phaseLabel: {
    fontSize: 10,
    fontWeight: 600,
    color: colors.textDim,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
  },

  // Content
  content: {
    backgroundColor: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.md,
    padding: spacing.xl,
  },
  sectionHeading: {
    fontSize: 18,
    fontWeight: 400,
    fontFamily: fonts.serif,
    color: colors.text,
    margin: '0 0 12px',
  },
  body: {
    fontSize: 14,
    lineHeight: 1.75,
    color: colors.textSecondary,
    margin: 0,
  },

  // Highlight
  highlight: {
    marginTop: spacing.md,
    borderLeft: `3px solid ${colors.accent}`,
    paddingLeft: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
  },
  highlightText: {
    fontSize: 13,
    fontStyle: 'italic' as const,
    color: colors.accent,
    lineHeight: 1.6,
  },

  // Agent chips
  agentRow: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 6,
    marginTop: spacing.md,
  },
  agentChip: {
    fontSize: 11,
    fontWeight: 500,
    fontFamily: fonts.sans,
    color: colors.textMuted,
    backgroundColor: colors.bgPanel,
    padding: '3px 10px',
    borderRadius: radii.pill,
    border: `1px solid ${colors.border}`,
  },

  // Connector
  connector: {
    position: 'absolute' as const,
    left: 4,
    top: 22,
    bottom: -8,
    width: 1,
    backgroundColor: colors.border,
  },

  // Empty
  empty: {
    textAlign: 'center' as const,
    padding: '60px 0',
  },
  emptyText: {
    fontSize: 14,
    color: colors.textMuted,
  },
};
