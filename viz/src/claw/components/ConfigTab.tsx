/**
 * ConfigTab — Profile, watch paths, sensitivity patterns, ethical mode.
 * "What is the night shift watching?"
 */

import { fonts, radii, spacing } from '../../staffing/styles/tokens.js';
import { CLAW } from '../theme.js';
import type { ClawProfile } from '../hooks/useClawData.js';

/** EU sovereign blue — same as ProviderToggle. */
const EU_COLOR = '#2E5D9C';
const EU_BG = 'rgba(46, 93, 156, 0.07)';

interface Props {
  profile: ClawProfile;
  watchPaths: string[];
  budget: { totalUsd: number; perDocMax?: number };
  demoMode: boolean;
  ethicalMode: boolean;
  onToggleEthical: (enabled: boolean) => void;
  lastHeartbeat?: string;
}

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export function ConfigTab({ profile, watchPaths, budget, demoMode, ethicalMode, onToggleEthical, lastHeartbeat }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: spacing.md }}>
      {/* Ethical Mode — prominent, top of config */}
      <div style={{
        ...styles.card,
        borderColor: ethicalMode ? EU_COLOR : CLAW.border,
        borderWidth: ethicalMode ? 2 : 1,
        backgroundColor: ethicalMode ? EU_BG : CLAW.surface,
      }}>
        <div style={styles.ethicalHeader}>
          <div style={styles.ethicalLeft}>
            <span style={styles.ethicalIcon}>{'\uD83D\uDEE1\uFE0F'}</span>
            <div>
              <div style={{
                ...styles.cardTitle,
                marginBottom: 2,
                color: ethicalMode ? EU_COLOR : CLAW.text,
              }}>
                Maximum Ethical Mode
              </div>
              <div style={{
                fontSize: 12,
                fontFamily: fonts.sans,
                color: ethicalMode ? EU_COLOR : CLAW.textMuted,
              }}>
                One setting. Maximum protection.
              </div>
            </div>
          </div>
          <button
            onClick={() => onToggleEthical(!ethicalMode)}
            style={{
              ...styles.ethicalToggle,
              backgroundColor: ethicalMode ? EU_COLOR : 'transparent',
              color: ethicalMode ? '#fff' : CLAW.textSecondary,
              borderColor: ethicalMode ? EU_COLOR : CLAW.border,
            }}
            onMouseEnter={e => {
              if (!ethicalMode) {
                e.currentTarget.style.borderColor = EU_COLOR;
                e.currentTarget.style.color = EU_COLOR;
              }
            }}
            onMouseLeave={e => {
              if (!ethicalMode) {
                e.currentTarget.style.borderColor = CLAW.border;
                e.currentTarget.style.color = CLAW.textSecondary;
              }
            }}
          >
            {ethicalMode ? 'ON' : 'OFF'}
          </button>
        </div>

        <div style={styles.ethicalDetails}>
          <div style={styles.ethicalBullet}>
            <span style={styles.bulletCheck}>{ethicalMode ? '\u2713' : '\u2022'}</span>
            EU-only processing (Mistral)
          </div>
          <div style={styles.ethicalBullet}>
            <span style={styles.bulletCheck}>{ethicalMode ? '\u2713' : '\u2022'}</span>
            All documents treated as confidential
          </div>
          <div style={styles.ethicalBullet}>
            <span style={styles.bulletCheck}>{ethicalMode ? '\u2713' : '\u2022'}</span>
            Local analysis when available ($0)
          </div>
          <div style={styles.ethicalBullet}>
            <span style={styles.bulletCheck}>{ethicalMode ? '\u2713' : '\u2022'}</span>
            Conservative risk assessment
          </div>
        </div>

        {ethicalMode && (
          <div style={styles.ethicalNote}>
            Your data never leaves Europe. When a local model is available, it never leaves your machine.
          </div>
        )}
      </div>

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
                <span style={styles.folderIcon}>{'\uD83D\uDCC1'}</span>
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

      {/* Heartbeat */}
      {lastHeartbeat && (
        <div style={styles.card}>
          <div style={styles.cardTitle}>Heartbeat</div>
          <div style={styles.fieldGrid}>
            <Field label="Last Heartbeat" value={formatRelativeTime(lastHeartbeat)} />
          </div>
        </div>
      )}
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
    backgroundColor: CLAW.surface,
    border: `1px solid ${CLAW.border}`,
    borderRadius: radii.md,
    padding: spacing.lg,
    transition: 'border-color 0.2s ease, background-color 0.2s ease',
  },
  cardTitle: {
    fontFamily: fonts.serif,
    fontSize: 16,
    fontWeight: 300,
    color: CLAW.text,
    marginBottom: spacing.md,
  },
  ethicalHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  ethicalLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
  },
  ethicalIcon: {
    fontSize: 24,
    flexShrink: 0,
  },
  ethicalToggle: {
    padding: '6px 18px',
    borderRadius: radii.sm,
    border: `1.5px solid ${CLAW.border}`,
    fontFamily: fonts.sans,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 1.5,
    cursor: 'pointer',
    transition: 'background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease',
    flexShrink: 0,
  },
  ethicalDetails: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 6,
    paddingTop: spacing.sm,
    borderTop: `1px solid rgba(46, 93, 156, 0.15)`,
  },
  ethicalBullet: {
    fontSize: 12,
    fontFamily: fonts.sans,
    color: CLAW.textSecondary,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  bulletCheck: {
    fontSize: 12,
    fontWeight: 600,
    color: EU_COLOR,
    width: 14,
    textAlign: 'center' as const,
    flexShrink: 0,
  },
  ethicalNote: {
    fontSize: 11,
    fontFamily: fonts.sans,
    color: EU_COLOR,
    marginTop: spacing.sm,
    padding: '6px 10px',
    borderRadius: radii.sm,
    backgroundColor: 'rgba(46, 93, 156, 0.04)',
    fontStyle: 'italic' as const,
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
    color: CLAW.textDim,
  },
  fieldValue: {
    fontSize: 13,
    fontFamily: fonts.sans,
    color: CLAW.text,
  },
  concernsRow: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTop: `1px solid ${CLAW.border}`,
  },
  concernPill: {
    fontSize: 11,
    fontFamily: fonts.sans,
    color: CLAW.textSecondary,
    backgroundColor: CLAW.input,
    padding: '2px 10px',
    borderRadius: radii.pill,
    border: `1px solid ${CLAW.border}`,
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
    borderBottom: `1px solid ${CLAW.border}`,
    fontSize: 13,
    fontFamily: fonts.mono,
    color: CLAW.textSecondary,
  },
  folderIcon: {
    fontSize: 14,
    flexShrink: 0,
  },
  emptyText: {
    fontSize: 13,
    fontFamily: fonts.sans,
    color: CLAW.textDim,
    fontStyle: 'italic' as const,
  },
};
