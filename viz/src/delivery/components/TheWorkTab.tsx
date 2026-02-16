/**
 * TheWorkTab — The primary deliverable, presented beautifully.
 *
 * Editorial layout: serif hero title, pull-quote executive summary,
 * elegant before/after transformation cards, refined dimension bars,
 * and a polished export prompt.
 */

import type { DeliveryData } from '../hooks/useDeliveryData.js';
import { colors, fonts, radii, spacing } from '../../staffing/styles/tokens.js';

interface Props {
  data: DeliveryData;
}

export function TheWorkTab({ data }: Props) {
  return (
    <div>
      {/* ── Hero title ──────────────────────────────────────────── */}
      <div style={styles.heroSection}>
        <div style={styles.heroOverline}>Delivered Work Product</div>
        <h2 style={styles.heroTitle}>{data.documentTitle}</h2>
        <div style={styles.heroDivider} />
      </div>

      {/* ── Executive summary — editorial pull-quote style ─────── */}
      <div style={styles.summarySection}>
        <div style={styles.summaryQuoteMark}>{'\u201C'}</div>
        <p style={styles.summaryText}>{data.executiveSummary}</p>
        <div style={styles.summaryLabel}>Executive Summary</div>
      </div>

      {/* ── Key changes — transformation cards ────────────────── */}
      {data.keyChanges.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <div style={styles.sectionTitle}>What Changed</div>
            <div style={styles.sectionCount}>{data.keyChanges.length} transformations</div>
          </div>

          <div style={styles.changesList}>
            {data.keyChanges.map((change, i) => (
              <div key={i} style={styles.changeCard}>
                <div style={styles.changeNumber}>
                  {String(i + 1).padStart(2, '0')}
                </div>
                <div style={styles.changeContent}>
                  <div style={styles.changeTitle}>{change.title}</div>
                  <div style={styles.changeColumns}>
                    <div style={styles.changeBefore}>
                      <div style={styles.changeColumnLabel}>
                        <span style={styles.changeDotBefore} />
                        Before
                      </div>
                      <div style={styles.changeColumnText}>{change.before}</div>
                    </div>
                    <div style={styles.changeAfter}>
                      <div style={styles.changeColumnLabel}>
                        <span style={styles.changeDotAfter} />
                        After
                      </div>
                      <div style={styles.changeColumnText}>{change.after}</div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Dimension scores — refined horizontal bars ─────────── */}
      {data.dimensions.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <div style={styles.sectionTitle}>Quality Dimensions</div>
            <div style={styles.sectionCount}>1 {'\u2013'} 5 scale</div>
          </div>

          <div style={styles.dimensionsCard}>
            {data.dimensions.map((dim, i) => (
              <div
                key={i}
                style={{
                  ...styles.dimensionRow,
                  borderBottom: i < data.dimensions.length - 1
                    ? `1px solid ${colors.bgPanel}`
                    : 'none',
                }}
              >
                <div style={styles.dimensionLabel}>{dim.dimension}</div>
                <div style={styles.barOuter}>
                  <div style={{
                    ...styles.barBefore,
                    width: `${(dim.before / 5) * 100}%`,
                  }} />
                  <div style={{
                    ...styles.barAfter,
                    width: `${(dim.after / 5) * 100}%`,
                  }} />
                </div>
                <div style={styles.scoreGroup}>
                  <span style={styles.scoreBefore}>{dim.before.toFixed(1)}</span>
                  <span style={styles.scoreArrow}>{'\u2192'}</span>
                  <span style={styles.scoreAfter}>{dim.after.toFixed(1)}</span>
                </div>
                <div style={styles.deltaTag}>+{dim.delta.toFixed(1)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Export prompt ──────────────────────────────────────── */}
      <div style={styles.exportCard}>
        <div style={styles.exportLeft}>
          <div style={styles.exportIcon}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M10 3v10M6 9l4 4 4-4" stroke={colors.accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 15h12" stroke={colors.accent} strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <div style={styles.exportTitle}>Document Ready for Export</div>
            <div style={styles.exportDesc}>
              The transformed document is available for download when connected to a live session.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  // ── Hero ──────────────────────────────────────────────────────
  heroSection: {
    textAlign: 'center' as const,
    marginBottom: spacing.xxl,
  },
  heroOverline: {
    fontSize: 10,
    fontWeight: 600,
    fontFamily: fonts.sans,
    color: colors.accent,
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
    marginBottom: 12,
  },
  heroTitle: {
    fontSize: 36,
    fontWeight: 300,
    fontFamily: fonts.serif,
    color: colors.text,
    margin: 0,
    letterSpacing: -0.5,
    lineHeight: 1.2,
  },
  heroDivider: {
    width: 48,
    height: 1,
    backgroundColor: colors.accent,
    margin: '20px auto 0',
    opacity: 0.5,
  },

  // ── Executive Summary ──────────────────────────────────────────
  summarySection: {
    position: 'relative' as const,
    backgroundColor: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.sm,
    padding: '36px 40px 28px',
    marginBottom: spacing.xxl,
  },
  summaryQuoteMark: {
    position: 'absolute' as const,
    top: 12,
    left: 24,
    fontSize: 48,
    fontFamily: fonts.serif,
    fontWeight: 300,
    color: colors.accent,
    opacity: 0.25,
    lineHeight: 1,
    userSelect: 'none' as const,
  },
  summaryText: {
    fontSize: 14,
    lineHeight: 1.8,
    color: colors.textSecondary,
    fontFamily: fonts.sans,
    fontWeight: 400,
    margin: 0,
  },
  summaryLabel: {
    fontSize: 9,
    fontWeight: 600,
    fontFamily: fonts.sans,
    color: colors.textDim,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
    marginTop: 20,
    textAlign: 'right' as const,
  },

  // ── Sections ──────────────────────────────────────────────────
  section: { marginBottom: spacing.xxl },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 600,
    fontFamily: fonts.sans,
    color: colors.text,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
  },
  sectionCount: {
    fontSize: 11,
    fontFamily: fonts.sans,
    color: colors.textDim,
  },

  // ── Key Changes ───────────────────────────────────────────────
  changesList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 12,
  },
  changeCard: {
    display: 'flex',
    gap: 20,
    backgroundColor: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.sm,
    padding: `${spacing.lg}px ${spacing.xl}px`,
  },
  changeNumber: {
    fontSize: 20,
    fontWeight: 300,
    fontFamily: fonts.sans,
    color: colors.border,
    lineHeight: 1,
    flexShrink: 0,
    width: 32,
    paddingTop: 2,
  },
  changeContent: {
    flex: 1,
    minWidth: 0,
  },
  changeTitle: {
    fontSize: 15,
    fontWeight: 600,
    fontFamily: fonts.sans,
    color: colors.text,
    marginBottom: 12,
  },
  changeColumns: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: spacing.lg,
  },
  changeBefore: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 6,
  },
  changeAfter: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 6,
  },
  changeColumnLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 9,
    fontWeight: 600,
    fontFamily: fonts.sans,
    color: colors.textDim,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
  },
  changeDotBefore: {
    display: 'inline-block',
    width: 6,
    height: 6,
    borderRadius: '50%',
    backgroundColor: colors.textDim,
    opacity: 0.4,
  },
  changeDotAfter: {
    display: 'inline-block',
    width: 6,
    height: 6,
    borderRadius: '50%',
    backgroundColor: colors.accent,
  },
  changeColumnText: {
    fontSize: 13,
    fontFamily: fonts.sans,
    color: colors.textSecondary,
    lineHeight: 1.6,
  },

  // ── Dimensions ────────────────────────────────────────────────
  dimensionsCard: {
    backgroundColor: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.sm,
    padding: `${spacing.md}px ${spacing.xl}px`,
  },
  dimensionRow: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.md,
    padding: '12px 0',
  },
  dimensionLabel: {
    width: 100,
    fontSize: 13,
    fontWeight: 500,
    fontFamily: fonts.sans,
    color: colors.text,
    flexShrink: 0,
  },
  barOuter: {
    flex: 1,
    height: 6,
    position: 'relative' as const,
    backgroundColor: colors.bgPanel,
    borderRadius: 3,
    overflow: 'hidden',
  },
  barBefore: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    height: '100%',
    backgroundColor: 'rgba(26, 26, 26, 0.08)',
    borderRadius: 3,
  },
  barAfter: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: 3,
    opacity: 0.65,
  },
  scoreGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 12,
    fontFamily: fonts.mono,
    flexShrink: 0,
    width: 80,
  },
  scoreBefore: { color: colors.textDim },
  scoreArrow: { color: colors.textDim, fontSize: 10 },
  scoreAfter: { color: colors.text, fontWeight: 600 },
  deltaTag: {
    fontSize: 10,
    fontWeight: 600,
    fontFamily: fonts.mono,
    color: colors.success,
    backgroundColor: 'rgba(46, 125, 50, 0.06)',
    padding: '2px 8px',
    borderRadius: radii.sm,
    flexShrink: 0,
  },

  // ── Export ─────────────────────────────────────────────────────
  exportCard: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.bgPanel,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.sm,
    padding: `${spacing.lg}px ${spacing.xl}px`,
  },
  exportLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.md,
  },
  exportIcon: {
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
    fontSize: 13,
    fontWeight: 600,
    fontFamily: fonts.sans,
    color: colors.text,
    marginBottom: 2,
  },
  exportDesc: {
    fontSize: 12,
    fontFamily: fonts.sans,
    color: colors.textMuted,
    lineHeight: 1.5,
  },
};
