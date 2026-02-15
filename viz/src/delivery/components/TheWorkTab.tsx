/**
 * TheWorkTab — Primary deliverable: executive summary, key changes,
 * dimension scores before/after, and export placeholder.
 */

import type { DeliveryData } from '../hooks/useDeliveryData.js';
import { colors, fonts, radii, spacing } from '../../staffing/styles/tokens.js';

interface Props {
  data: DeliveryData;
}

export function TheWorkTab({ data }: Props) {
  return (
    <div>
      {/* Document title */}
      <h2 style={styles.docTitle}>{data.documentTitle}</h2>

      {/* Executive summary */}
      <div style={styles.summaryCard}>
        <div style={styles.summaryLabel}>Executive Summary</div>
        <p style={styles.summaryText}>{data.executiveSummary}</p>
      </div>

      {/* Key changes */}
      {data.keyChanges.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Key Changes</div>
          <div style={styles.changesList}>
            {data.keyChanges.map((change, i) => (
              <div key={i} style={styles.changeCard}>
                <div style={styles.changeTitle}>{change.title}</div>
                <div style={styles.changeRow}>
                  <div style={styles.changeBefore}>
                    <span style={styles.changeLabel}>Before</span>
                    <span style={styles.changeText}>{change.before}</span>
                  </div>
                  <div style={styles.changeArrow}>{'\u2192'}</div>
                  <div style={styles.changeAfter}>
                    <span style={styles.changeLabel}>After</span>
                    <span style={styles.changeText}>{change.after}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dimension scores */}
      {data.dimensions.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Quality Dimensions</div>
          <div style={styles.dimensionsCard}>
            {data.dimensions.map((dim, i) => (
              <div key={i} style={styles.dimensionRow}>
                <div style={styles.dimensionLabel}>{dim.dimension}</div>
                <div style={styles.barContainer}>
                  {/* Before bar (muted) */}
                  <div style={{
                    ...styles.barBefore,
                    width: `${(dim.before / 5) * 100}%`,
                  }} />
                  {/* After bar (colored) */}
                  <div style={{
                    ...styles.barAfter,
                    width: `${(dim.after / 5) * 100}%`,
                  }} />
                </div>
                <div style={styles.dimensionScores}>
                  <span style={styles.scoreBefore}>{dim.before.toFixed(1)}</span>
                  <span style={styles.scoreArrow}>{'\u2192'}</span>
                  <span style={styles.scoreAfter}>{dim.after.toFixed(1)}</span>
                  <span style={styles.scoreDelta}>(+{dim.delta.toFixed(1)})</span>
                </div>
              </div>
            ))}
            <div style={styles.barLegend}>
              <span style={styles.legendItem}><span style={styles.legendDotBefore} /> Before</span>
              <span style={styles.legendItem}><span style={styles.legendDotAfter} /> After</span>
              <span style={styles.legendScale}>Scale: 1 (poor) to 5 (excellent)</span>
            </div>
          </div>
        </div>
      )}

      {/* Export placeholder */}
      <div style={styles.exportCard}>
        <div style={styles.exportIcon}>{'\u2193'}</div>
        <div>
          <div style={styles.exportTitle}>Document ready for export</div>
          <div style={styles.exportDesc}>
            The transformed document is ready. Export options will be available when connected to a live session.
          </div>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  docTitle: {
    fontSize: 28,
    fontWeight: 300,
    fontFamily: fonts.serif,
    color: colors.text,
    margin: '0 0 24px',
    letterSpacing: -0.3,
  },

  // Summary
  summaryCard: {
    backgroundColor: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderLeft: `3px solid ${colors.accent}`,
    borderRadius: radii.md,
    padding: spacing.xl,
    marginBottom: spacing.xxl,
  },
  summaryLabel: {
    fontSize: 10,
    fontWeight: 600,
    color: colors.textDim,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    marginBottom: spacing.sm,
  },
  summaryText: {
    fontSize: 15,
    lineHeight: 1.7,
    color: colors.textSecondary,
    fontFamily: fonts.serif,
    margin: 0,
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

  // Key changes
  changesList: { display: 'flex', flexDirection: 'column' as const, gap: spacing.md },
  changeCard: {
    backgroundColor: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.md,
    padding: spacing.lg,
  },
  changeTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  changeRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  changeBefore: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 2,
  },
  changeArrow: {
    color: colors.textDim,
    fontSize: 14,
    paddingTop: 14,
    flexShrink: 0,
  },
  changeAfter: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 2,
  },
  changeLabel: {
    fontSize: 10,
    fontWeight: 600,
    color: colors.textDim,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
  },
  changeText: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 1.5,
  },

  // Dimensions
  dimensionsCard: {
    backgroundColor: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.lg,
    padding: spacing.xl,
  },
  dimensionRow: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.md,
    padding: '8px 0',
    borderBottom: `1px solid ${colors.bgPanel}`,
  },
  dimensionLabel: {
    width: 100,
    fontSize: 13,
    fontWeight: 500,
    color: colors.text,
    flexShrink: 0,
  },
  barContainer: {
    flex: 1,
    height: 20,
    position: 'relative' as const,
    backgroundColor: colors.bgPanel,
    borderRadius: 4,
    overflow: 'hidden',
  },
  barBefore: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    height: '100%',
    backgroundColor: 'rgba(196, 93, 62, 0.15)',
    borderRadius: 4,
  },
  barAfter: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: 4,
    opacity: 0.7,
  },
  dimensionScores: {
    width: 120,
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 13,
    fontFamily: fonts.mono,
    flexShrink: 0,
  },
  scoreBefore: { color: colors.textDim },
  scoreArrow: { color: colors.textDim, fontSize: 11 },
  scoreAfter: { color: colors.text, fontWeight: 600 },
  scoreDelta: { color: colors.success, fontSize: 11 },
  barLegend: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.lg,
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    fontSize: 11,
    color: colors.textDim,
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  legendDotBefore: {
    display: 'inline-block',
    width: 8,
    height: 8,
    borderRadius: 2,
    backgroundColor: 'rgba(196, 93, 62, 0.15)',
  },
  legendDotAfter: {
    display: 'inline-block',
    width: 8,
    height: 8,
    borderRadius: 2,
    backgroundColor: colors.accent,
    opacity: 0.7,
  },
  legendScale: {
    marginLeft: 'auto',
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.textDim,
  },

  // Export
  exportCard: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.lg,
    backgroundColor: colors.bgPanel,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.md,
    padding: spacing.xl,
  },
  exportIcon: {
    fontSize: 20,
    color: colors.textDim,
    width: 40,
    height: 40,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgCard,
    borderRadius: radii.sm,
    border: `1px solid ${colors.border}`,
    flexShrink: 0,
  },
  exportTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: colors.text,
    marginBottom: 2,
  },
  exportDesc: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 1.5,
  },
};
