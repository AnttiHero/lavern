/**
 * TheScorecardTab — Quality metrics, verification results,
 * debate flow, cost summary, and agent performance.
 */

import type { DeliveryData } from '../hooks/useDeliveryData.js';
import { colors, fonts, radii, spacing } from '../../staffing/styles/tokens.js';

interface Props {
  data: DeliveryData;
}

export function TheScorecardTab({ data }: Props) {
  const resolutionRate = data.debate.challengesCount > 0
    ? Math.round((data.debate.resolutionsCount / data.debate.challengesCount) * 100)
    : 100;

  const budgetUsed = data.cost.budget > 0
    ? (data.cost.accumulated / data.cost.budget) * 100
    : 0;

  return (
    <div>
      {/* Dimension improvements */}
      {data.dimensions.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Quality Improvement</div>
          <div style={styles.card}>
            {data.dimensions.map((dim, i) => (
              <div key={i} style={styles.dimRow}>
                <div style={styles.dimLabel}>{dim.dimension}</div>
                <div style={styles.dimBarWrap}>
                  <div style={styles.dimBarTrack}>
                    <div style={{
                      ...styles.dimBarBefore,
                      width: `${(dim.before / 5) * 100}%`,
                    }} />
                    <div style={{
                      ...styles.dimBarAfter,
                      width: `${(dim.after / 5) * 100}%`,
                    }} />
                  </div>
                </div>
                <div style={styles.dimDelta}>+{dim.delta.toFixed(1)}</div>
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
          label="Cost"
          value={`$${data.cost.accumulated.toFixed(2)}`}
          detail={`of $${data.cost.budget.toFixed(2)} budget`}
        />
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
          {data.debate.unresolvedCount > 0 && (
            <div style={styles.unresolvedNote}>
              {data.debate.unresolvedCount} unresolved {data.debate.unresolvedCount === 1 ? 'finding' : 'findings'}
            </div>
          )}
        </div>
      </div>

      {/* Cost efficiency */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Cost</div>
        <div style={styles.card}>
          <div style={styles.costGrid}>
            <div style={styles.costItem}>
              <span style={styles.costLabel}>Spent</span>
              <span style={styles.costValue}>${data.cost.accumulated.toFixed(2)}</span>
            </div>
            <div style={styles.costItem}>
              <span style={styles.costLabel}>Budget</span>
              <span style={styles.costValue}>${data.cost.budget.toFixed(2)}</span>
            </div>
            <div style={styles.costItem}>
              <span style={styles.costLabel}>Remaining</span>
              <span style={{
                ...styles.costValue,
                color: data.cost.remaining >= 0 ? colors.success : colors.danger,
              }}>
                ${data.cost.remaining.toFixed(2)}
              </span>
            </div>
          </div>
          <div style={styles.rateBarTrack}>
            <div style={{
              ...styles.rateBarFill,
              width: `${Math.min(100, budgetUsed)}%`,
              backgroundColor: budgetUsed > 90 ? colors.danger : budgetUsed > 70 ? colors.warning : colors.success,
            }} />
          </div>
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
    <div style={styles.statCard}>
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
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  statCard: {
    backgroundColor: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.md,
    padding: spacing.lg,
    textAlign: 'center' as const,
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
  dimBarTrack: {
    height: 16,
    backgroundColor: colors.bgPanel,
    borderRadius: 3,
    position: 'relative' as const,
    overflow: 'hidden',
  },
  dimBarBefore: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    height: '100%',
    backgroundColor: 'rgba(196, 93, 62, 0.12)',
    borderRadius: 3,
  },
  dimBarAfter: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: 3,
    opacity: 0.65,
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
    color: colors.danger,
    marginTop: spacing.sm,
    fontWeight: 500,
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
