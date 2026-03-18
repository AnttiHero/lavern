/**
 * DeliverySkeleton — Content-shaped loading placeholder for the delivery view.
 */
import { colors, fonts, radii, spacing } from '../../staffing/styles/tokens.js';

export function DeliverySkeleton() {
  return (
    <div style={styles.container}>
      {/* Header skeleton */}
      <div style={styles.headerArea}>
        <div style={{ ...styles.bone, width: 180, height: 14 }} />
        <div style={{ ...styles.bone, width: 260, height: 24, marginTop: 12 }} />
        <div style={{ ...styles.bone, width: 120, height: 10, marginTop: 8 }} />
      </div>

      {/* Tab bar skeleton */}
      <div style={styles.tabBar}>
        {[80, 70, 65, 90, 75, 85].map((w, i) => (
          <div key={i} style={{ ...styles.bone, width: w, height: 28, borderRadius: 14 }} />
        ))}
      </div>

      {/* Content skeleton */}
      <div style={styles.contentArea}>
        <div style={{ ...styles.bone, width: '60%', height: 18, marginBottom: 16 }} />
        <div style={{ ...styles.bone, width: '100%', height: 12, marginBottom: 10 }} />
        <div style={{ ...styles.bone, width: '90%', height: 12, marginBottom: 10 }} />
        <div style={{ ...styles.bone, width: '75%', height: 12, marginBottom: 10 }} />
        <div style={{ ...styles.bone, width: '85%', height: 12, marginBottom: 24 }} />

        <div style={{ ...styles.bone, width: '45%', height: 16, marginBottom: 14 }} />
        <div style={{ ...styles.bone, width: '100%', height: 12, marginBottom: 10 }} />
        <div style={{ ...styles.bone, width: '95%', height: 12, marginBottom: 10 }} />
        <div style={{ ...styles.bone, width: '70%', height: 12, marginBottom: 10 }} />
      </div>

      {/* Status text */}
      <div style={styles.statusArea}>
        <div style={styles.breathingM}>M</div>
        <div style={styles.statusText}>Preparing your delivery</div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: `${spacing.xl}px 0`,
  },
  headerArea: {
    marginBottom: spacing.xl,
  },
  tabBar: {
    display: 'flex',
    gap: 8,
    marginBottom: spacing.xxl,
    flexWrap: 'wrap' as const,
  },
  contentArea: {
    padding: `${spacing.lg}px 0`,
  },
  bone: {
    backgroundColor: colors.border,
    borderRadius: radii.sm,
    animation: 'skeletonPulse 1.8s ease-in-out infinite',
  },
  statusArea: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    paddingTop: spacing.xl,
  },
  breathingM: {
    fontFamily: fonts.serif,
    fontSize: 28,
    fontWeight: 300,
    color: colors.text,
    lineHeight: 1,
    animation: 'lavernLoadBreath 2.4s ease-in-out infinite',
  },
  statusText: {
    fontFamily: fonts.sans,
    fontSize: 11,
    fontWeight: 500,
    color: colors.textDim,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
    marginTop: 10,
  },
};
