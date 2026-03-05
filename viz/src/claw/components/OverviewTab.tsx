/**
 * OverviewTab — Stats grid, model split, budget gauge, activity timeline.
 * "What is the night shift doing?"
 */

import { useEffect, useRef } from 'react';
import { colors, fonts, radii, spacing } from '../../staffing/styles/tokens.js';
import type { ClawStatus, ClawDocument, ClawDelivery } from '../hooks/useClawData.js';
import type { ClawLogEntry } from '../hooks/useClawDemoSimulator.js';
import { BudgetGauge } from './BudgetGauge.js';

interface Props {
  status: ClawStatus;
  documents: ClawDocument[];
  deliveries: ClawDelivery[];
  demoMode: boolean;
  activityLog?: ClawLogEntry[];
}

// ── Activity synthesis ──────────────────────────────────────────────────

interface ActivityEntry {
  type: 'review' | 'flagged' | 'error' | 'delivery' | 'scan';
  label: string;
  timestamp: string;
}

function synthesizeActivity(documents: ClawDocument[], deliveries: ClawDelivery[]): ActivityEntry[] {
  const entries: ActivityEntry[] = [];

  for (const doc of documents) {
    if (doc.lastReviewed) {
      entries.push({
        type: doc.status === 'flagged' ? 'flagged' : doc.status === 'error' ? 'error' : 'review',
        label: doc.name,
        timestamp: doc.lastReviewed,
      });
    }
  }

  for (const del of deliveries) {
    entries.push({
      type: 'delivery',
      label: del.filename,
      timestamp: del.completedAt,
    });
  }

  entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return entries.slice(0, 8);
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const TYPE_COLORS: Record<string, string> = {
  review: colors.success,
  flagged: colors.danger,
  error: colors.danger,
  delivery: '#B8860B',
  scan: colors.textDim,
};

const TYPE_LABELS: Record<string, string> = {
  review: 'Reviewed',
  flagged: 'Flagged',
  error: 'Failed',
  delivery: 'Delivered',
  scan: 'Scanned',
};

// ── Component ───────────────────────────────────────────────────────────

// ── Live Activity Feed ──────────────────────────────────────────────────

function LiveActivityFeed({ entries }: { entries: ClawLogEntry[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new entries appear
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries.length]);

  return (
    <div style={styles.liveSection}>
      <div style={styles.liveHeader}>
        <span style={styles.liveDot} />
        <span style={styles.sectionLabel}>Live Activity</span>
      </div>
      <div ref={scrollRef} style={styles.liveFeed}>
        {entries.map((entry, i) => (
          <div
            key={entry.id}
            style={{
              ...styles.liveEntry,
              animation: 'clawFadeIn 0.4s ease-out',
              animationFillMode: 'backwards',
              animationDelay: `${Math.max(0, (i - Math.max(0, entries.length - 3)) * 0.05)}s`,
            }}
          >
            <span style={styles.liveIcon}>{entry.icon}</span>
            <div style={styles.liveBody}>
              <div style={styles.liveLine}>
                {entry.agent && <span style={styles.liveAgent}>{entry.agent}</span>}
                <span style={styles.liveMessage}>{entry.message}</span>
              </div>
              {entry.detail && (
                <div style={styles.liveDetail}>{entry.detail}</div>
              )}
            </div>
            {entry.type === 'agent' && <span style={styles.liveWorking} />}
          </div>
        ))}
      </div>
      <style>{`
        @keyframes clawFadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes clawPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}

export function OverviewTab({ status, documents, deliveries, demoMode, activityLog }: Props) {
  const activity = synthesizeActivity(documents, deliveries);

  return (
    <div>
      {/* Live activity feed (during demo) */}
      {activityLog && activityLog.length > 0 && (
        <LiveActivityFeed entries={activityLog} />
      )}

      {/* Stats grid */}
      <div style={styles.statsGrid}>
        <StatCard label="Documents" value={status.documents.total} />
        <StatCard label="Reviewed" value={status.documents.reviewed} color={colors.success} />
        <StatCard label="Flagged" value={status.documents.flagged} color={colors.danger} />
        <StatCard label="Pending" value={status.documents.pending} color="#B8860B" />
        <StatCard label="Errors" value={status.documents.errors} color={status.documents.errors > 0 ? colors.danger : colors.textMuted} />
        <StatCard label="Sessions" value={status.sessions.completed} />
      </div>

      {/* Model split */}
      {(status.documents.confidential > 0 || status.documents.frontier > 0) && (
        <div style={styles.modelRow}>
          <div style={styles.modelCard}>
            <div style={styles.modelIcon}>🔒</div>
            <div style={styles.modelCount}>{status.documents.confidential}</div>
            <div style={styles.modelLabel}>Local</div>
            <div style={styles.modelSublabel}>On-device · $0 · Privilege preserved</div>
          </div>
          <div style={styles.modelCard}>
            <div style={styles.modelIcon}>☁️</div>
            <div style={styles.modelCount}>{status.documents.frontier}</div>
            <div style={styles.modelLabel}>Frontier</div>
            <div style={styles.modelSublabel}>Claude · Full multi-agent pipeline</div>
          </div>
        </div>
      )}

      {/* Budget */}
      <div style={{ marginBottom: spacing.lg }}>
        <BudgetGauge
          spent={status.budget.spentUsd}
          total={status.budget.totalUsd}
          exhausted={status.budget.exhausted}
        />
      </div>

      {/* Activity timeline */}
      {activity.length > 0 && (
        <div style={styles.activitySection}>
          <div style={styles.sectionLabel}>Recent Activity</div>
          <div style={styles.timeline}>
            {activity.map((entry, i) => (
              <div key={i} style={styles.timelineEntry}>
                <div style={styles.timelineDotWrap}>
                  <div style={{ ...styles.timelineDot, backgroundColor: TYPE_COLORS[entry.type] ?? colors.textDim }} />
                  {i < activity.length - 1 && <div style={styles.timelineLine} />}
                </div>
                <div style={styles.timelineContent}>
                  <span style={{ ...styles.timelineType, color: TYPE_COLORS[entry.type] ?? colors.textDim }}>
                    {TYPE_LABELS[entry.type] ?? entry.type}
                  </span>
                  <span style={styles.timelineLabel}>{entry.label}</span>
                  <span style={styles.timelineTime}>{formatTime(entry.timestamp)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div style={styles.statCard}>
      <div style={{ ...styles.statValue, color: color ?? colors.text }}>{value}</div>
      <div style={styles.statLabel}>{label}</div>
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(6, 1fr)',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  statCard: {
    backgroundColor: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.md,
    padding: spacing.md,
    textAlign: 'center' as const,
  },
  statValue: {
    fontSize: 28,
    fontWeight: 700,
    fontFamily: fonts.serif,
  },
  statLabel: {
    fontSize: 10,
    color: colors.textMuted,
    fontFamily: fonts.sans,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    marginTop: 2,
  },
  modelRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  modelCard: {
    backgroundColor: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.md,
    padding: spacing.md,
    textAlign: 'center' as const,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 2,
  },
  modelIcon: { fontSize: 20, marginBottom: 2 },
  modelCount: { fontSize: 28, fontWeight: 700, fontFamily: fonts.serif },
  modelLabel: { fontSize: 13, fontWeight: 600, color: colors.text, fontFamily: fonts.sans },
  modelSublabel: { fontSize: 11, color: colors.textMuted, fontFamily: fonts.sans },

  liveSection: {
    backgroundColor: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  liveHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: spacing.md,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    backgroundColor: colors.success,
    animation: 'clawPulse 1.5s ease-in-out infinite',
    flexShrink: 0,
  },
  liveFeed: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 6,
    maxHeight: 320,
    overflowY: 'auto' as const,
  },
  liveEntry: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    padding: '8px 10px',
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.02)',
  },
  liveIcon: {
    fontSize: 14,
    flexShrink: 0,
    lineHeight: '20px',
  },
  liveBody: {
    flex: 1,
    minWidth: 0,
  },
  liveLine: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 6,
    flexWrap: 'wrap' as const,
  },
  liveAgent: {
    fontSize: 12,
    fontWeight: 600,
    fontFamily: fonts.sans,
    color: colors.text,
  },
  liveMessage: {
    fontSize: 12,
    fontFamily: fonts.sans,
    color: colors.textSecondary,
  },
  liveDetail: {
    fontSize: 11,
    fontFamily: fonts.mono,
    color: colors.textDim,
    marginTop: 2,
    lineHeight: 1.4,
  },
  liveWorking: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    backgroundColor: '#B8860B',
    animation: 'clawPulse 1s ease-in-out infinite',
    flexShrink: 0,
    marginTop: 7,
  },
  activitySection: {
    backgroundColor: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.md,
    padding: spacing.lg,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: 600,
    fontFamily: fonts.sans,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
    color: colors.textDim,
    marginBottom: spacing.md,
  },
  timeline: {
    display: 'flex',
    flexDirection: 'column' as const,
  },
  timelineEntry: {
    display: 'flex',
    gap: spacing.md,
    minHeight: 36,
  },
  timelineDotWrap: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    width: 12,
    flexShrink: 0,
    paddingTop: 4,
  },
  timelineDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    flexShrink: 0,
  },
  timelineLine: {
    width: 1,
    flex: 1,
    backgroundColor: colors.border,
    marginTop: 4,
  },
  timelineContent: {
    display: 'flex',
    alignItems: 'baseline',
    gap: spacing.sm,
    paddingBottom: spacing.sm,
    flexWrap: 'wrap' as const,
  },
  timelineType: {
    fontSize: 10,
    fontWeight: 600,
    fontFamily: fonts.sans,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  timelineLabel: {
    fontSize: 13,
    fontFamily: fonts.mono,
    color: colors.textSecondary,
  },
  timelineTime: {
    fontSize: 11,
    fontFamily: fonts.mono,
    color: colors.textDim,
  },
};
