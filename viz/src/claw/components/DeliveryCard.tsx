/**
 * DeliveryCard — Single delivery bundle display.
 */

import { fonts, radii, spacing } from '../../staffing/styles/tokens.js';
import { CLAW } from '../theme.js';
import type { ClawDelivery } from '../hooks/useClawData.js';
import { StatusBadge } from './StatusBadge.js';
import { FindingsBadges } from './FindingsBadges.js';

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const min = Math.floor(seconds / 60);
  const sec = Math.round(seconds % 60);
  return `${min}m ${sec}s`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

interface Props {
  delivery: ClawDelivery;
}

export function DeliveryCard({ delivery }: Props) {
  const findings = {
    critical: delivery.findings.criticalCount,
    major: delivery.findings.majorCount,
    minor: delivery.findings.minorCount,
  };

  return (
    <div style={{
      ...styles.card,
      borderLeftColor: delivery.status === 'failed' ? CLAW.danger
        : delivery.status === 'partial' ? CLAW.amber
        : CLAW.success,
    }}>
      <div style={styles.topRow}>
        <div style={styles.nameWrap}>
          {delivery.confidential && <span style={styles.lockIcon}>🔒 </span>}
          <span style={styles.filename}>{delivery.filename}</span>
        </div>
        <StatusBadge status={delivery.status} />
      </div>

      <div style={styles.type}>{delivery.type}</div>

      <div style={styles.metaRow}>
        <span style={styles.workflowBadge}>{delivery.workflow}</span>
        <FindingsBadges findings={findings} />
        <span style={styles.meta}>
          {delivery.confidential ? 'Local · $0' : `$${delivery.costUsd.toFixed(2)}`}
        </span>
        <span style={styles.meta}>{formatDuration(delivery.durationSeconds)}</span>
      </div>

      {/* Change detection diff */}
      {delivery.diff && (delivery.diff.added > 0 || delivery.diff.resolved > 0 || delivery.diff.changed > 0) && (
        <div style={styles.diffRow}>
          {delivery.diff.added > 0 && <span style={styles.diffAdded}>+{delivery.diff.added} new</span>}
          {delivery.diff.resolved > 0 && <span style={styles.diffResolved}>-{delivery.diff.resolved} resolved</span>}
          {delivery.diff.changed > 0 && <span style={styles.diffChanged}>~{delivery.diff.changed} changed</span>}
        </div>
      )}

      <div style={styles.timestamp}>{formatDate(delivery.completedAt)}</div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    backgroundColor: CLAW.surface,
    border: `1px solid ${CLAW.border}`,
    borderLeft: '3px solid',
    borderRadius: radii.md,
    padding: spacing.lg,
    transition: 'border-color 0.2s ease',
  },
  topRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  nameWrap: {
    display: 'flex',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  lockIcon: {
    fontSize: 12,
    flexShrink: 0,
  },
  filename: {
    fontSize: 13,
    fontFamily: fonts.mono,
    fontWeight: 500,
    color: CLAW.text,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  type: {
    fontSize: 12,
    fontFamily: fonts.sans,
    color: CLAW.textMuted,
    marginBottom: spacing.sm,
  },
  metaRow: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  workflowBadge: {
    fontSize: 9,
    fontWeight: 600,
    fontFamily: fonts.sans,
    letterSpacing: 0.8,
    textTransform: 'uppercase' as const,
    color: CLAW.amber,
    backgroundColor: CLAW.amberBg,
    padding: '2px 8px',
    borderRadius: radii.pill,
    border: `1px solid ${CLAW.amberBorder}`,
  },
  meta: {
    fontSize: 12,
    fontFamily: fonts.mono,
    color: CLAW.textDim,
  },
  timestamp: {
    fontSize: 11,
    fontFamily: fonts.mono,
    color: CLAW.textDim,
    marginTop: 4,
  },
  diffRow: {
    display: 'flex',
    gap: 8,
    marginTop: 6,
    flexWrap: 'wrap' as const,
  },
  diffAdded: {
    fontSize: 11,
    fontWeight: 600,
    fontFamily: fonts.mono,
    color: CLAW.success,
  },
  diffResolved: {
    fontSize: 11,
    fontWeight: 600,
    fontFamily: fonts.mono,
    color: CLAW.danger,
  },
  diffChanged: {
    fontSize: 11,
    fontWeight: 600,
    fontFamily: fonts.mono,
    color: CLAW.amber,
  },
};
