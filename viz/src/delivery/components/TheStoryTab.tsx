/**
 * TheStoryTab — "The Transformation" — before/after story for the client.
 *
 * Four editorial sections:
 *   1. What We Found — key issues discovered
 *   2. What Changed — before/after pairs
 *   3. What It Means — debate resolutions as business impact
 *   4. What Remains — forward-looking next steps
 *
 * Data comes from DeliveryData: keyChanges, debateResolutions, dimensions, nextSteps, executiveSummary.
 */

import type { DeliveryData } from '../hooks/useDeliveryData.js';
import { colors, fonts, radii, spacing } from '../../staffing/styles/tokens.js';
import { useInView } from '../../hooks/useInView.js';

interface Props {
  data: DeliveryData;
}

/** Full-bleed contrast band for alternating sections. */
const bandStyle: React.CSSProperties = {
  backgroundColor: colors.bgAlt,
  marginLeft: -spacing.xxxxl,
  marginRight: -spacing.xxxxl,
  paddingLeft: spacing.xxxxl,
  paddingRight: spacing.xxxxl,
  paddingTop: spacing.xxl,
  paddingBottom: spacing.xxl,
};

export function TheStoryTab({ data }: Props) {
  const { ref: barsRef, inView: barsInView } = useInView();
  const hasChanges = data.keyChanges.length > 0;
  const hasResolutions = data.debateResolutions.length > 0;
  const hasDimensions = data.dimensions.length > 0;
  const hasNextSteps = data.nextSteps.length > 0;
  const hasContent = hasChanges || hasResolutions || hasDimensions || hasNextSteps;

  if (!hasContent && data.narrative.length === 0) {
    return (
      <div style={styles.empty}>
        <div style={styles.emptyText}>
          The transformation story will be available after a live session completes.
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 style={styles.heading}>The Transformation</h2>
      <p style={styles.intro}>{data.executiveSummary}</p>

      {/* Score improvements — visual bar chart */}
      {hasDimensions && (
        <div style={styles.section} ref={barsRef}>
          <div style={styles.dimensionGrid}>
            {data.dimensions.map((d, i) => {
              const beforePct = (d.before / 5) * 100;
              const afterPct = (d.after / 5) * 100;
              return (
                <div key={i} style={styles.dimensionRow}>
                  <div style={styles.dimensionLabel}>{d.dimension}</div>
                  <div style={styles.barContainer}>
                    <div style={styles.barTrack}>
                      <div style={{
                        ...styles.barBefore,
                        width: `${beforePct}%`,
                        animation: barsInView ? `barGrow 0.5s ease ${i * 0.1}s both` : undefined,
                      }} />
                    </div>
                    <div style={styles.barTrack}>
                      <div style={{
                        ...styles.barAfter,
                        width: `${afterPct}%`,
                        animation: barsInView ? `barGrow 0.8s ease ${i * 0.1 + 0.15}s both` : undefined,
                      }} />
                    </div>
                  </div>
                  <div style={{
                    ...styles.dimensionDelta,
                    ...(d.delta < 0 ? { color: colors.danger } : {}),
                  }}>
                    {d.delta >= 0 ? '+' : ''}{d.delta.toFixed(1)}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={styles.barLegend}>
            <span style={styles.legendItem}>
              <span style={{ ...styles.legendDot, backgroundColor: colors.border }} />
              Before
            </span>
            <span style={styles.legendItem}>
              <span style={{ ...styles.legendDot, backgroundColor: colors.accent }} />
              After
            </span>
          </div>
        </div>
      )}

      {/* Section 1: What We Found — contrast band */}
      {hasChanges && (
        <div style={{ ...styles.section, ...bandStyle }}>
          <h3 style={styles.sectionTitle}>What We Found</h3>
          <p style={styles.sectionIntro}>
            {data.keyChanges.length} issue{data.keyChanges.length !== 1 ? 's' : ''} identified during analysis.
          </p>
          <div style={styles.findingsGrid}>
            {data.keyChanges.map((change, i) => (
              <div
                key={i}
                style={{
                  ...styles.findingCard,
                  animation: `cardStaggerUp 0.4s ease ${i * 0.06}s both`,
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
              >
                <div style={styles.findingTitle}>{change.title}</div>
                <div style={styles.findingBody}>{change.before}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Section 2: What Changed — before/after pairs */}
      {hasChanges && (
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>What Changed</h3>
          <div style={styles.changesList}>
            {data.keyChanges.map((change, i) => (
              <div
                key={i}
                style={{
                  ...styles.changeCard,
                  animation: `cardStaggerUp 0.4s ease ${i * 0.06}s both`,
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = `0 0 0 0 transparent`; }}
              >
                <div style={styles.changeLabel}>{change.title}</div>
                <div style={styles.beforeAfterRow}>
                  <div style={styles.beforeCol}>
                    <div style={styles.baTag}>Before</div>
                    <div style={styles.beforeText}>{change.before}</div>
                  </div>
                  <div style={styles.arrow}>{'\u2192'}</div>
                  <div style={styles.afterCol}>
                    <div style={styles.baTag}>After</div>
                    <div style={styles.afterText}>{change.after}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Section 3: What It Means — contrast band */}
      {hasResolutions && (
        <div style={{ ...styles.section, ...bandStyle }}>
          <h3 style={styles.sectionTitle}>What It Means</h3>
          <div style={styles.resolutionList}>
            {data.debateResolutions.map((res, i) => (
              <div
                key={i}
                style={{
                  ...styles.resolutionCard,
                  animation: `cardStaggerUp 0.4s ease ${i * 0.06}s both`,
                }}
              >
                <div style={styles.resolutionTopic}>{res.topic}</div>
                <div style={styles.resolutionBody}>{res.resolution}</div>
                {res.escalationNeeded && (
                  <div style={styles.escalationFlag}>
                    Flagged for escalation
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Section 4: What Remains */}
      {hasNextSteps && (
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>What Remains</h3>
          <div style={styles.nextStepsList}>
            {data.nextSteps.map((step, i) => (
              <div key={i} style={{
                ...styles.nextStepRow,
                animation: `cardStaggerUp 0.4s ease ${i * 0.06}s both`,
              }}>
                <div style={styles.nextStepIcon}>
                  {step.kind === 'action' ? '\u2022' : step.kind === 'watchout' ? '\u26A0' : '\u23F0'}
                </div>
                <div>
                  <div style={styles.nextStepLabel}>{step.label}</div>
                  <div style={styles.nextStepDesc}>{step.description}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
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
    maxWidth: 660,
  },

  // Sections
  section: {
    marginBottom: spacing.xxl,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 600,
    fontFamily: fonts.sans,
    color: colors.text,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
    margin: '0 0 12px',
  },
  sectionIntro: {
    fontSize: 13,
    color: colors.textDim,
    margin: '0 0 16px',
  },

  // Dimension bars
  dimensionGrid: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 10,
    marginBottom: 8,
  },
  dimensionRow: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.md,
  },
  dimensionLabel: {
    fontSize: 12,
    fontFamily: fonts.sans,
    fontWeight: 500,
    color: colors.textMuted,
    width: 100,
    flexShrink: 0,
    textAlign: 'right' as const,
  },
  barContainer: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 2,
  },
  barTrack: {
    height: 4,
    backgroundColor: colors.bgPanel,
    borderRadius: 2,
    overflow: 'hidden',
  },
  barBefore: {
    height: '100%',
    backgroundColor: 'rgba(26, 26, 26, 0.15)',
    borderRadius: 2,
    transition: 'width 0.6s ease',
  },
  barAfter: {
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: 2,
    opacity: 0.7,
    transition: 'width 0.6s ease',
  },
  dimensionDelta: {
    fontSize: 11,
    fontFamily: fonts.sans,
    fontWeight: 600,
    color: colors.success,
    width: 36,
    flexShrink: 0,
  },
  barLegend: {
    display: 'flex',
    gap: spacing.md,
    justifyContent: 'flex-end',
    paddingRight: 36,
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 10,
    fontFamily: fonts.sans,
    color: colors.textDim,
  },
  legendDot: {
    display: 'inline-block',
    width: 8,
    height: 8,
    borderRadius: '50%',
  },

  // Findings
  findingsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: spacing.md,
  },
  findingCard: {
    backgroundColor: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.md,
    padding: spacing.lg,
    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
  },
  findingTitle: {
    fontSize: 13,
    fontWeight: 600,
    fontFamily: fonts.sans,
    color: colors.text,
    marginBottom: 6,
  },
  findingBody: {
    fontSize: 13,
    lineHeight: 1.6,
    color: colors.textSecondary,
  },

  // Before/After changes
  changesList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: spacing.lg,
  },
  changeCard: {
    backgroundColor: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.md,
    padding: spacing.xl,
    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
  },
  changeLabel: {
    fontSize: 14,
    fontWeight: 500,
    fontFamily: fonts.sans,
    color: colors.text,
    marginBottom: spacing.md,
  },
  beforeAfterRow: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    alignItems: 'stretch',
    gap: spacing.md,
  },
  beforeCol: {
    flex: '1 1 200px',
    minWidth: 0,
  },
  afterCol: {
    flex: '1 1 200px',
    minWidth: 0,
  },
  arrow: {
    display: 'flex',
    alignItems: 'center',
    fontSize: 16,
    color: colors.textDim,
    flexShrink: 0,
    padding: '0 4px',
  },
  baTag: {
    fontSize: 9,
    fontWeight: 600,
    fontFamily: fonts.sans,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    color: colors.textDim,
    marginBottom: 4,
  },
  beforeText: {
    fontSize: 13,
    lineHeight: 1.6,
    color: colors.textMuted,
    fontStyle: 'italic' as const,
    textDecoration: 'line-through',
    textDecorationColor: 'rgba(26, 26, 26, 0.15)',
  },
  afterText: {
    fontSize: 13,
    lineHeight: 1.6,
    color: colors.text,
  },

  // Resolutions
  resolutionList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: spacing.md,
  },
  resolutionCard: {
    borderLeft: `3px solid ${colors.accent}`,
    paddingLeft: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
  },
  resolutionTopic: {
    fontSize: 14,
    fontWeight: 500,
    fontFamily: fonts.sans,
    color: colors.text,
    marginBottom: 4,
  },
  resolutionBody: {
    fontSize: 13,
    lineHeight: 1.65,
    color: colors.textSecondary,
  },
  escalationFlag: {
    marginTop: 6,
    fontSize: 10,
    fontWeight: 600,
    fontFamily: fonts.sans,
    color: colors.warning,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
  },

  // Next steps
  nextStepsList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: spacing.md,
  },
  nextStepRow: {
    display: 'flex',
    gap: spacing.md,
  },
  nextStepIcon: {
    fontSize: 14,
    color: colors.textDim,
    flexShrink: 0,
    width: 20,
    textAlign: 'center' as const,
    paddingTop: 1,
  },
  nextStepLabel: {
    fontSize: 13,
    fontWeight: 600,
    fontFamily: fonts.sans,
    color: colors.text,
    marginBottom: 2,
  },
  nextStepDesc: {
    fontSize: 13,
    lineHeight: 1.6,
    color: colors.textSecondary,
  },

  // Empty state
  empty: {
    textAlign: 'center' as const,
    padding: '60px 0',
  },
  emptyText: {
    fontSize: 14,
    color: colors.textMuted,
  },
};
