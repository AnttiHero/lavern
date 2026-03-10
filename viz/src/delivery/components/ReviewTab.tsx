/**
 * ReviewTab — Process transparency, not accuracy scores.
 *
 * Shows what was checked, what was debated, what was escalated,
 * and what might be missing. Replaces the Certainty gauge.
 */

import type { DeliveryData } from '../hooks/useDeliveryData.js';
import { HumanReviewSection } from './HumanReviewSection.js';
import { colors, fonts, radii, spacing } from '../../staffing/styles/tokens.js';

interface Props {
  data: DeliveryData;
}

function scoreColor(score: number, passed: boolean): string {
  if (!passed) return colors.danger;
  if (score >= 0.85) return colors.success;
  if (score >= 0.70) return colors.warning;
  return colors.danger;
}

function confidenceColor(confidence: number): string {
  if (confidence >= 0.85) return colors.success;
  if (confidence >= 0.70) return colors.warning;
  return colors.danger;
}

export function ReviewTab({ data }: Props) {
  const limitations = data.limitations ?? {
    flaggedForHumanReview: [],
    confidenceIntervals: '',
    disclaimer: 'This analysis was produced by an AI system with multi-agent verification.',
  };

  return (
    <div>
      <h2 style={styles.heading}>How This Work Was Reviewed</h2>
      <p style={styles.intro}>
        A transparent record of every check, debate, and decision in this engagement.
      </p>

      {/* ── Process overview ────────────────────────────────────── */}
      <div style={styles.overviewCard}>
        <OverviewStat value={data.agentPerformance.length} label="agents" />
        <span style={styles.overviewDot}>{'\u00B7'}</span>
        <OverviewStat value={data.debate.findingsCount} label="findings" />
        <span style={styles.overviewDot}>{'\u00B7'}</span>
        <OverviewStat value={data.debate.resolutionsCount} label="debates resolved" />
        <span style={styles.overviewDot}>{'\u00B7'}</span>
        <OverviewStat value={data.gateDecisions.length} label="gates" />
      </div>

      {/* ── What was checked ────────────────────────────────────── */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>What Was Checked</div>
        {data.verificationChecks.length > 0 ? (
          <div style={styles.checkList}>
            {data.verificationChecks.map((check, i) => {
              const hasScore = check.score != null && check.score > 0;
              const color = hasScore
                ? scoreColor(check.score!, check.passed)
                : check.passed ? colors.success : colors.danger;
              const pct = hasScore ? Math.round(check.score! * 100) : null;

              return (
                <div
                  key={i}
                  style={{
                    ...styles.checkItem,
                    animation: `cardStaggerUp 0.4s ease ${i * 0.04}s both`,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.06)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
                >
                  <span style={{ ...styles.checkIcon, color }}>
                    {check.passed ? '\u2713' : '\u2717'}
                  </span>
                  <span style={styles.checkLabel}>{check.label}</span>
                  {pct !== null ? (
                    <span style={{
                      ...styles.scorePill,
                      backgroundColor: color === colors.warning
                        ? colors.warningBg
                        : color === colors.danger
                          ? 'rgba(196, 93, 62, 0.1)'
                          : colors.successBg,
                      color,
                    }}>
                      {pct}%
                    </span>
                  ) : (
                    <span style={{ ...styles.checkResult, color }}>
                      {check.passed ? 'Passed' : 'Failed'}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div style={styles.emptyState}>
            No formal verification checks were run on this engagement.
          </div>
        )}
      </div>

      {/* ── What was debated ─────────────────────────────────────── */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>What Was Debated</div>
        {data.debateResolutions.length > 0 ? (
          <div style={styles.resolutionsList}>
            {data.debateResolutions.map((res, i) => (
              <div
                key={i}
                style={{
                  ...styles.resolutionCard,
                  animation: `cardStaggerUp 0.4s ease ${i * 0.06}s both`,
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.06)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
              >
                <div style={styles.resHeader}>
                  <span style={styles.resIcon}>{'\u2713'}</span>
                  <span style={styles.resLabel}>Resolved</span>
                  <span style={styles.resTopic}>{res.topic}</span>
                  {res.confidence != null && res.confidence > 0 && (
                    <span style={{
                      ...styles.confidencePill,
                      backgroundColor: confidenceColor(res.confidence) === colors.warning
                        ? colors.warningBg
                        : confidenceColor(res.confidence) === colors.danger
                          ? 'rgba(196, 93, 62, 0.1)'
                          : colors.successBg,
                      color: confidenceColor(res.confidence),
                    }}>
                      {Math.round(res.confidence * 100)}%
                    </span>
                  )}
                  {res.escalationNeeded && (
                    <span style={styles.escalationBadge}>Escalation needed</span>
                  )}
                </div>
                <div style={styles.resBody}>{res.resolution}</div>
                {res.winningPosition && (
                  <div style={styles.resDetail}>
                    <span style={styles.resDetailLabel}>Position:</span>
                    <span style={styles.resDetailText}>{res.winningPosition}</span>
                  </div>
                )}
                {res.evidenceWeight && (
                  <div style={styles.resDetail}>
                    <span style={styles.resDetailLabel}>Evidence:</span>
                    <span style={styles.resDetailText}>{res.evidenceWeight}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div style={styles.emptyState}>
            No debates occurred — all findings were accepted without challenge.
          </div>
        )}
      </div>

      {/* ── What was escalated ──────────────────────────────────── */}
      {data.gateDecisions.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>What Was Escalated</div>
          <div style={styles.gateList}>
            {data.gateDecisions.map((gate, i) => (
              <div
                key={i}
                style={{
                  ...styles.gateCard,
                  animation: `cardStaggerUp 0.4s ease ${i * 0.06}s both`,
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
              >
                <div style={styles.gateHeader}>
                  <span style={styles.gateIcon}>{'\u26A0'}</span>
                  <span style={styles.gateType}>{gate.gateType}</span>
                  <span style={{
                    ...styles.gateBadge,
                    backgroundColor: gate.decision === 'approve' ? colors.successBg : colors.warningBg,
                    color: gate.decision === 'approve' ? colors.success : colors.warning,
                  }}>
                    {gate.decision}
                  </span>
                </div>
                {gate.summary && (
                  <div style={styles.gateSummary}>{gate.summary}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Limitations ─────────────────────────────────────────── */}
      <div style={styles.section}>
        <HumanReviewSection
          confidence={data.verification.confidence}
          dimensionCount={data.verificationChecks.length}
          flaggedItems={limitations.flaggedForHumanReview}
          confidenceIntervals={limitations.confidenceIntervals}
          disclaimer={limitations.disclaimer}
        />
      </div>
    </div>
  );
}

function OverviewStat({ value, label }: { value: number; label: string }) {
  return (
    <span style={styles.overviewStat}>
      <span style={styles.overviewValue}>{value}</span>
      <span style={styles.overviewLabel}>{label}</span>
    </span>
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

  // Overview card
  overviewCard: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    backgroundColor: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.lg,
    padding: `${spacing.xl}px ${spacing.xxl}px`,
    marginBottom: spacing.xxl,
  },
  overviewStat: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 4,
  },
  overviewValue: {
    fontSize: 24,
    fontWeight: 300,
    fontFamily: fonts.serif,
    color: colors.text,
  },
  overviewLabel: {
    fontSize: 12,
    fontFamily: fonts.sans,
    color: colors.textMuted,
  },
  overviewDot: {
    fontSize: 18,
    color: colors.textDim,
  },

  // Sections
  section: { marginBottom: spacing.xxl },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 500,
    color: colors.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginBottom: spacing.md,
  },

  // Check list
  checkList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: spacing.xs,
  },
  checkItem: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.md,
    padding: `${spacing.md}px ${spacing.lg}px`,
    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
  },
  checkIcon: {
    fontSize: 14,
    fontWeight: 700,
    width: 20,
    textAlign: 'center' as const,
    flexShrink: 0,
  },
  checkLabel: {
    fontSize: 13,
    fontFamily: fonts.sans,
    color: colors.text,
    flex: 1,
  },
  checkResult: {
    fontSize: 12,
    fontFamily: fonts.sans,
    fontWeight: 600,
  },
  scorePill: {
    fontSize: 11,
    fontFamily: fonts.sans,
    fontWeight: 600,
    padding: '2px 10px',
    borderRadius: radii.pill,
    letterSpacing: 0.2,
  },

  // Resolutions
  resolutionsList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: spacing.md,
  },
  resolutionCard: {
    backgroundColor: colors.successBg,
    border: `1px solid rgba(74, 124, 80, 0.2)`,
    borderRadius: radii.lg,
    padding: spacing.xl,
    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
  },
  resHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginBottom: spacing.sm,
  },
  resIcon: {
    fontSize: 12,
    fontWeight: 700,
    color: colors.success,
  },
  resLabel: {
    fontSize: 11,
    fontFamily: fonts.sans,
    fontWeight: 600,
    color: colors.success,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.3,
  },
  resTopic: {
    fontSize: 13,
    fontFamily: fonts.sans,
    fontWeight: 500,
    color: colors.textSecondary,
    flex: 1,
  },
  confidencePill: {
    fontSize: 10,
    fontFamily: fonts.sans,
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: radii.pill,
    letterSpacing: 0.2,
    flexShrink: 0,
  },
  escalationBadge: {
    fontSize: 9,
    fontFamily: fonts.sans,
    fontWeight: 700,
    color: colors.danger,
    backgroundColor: 'rgba(196, 93, 62, 0.1)',
    padding: '2px 8px',
    borderRadius: radii.pill,
    letterSpacing: 0.3,
    textTransform: 'uppercase' as const,
  },
  resBody: {
    fontSize: 13,
    fontFamily: fonts.sans,
    fontWeight: 400,
    color: colors.textSecondary,
    lineHeight: 1.6,
    marginBottom: spacing.sm,
    paddingLeft: 18,
  },
  resDetail: {
    display: 'flex',
    gap: 6,
    paddingLeft: 18,
    marginBottom: 2,
  },
  resDetailLabel: {
    fontSize: 10,
    fontFamily: fonts.sans,
    fontWeight: 600,
    color: colors.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.3,
    flexShrink: 0,
  },
  resDetailText: {
    fontSize: 12,
    fontFamily: fonts.sans,
    fontWeight: 400,
    color: colors.textSecondary,
    lineHeight: 1.5,
  },

  // Gates
  gateList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: spacing.sm,
  },
  gateCard: {
    backgroundColor: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.md,
    padding: spacing.lg,
    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
  },
  gateHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  gateIcon: {
    fontSize: 14,
    flexShrink: 0,
  },
  gateType: {
    fontSize: 13,
    fontFamily: fonts.sans,
    fontWeight: 600,
    color: colors.text,
    textTransform: 'capitalize' as const,
    flex: 1,
  },
  gateBadge: {
    fontSize: 10,
    fontFamily: fonts.sans,
    fontWeight: 700,
    padding: '2px 10px',
    borderRadius: radii.pill,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.3,
  },
  gateSummary: {
    fontSize: 13,
    fontFamily: fonts.sans,
    color: colors.textSecondary,
    lineHeight: 1.6,
    paddingLeft: 26,
  },

  // Empty state
  emptyState: {
    fontSize: 13,
    fontFamily: fonts.sans,
    color: colors.textMuted,
    fontStyle: 'italic' as const,
    padding: `${spacing.lg}px ${spacing.xl}px`,
    backgroundColor: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.md,
    lineHeight: 1.6,
  },
};
