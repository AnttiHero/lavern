/**
 * NextStepsTab — Implementation guide, checklist, watch-outs,
 * and review schedule recommendations.
 */

import type { DeliveryData } from '../hooks/useDeliveryData.js';
import { colors, fonts, radii, spacing } from '../../staffing/styles/tokens.js';

interface Props {
  data: DeliveryData;
}

export function NextStepsTab({ data }: Props) {
  const actions = data.nextSteps.filter(s => s.kind === 'action');
  const watchouts = data.nextSteps.filter(s => s.kind === 'watchout');
  const schedules = data.nextSteps.filter(s => s.kind === 'schedule');

  if (data.nextSteps.length === 0) {
    return (
      <div style={styles.empty}>
        <div style={styles.emptyText}>
          Implementation guidance will be available after a live session completes.
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 style={styles.heading}>Implementation Guide</h2>
      <p style={styles.intro}>
        Practical steps for putting the delivered work into use.
      </p>

      {/* Action items */}
      {actions.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Action Items</div>
          <div style={styles.list}>
            {actions.map((item, i) => (
              <div
                key={i}
                style={{
                  ...styles.item,
                  animation: `cardStaggerUp 0.4s ease ${i * 0.06}s both`,
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
              >
                <div style={styles.checkboxRow}>
                  <div style={styles.checkbox}>
                    <span style={styles.checkNumber}>{i + 1}</span>
                  </div>
                  <div style={styles.itemContent}>
                    <div style={styles.itemLabel}>{item.label}</div>
                    <div style={styles.itemDesc}>{item.description}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Watch-outs */}
      {watchouts.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Watch-Outs</div>
          <div style={styles.watchoutList}>
            {watchouts.map((item, i) => (
              <div
                key={i}
                style={{
                  ...styles.watchoutCard,
                  animation: `cardStaggerUp 0.4s ease ${i * 0.06}s both`,
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.06)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
              >
                <div style={styles.watchoutIcon}>{'\u26A0'}</div>
                <div style={styles.itemContent}>
                  <div style={styles.itemLabel}>{item.label}</div>
                  <div style={styles.itemDesc}>{item.description}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Schedule */}
      {schedules.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Review Schedule</div>
          <div style={styles.list}>
            {schedules.map((item, i) => (
              <div
                key={i}
                style={{
                  ...styles.scheduleCard,
                  animation: `cardStaggerUp 0.4s ease ${i * 0.06}s both`,
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
              >
                <div style={styles.scheduleIcon}>{'\u25CB'}</div>
                <div style={styles.itemContent}>
                  <div style={styles.itemLabel}>{item.label}</div>
                  <div style={styles.itemDesc}>{item.description}</div>
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

  // Action list
  list: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: spacing.sm,
  },
  item: {
    backgroundColor: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.md,
    padding: spacing.lg,
    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
  },
  checkboxRow: {
    display: 'flex',
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: '50%',
    border: `2px solid ${colors.border}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 2,
  },
  checkNumber: {
    fontSize: 12,
    fontWeight: 600,
    color: colors.textDim,
    fontFamily: fonts.mono,
  },
  itemContent: { flex: 1 },
  itemLabel: {
    fontSize: 14,
    fontWeight: 600,
    color: colors.text,
    marginBottom: 4,
  },
  itemDesc: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 1.6,
  },

  // Watch-outs
  watchoutList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: spacing.sm,
  },
  watchoutCard: {
    display: 'flex',
    gap: spacing.md,
    alignItems: 'flex-start',
    backgroundColor: colors.warningBg,
    border: `1px solid rgba(184, 134, 11, 0.15)`,
    borderRadius: radii.md,
    padding: spacing.lg,
    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
  },
  watchoutIcon: {
    fontSize: 16,
    flexShrink: 0,
    marginTop: 2,
  },

  // Schedule
  scheduleCard: {
    display: 'flex',
    gap: spacing.md,
    alignItems: 'flex-start',
    backgroundColor: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.md,
    padding: spacing.lg,
    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
  },
  scheduleIcon: {
    fontSize: 16,
    flexShrink: 0,
    marginTop: 2,
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
