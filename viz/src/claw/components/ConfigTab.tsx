/**
 * ConfigTab — Profile, watch paths, sensitivity patterns.
 * "What is the night shift watching?"
 */

import { colors, fonts, radii, spacing } from '../../staffing/styles/tokens.js';
import type { ClawProfile } from '../hooks/useClawData.js';

interface Props {
  profile: ClawProfile;
  watchPaths: string[];
  budget: { totalUsd: number; perDocMax?: number };
  demoMode: boolean;
}

export function ConfigTab({ profile, watchPaths, budget, demoMode }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: spacing.md }}>
      {/* Profile */}
      <div style={styles.card}>
        <div style={styles.cardTitle}>Client Profile</div>
        <div style={styles.fieldGrid}>
          <Field label="Company" value={profile.company} />
          <Field label="Jurisdiction" value={profile.jurisdiction} />
          <Field label="Industry" value={profile.industry} />
          {profile.size && <Field label="Size" value={profile.size} />}
          <Field label="Style" value={profile.style} />
          <Field label="Intensity" value={profile.intensity} />
          <Field label="Risk Appetite" value={profile.riskAppetite} />
          <Field label="Created" value={new Date(profile.createdAt).toLocaleDateString()} />
        </div>
        {profile.concerns && profile.concerns.length > 0 && (
          <div style={styles.concernsRow}>
            <span style={styles.fieldLabel}>Concerns:</span>
            {profile.concerns.map((c, i) => (
              <span key={i} style={styles.concernPill}>{c}</span>
            ))}
          </div>
        )}
      </div>

      {/* Watch Paths */}
      <div style={styles.card}>
        <div style={styles.cardTitle}>Watch Paths</div>
        {watchPaths.length === 0 ? (
          <div style={styles.emptyText}>No watch paths configured.</div>
        ) : (
          <ul style={styles.pathList}>
            {watchPaths.map((p, i) => (
              <li key={i} style={styles.pathItem}>
                <span style={styles.folderIcon}>📁</span>
                {p}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Budget Config */}
      <div style={styles.card}>
        <div style={styles.cardTitle}>Budget Configuration</div>
        <div style={styles.fieldGrid}>
          <Field label="Total Budget" value={`$${budget.totalUsd.toFixed(2)}`} />
          {budget.perDocMax && <Field label="Per-Document Max" value={`$${budget.perDocMax.toFixed(2)}`} />}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.field}>
      <span style={styles.fieldLabel}>{label}</span>
      <span style={styles.fieldValue}>{value}</span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    backgroundColor: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.md,
    padding: spacing.lg,
  },
  cardTitle: {
    fontFamily: fonts.serif,
    fontSize: 16,
    fontWeight: 600,
    color: colors.text,
    marginBottom: spacing.md,
  },
  fieldGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: `${spacing.sm}px ${spacing.lg}px`,
  },
  field: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 2,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: 600,
    fontFamily: fonts.sans,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    color: colors.textDim,
  },
  fieldValue: {
    fontSize: 13,
    fontFamily: fonts.sans,
    color: colors.text,
  },
  concernsRow: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTop: `1px solid ${colors.border}`,
  },
  concernPill: {
    fontSize: 11,
    fontFamily: fonts.sans,
    color: colors.textSecondary,
    backgroundColor: colors.bgPanel,
    padding: '2px 10px',
    borderRadius: radii.pill,
    border: `1px solid ${colors.border}`,
  },
  pathList: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
  },
  pathItem: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    padding: '8px 0',
    borderBottom: `1px solid ${colors.border}`,
    fontSize: 13,
    fontFamily: fonts.mono,
    color: colors.textSecondary,
  },
  folderIcon: {
    fontSize: 14,
    flexShrink: 0,
  },
  emptyText: {
    fontSize: 13,
    fontFamily: fonts.sans,
    color: colors.textDim,
    fontStyle: 'italic' as const,
  },
};
