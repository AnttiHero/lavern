/**
 * TheScorecardTab — Quality metrics, verification results,
 * debate flow, cost summary, and agent performance.
 */

import type { DeliveryData } from '../hooks/useDeliveryData.js';
import { colors, fonts, radii, spacing } from '../../staffing/styles/tokens.js';
import { useInView } from '../../hooks/useInView.js';

interface Props {
  data: DeliveryData;
}

export function TheScorecardTab({ data }: Props) {
  const { ref: barsRef, inView: barsInView } = useInView();
  const hasDebate = data.debate.challengesCount > 0;
  const resolutionRate = hasDebate
    ? Math.round((data.debate.resolutionsCount / data.debate.challengesCount) * 100)
    : null;

  const budgetUsed = data.cost.budget > 0
    ? (data.cost.accumulated / data.cost.budget) * 100
    : 0;

  return (
    <div>
      {/* Confidence overview */}
      {data.confidenceSummary && data.confidenceSummary.overall > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Engagement Confidence</div>
          <div style={styles.card}>
            <div style={{ textAlign: 'center', padding: '16px 0 8px' }}>
              <div style={{ fontSize: '2.2rem', fontWeight: 700, fontFamily: fonts.serif, color: data.confidenceSummary.overall >= 0.7 ? colors.success : data.confidenceSummary.overall >= 0.5 ? colors.warning : colors.danger }}>
                {Math.round(data.confidenceSummary.overall * 100)}%
              </div>
              <div style={{ fontSize: '0.8rem', color: colors.textMuted, marginTop: 4 }}>weighted average across all verification layers</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 12 }}>
              {[
                { label: 'Findings', value: data.confidenceSummary.findings },
                { label: 'Resolutions', value: data.confidenceSummary.resolutions },
                { label: 'Verification', value: data.confidenceSummary.verification },
              ].map((item) => (
                <div key={item.label} style={{ textAlign: 'center', padding: '8px 0' }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: 600, color: colors.text }}>{Math.round(item.value * 100)}%</div>
                  <div style={{ fontSize: '0.75rem', color: colors.textMuted }}>{item.label}</div>
                </div>
              ))}
            </div>
            {data.confidenceSummary.grounding != null && (
              <div style={{ textAlign: 'center', padding: '8px 0', borderTop: `1px solid ${colors.border}`, marginTop: 8 }}>
                <div style={{ fontSize: '1rem', fontWeight: 600, color: colors.text }}>
                  {Math.round(data.confidenceSummary.grounding * 100)}% evidence grounded
                </div>
                <div style={{ fontSize: '0.75rem', color: colors.textMuted }}>citations verified against source document</div>
              </div>
            )}
            {data.confidenceSummary.lowConfidenceCount > 0 && (
              <div style={{ background: colors.warningBg, border: `1px solid ${colors.warning}`, borderRadius: radii.sm, padding: '8px 12px', marginTop: 8, fontSize: '0.82rem', color: colors.warning }}>
                {data.confidenceSummary.lowConfidenceCount} finding{data.confidenceSummary.lowConfidenceCount > 1 ? 's' : ''} with confidence below 70%
              </div>
            )}
          </div>
        </div>
      )}

      {/* Dimension improvements */}
      {data.dimensions.length > 0 && (
        <div style={styles.section} ref={barsRef}>
          <div style={styles.sectionTitle}>Quality Improvement</div>
          <div style={styles.card}>
            {data.dimensions.map((dim, i) => (
              <div key={i} style={styles.dimRow}>
                <div style={styles.dimLabel}>{dim.dimension}</div>
                <div style={styles.dimBarWrap}>
                  <div style={styles.dimBarStack}>
                    <div style={styles.dimBarTrack}>
                      <div style={{
                        ...styles.dimBarBefore,
                        width: `${(dim.before / 5) * 100}%`,
                        animation: barsInView ? `barGrow 0.5s ease ${i * 0.1}s both` : undefined,
                      }} />
                    </div>
                    <div style={styles.dimBarTrack}>
                      <div style={{
                        ...styles.dimBarAfter,
                        width: `${(dim.after / 5) * 100}%`,
                        animation: barsInView ? `barGrow 0.8s ease ${i * 0.1 + 0.15}s both` : undefined,
                      }} />
                    </div>
                  </div>
                </div>
                <div style={{
                  ...styles.dimDelta,
                  ...(dim.delta < 0 ? { color: colors.danger } : {}),
                }}>{dim.delta >= 0 ? '+' : ''}{dim.delta.toFixed(1)}</div>
              </div>
            ))}
            <div style={styles.dimFooter}>
              Overall improvement: <strong>+{
                (data.dimensions.reduce((sum, d) => sum + d.delta, 0) / data.dimensions.length).toFixed(1)
              }</strong> average across {data.dimensions.length} dimensions
            </div>
          </div>
        </div>
      )}

      {/* Summary stats */}
      <div style={styles.statsGrid}>
        <StatCard label="Status" value={data.status} />
        <StatCard label="Events" value={String(data.eventCount)} />
        <StatCard
          label="Verification"
          value={`${data.verification.passed}/${data.verification.resultsCount}`}
          detail={data.verification.failed === 0 ? 'all passed' : `${data.verification.failed} failed`}
          color={data.verification.failed === 0 ? colors.success : colors.danger}
        />
      </div>

      {/* Debate flow */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Deliberation Flow</div>
        <div style={styles.card}>
          <div style={styles.flowRow}>
            <FlowStep
              label="Findings"
              count={data.debate.findingsCount}
              color={colors.text}
            />
            <div style={styles.flowArrow}>{'\u2192'}</div>
            <FlowStep
              label="Challenges"
              count={data.debate.challengesCount}
              color={colors.warning}
            />
            <div style={styles.flowArrow}>{'\u2192'}</div>
            <FlowStep
              label="Resolutions"
              count={data.debate.resolutionsCount}
              color={colors.success}
            />
          </div>
          {hasDebate ? (
            <div style={styles.rateRow}>
              <span style={styles.rateLabel}>Resolution rate</span>
              <div style={styles.rateBarTrack}>
                <div style={{
                  ...styles.rateBarFill,
                  width: `${resolutionRate}%`,
                  backgroundColor: data.debate.unresolvedCount === 0 ? colors.success : colors.warning,
                }} />
              </div>
              <span style={styles.rateValue}>{resolutionRate}%</span>
            </div>
          ) : (
            <div style={styles.noDebateNote}>No challenges were raised — findings accepted by consensus</div>
          )}
          {data.debate.unresolvedCount > 0 && (
            <div style={styles.unresolvedNote}>
              {data.debate.unresolvedCount} unresolved {data.debate.unresolvedCount === 1 ? 'finding' : 'findings'} — flagged for human review
            </div>
          )}
        </div>
      </div>


      {/* Agent performance */}
      {data.agentPerformance.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Team Performance</div>
          <div style={styles.card}>
            <div style={styles.perfHeader}>
              <span style={styles.perfHeaderCell}>Agent</span>
              <span style={styles.perfHeaderCellRight}>Findings</span>
              <span style={styles.perfHeaderCellRight}>Confidence</span>
            </div>
            {data.agentPerformance.map((agent, i) => (
              <div key={i} style={styles.perfRow}>
                <span style={styles.perfName}>{agent.name}</span>
                <span style={styles.perfStat}>{agent.findingsPosted}</span>
                <span style={styles.perfStat}>
                  {agent.avgConfidence > 0 ? `${(agent.avgConfidence * 100).toFixed(0)}%` : '\u2014'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────

function StatCard({ label, value, detail, color }: {
  label: string;
  value: string;
  detail?: string;
  color?: string;
}) {
  return (
    <div
      style={styles.statCard}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)'; }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
    >
      <div style={styles.statLabel}>{label}</div>
      <div style={{ ...styles.statValue, ...(color ? { color } : {}) }}>{value}</div>
      {detail && <div style={styles.statDetail}>{detail}</div>}
    </div>
  );
}

function FlowStep({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div style={styles.flowStep}>
      <div style={{ ...styles.flowCount, color }}>{count}</div>
      <div style={styles.flowLabel}>{label}</div>
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  section: { marginBottom: spacing.xl },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 500,
    color: colors.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginBottom: spacing.md,
  },
  card: {
    backgroundColor: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.lg,
    padding: spacing.xl,
  },

  // Stats grid
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  statCard: {
    backgroundColor: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.md,
    padding: spacing.lg,
    textAlign: 'center' as const,
    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
  },
  statLabel: {
    fontSize: 10,
    fontWeight: 600,
    color: colors.textDim,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 22,
    fontWeight: 300,
    fontFamily: fonts.serif,
    color: colors.text,
    textTransform: 'capitalize' as const,
  },
  statDetail: {
    fontSize: 11,
    color: colors.textDim,
    marginTop: 2,
  },

  // Dimension improvements
  dimRow: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.md,
    padding: '6px 0',
    borderBottom: `1px solid ${colors.bgPanel}`,
  },
  dimLabel: {
    width: 100,
    fontSize: 13,
    fontWeight: 500,
    color: colors.text,
    flexShrink: 0,
  },
  dimBarWrap: { flex: 1 },
  dimBarStack: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 2,
  },
  dimBarTrack: {
    height: 7,
    backgroundColor: colors.bgPanel,
    borderRadius: 3,
    overflow: 'hidden',
  },
  dimBarBefore: {
    height: '100%',
    backgroundColor: 'rgba(26, 26, 26, 0.15)',
    borderRadius: 3,
  },
  dimBarAfter: {
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: 3,
    opacity: 0.7,
  },
  dimDelta: {
    width: 40,
    textAlign: 'right' as const,
    fontSize: 13,
    fontWeight: 600,
    fontFamily: fonts.mono,
    color: colors.success,
    flexShrink: 0,
  },
  dimFooter: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: spacing.md,
    paddingTop: spacing.sm,
  },

  // Flow
  flowRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    marginBottom: spacing.lg,
  },
  flowStep: { textAlign: 'center' as const },
  flowCount: {
    fontSize: 28,
    fontWeight: 300,
    fontFamily: fonts.serif,
    marginBottom: 2,
  },
  flowLabel: {
    fontSize: 11,
    fontWeight: 500,
    color: colors.textDim,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  flowArrow: {
    color: colors.textDim,
    fontSize: 16,
  },

  // Rate bar
  rateRow: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rateLabel: { fontSize: 12, color: colors.textMuted, width: 100, flexShrink: 0 },
  rateBarTrack: {
    flex: 1,
    height: 6,
    backgroundColor: colors.bgPanel,
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 4,
  },
  rateBarFill: { height: '100%', borderRadius: 3, transition: 'width 0.5s ease' },
  rateValue: { fontSize: 13, fontWeight: 600, fontFamily: fonts.mono, color: colors.text, width: 40, textAlign: 'right' as const },
  unresolvedNote: {
    fontSize: 12,
    color: colors.warning,
    marginTop: spacing.sm,
    fontWeight: 500,
  },
  noDebateNote: {
    fontSize: 12,
    color: colors.textMuted,
    fontStyle: 'italic' as const,
  },

  // Cost
  costGrid: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  costItem: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 2,
  },
  costLabel: { fontSize: 11, color: colors.textMuted, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
  costValue: { fontSize: 18, fontWeight: 300, fontFamily: fonts.serif, color: colors.text },

  // Agent performance
  perfHeader: {
    display: 'flex',
    alignItems: 'center',
    padding: '0 0 8px',
    borderBottom: `1px solid ${colors.border}`,
    marginBottom: spacing.xs,
  },
  perfHeaderCell: {
    flex: 1,
    fontSize: 10,
    fontWeight: 600,
    color: colors.textDim,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
  },
  perfHeaderCellRight: {
    width: 80,
    textAlign: 'right' as const,
    fontSize: 10,
    fontWeight: 600,
    color: colors.textDim,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
  },
  perfRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '6px 0',
    borderBottom: `1px solid ${colors.bgPanel}`,
  },
  perfName: {
    flex: 1,
    fontSize: 13,
    color: colors.text,
  },
  perfStat: {
    width: 80,
    textAlign: 'right' as const,
    fontSize: 13,
    fontFamily: fonts.mono,
    color: colors.textSecondary,
  },
};
