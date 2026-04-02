/**
 * OverviewTab — Stats grid, model split, budget gauge, activity timeline.
 * "What is the night shift doing?"
 */

import { useEffect, useRef } from 'react';
import { fonts, radii, spacing } from '../../staffing/styles/tokens.js';
import { CLAW } from '../theme.js';
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
  review: CLAW.success,
  flagged: CLAW.danger,
  error: CLAW.danger,
  delivery: CLAW.amber,
  scan: CLAW.textDim,
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
                <span style={{
                  ...styles.liveMessage,
                  ...(entry.severity === 'critical' ? { color: CLAW.danger, fontWeight: 600 } : {}),
                  ...(entry.severity === 'major' ? { color: CLAW.warning, fontWeight: 600 } : {}),
                  ...(entry.debatePhase === 'resolution' ? { color: CLAW.success, fontWeight: 600 } : {}),
                }}>{entry.message}</span>
                {entry.severity && (
                  <span style={{
                    display: 'inline-block',
                    width: 8, height: 8, borderRadius: '50%', marginLeft: 6,
                    background: entry.severity === 'critical' ? CLAW.danger : entry.severity === 'major' ? CLAW.warning : CLAW.success,
                  }} />
                )}
              </div>
              {entry.detail && (
                <div style={{
                  ...styles.liveDetail,
                  ...(entry.debatePhase ? { fontStyle: 'italic', paddingLeft: 12, borderLeft: `2px solid ${CLAW.border}` } : {}),
                }}>{entry.detail}</div>
              )}
              {entry.evidence && (
                <div style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 11,
                  color: CLAW.textMuted,
                  background: CLAW.panel,
                  padding: '6px 10px',
                  borderRadius: 6,
                  marginTop: 4,
                  lineHeight: 1.5,
                  borderLeft: `3px solid ${entry.severity === 'critical' ? CLAW.danger : entry.severity === 'major' ? CLAW.warning : CLAW.border}`,
                }}>
                  {entry.evidence}
                </div>
              )}
              {entry.type === 'precedent' && (
                <div style={{
                  fontSize: 11,
                  color: CLAW.success,
                  background: CLAW.successBg,
                  padding: '4px 8px',
                  borderRadius: 4,
                  marginTop: 4,
                  display: 'inline-block',
                }}>
                  Institutional memory updated
                </div>
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

      {/* Responsive stats grid style */}
      <style>{`
        .claw-stats-grid {
          display: grid;
          grid-template-columns: repeat(6, 1fr);
          gap: ${spacing.sm}px;
          margin-bottom: ${spacing.lg}px;
        }
        @media (max-width: 600px) {
          .claw-stats-grid {
            grid-template-columns: repeat(3, 1fr);
          }
        }
      `}</style>

      {/* Stats grid */}
      <div className="claw-stats-grid">
        <StatCard label="Documents" value={status.documents.total} />
        <StatCard label="Reviewed" value={status.documents.reviewed} color={CLAW.success} />
        <StatCard label="Flagged" value={status.documents.flagged} color={CLAW.danger} />
        <StatCard label="Pending" value={status.documents.pending} color="#B8860B" />
        <StatCard label="Errors" value={status.documents.errors} color={status.documents.errors > 0 ? CLAW.danger : CLAW.textMuted} />
        <StatCard label="Sessions" value={status.sessions.completed} />
      </div>

      {/* Cost forecast banner */}
      {status.forecast && status.forecast.pendingCount > 0 && (
        <div style={styles.forecastBanner}>
          <div style={styles.forecastMain}>
            <span style={styles.forecastCount}>{status.forecast.pendingCount}</span>
            <span style={styles.forecastLabel}>
              document{status.forecast.pendingCount === 1 ? '' : 's'} pending
            </span>
            {status.forecast.estimatedCostUsd > 0 ? (
              <span style={styles.forecastCost}>
                Est. ${status.forecast.estimatedCostUsd.toFixed(2)}
              </span>
            ) : (
              <span style={styles.forecastFree}>All local — $0</span>
            )}
          </div>
          <div style={styles.forecastMeta}>
            {status.forecast.confidentialCount > 0 && (
              <span style={styles.forecastMetaItem}>
                {'🔒'} {status.forecast.confidentialCount} local ($0)
              </span>
            )}
            {status.forecast.estimatedCostUsd > 0 && (
              <span style={styles.forecastMetaItem}>
                Budget after: ${status.forecast.budgetAfterUsd.toFixed(2)}
              </span>
            )}
            {status.forecast.skippedCount > 0 && (
              <span style={styles.forecastMetaItem}>
                {status.forecast.skippedCount} skipped
              </span>
            )}
          </div>
        </div>
      )}

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

      {/* Portfolio summary */}
      {status.portfolio && status.portfolio.findings.total > 0 && (
        <div style={styles.portfolioCard}>
          <div style={styles.sectionLabel}>Portfolio Intelligence</div>
          <div style={styles.portfolioGrid}>
            <div style={styles.portfolioStat}>
              <span style={{ ...styles.portfolioValue, color: CLAW.danger }}>{status.portfolio.findings.critical}</span>
              <span style={styles.portfolioLabel}>critical</span>
            </div>
            <div style={styles.portfolioStat}>
              <span style={{ ...styles.portfolioValue, color: '#B8860B' }}>{status.portfolio.findings.major}</span>
              <span style={styles.portfolioLabel}>major</span>
            </div>
            <div style={styles.portfolioStat}>
              <span style={{ ...styles.portfolioValue, color: CLAW.textMuted }}>{status.portfolio.findings.minor}</span>
              <span style={styles.portfolioLabel}>minor</span>
            </div>
            <div style={styles.portfolioStat}>
              <span style={styles.portfolioValue}>{status.portfolio.findings.total}</span>
              <span style={styles.portfolioLabel}>total findings</span>
            </div>
          </div>
          {status.portfolio.criticalDocuments.length > 0 && (
            <div style={styles.portfolioCritical}>
              <span style={styles.portfolioCriticalLabel}>Highest risk:</span>
              {status.portfolio.criticalDocuments.slice(0, 3).map((d, i) => (
                <span key={i} style={styles.portfolioCriticalDoc}>{d.name} ({d.critical})</span>
              ))}
            </div>
          )}
          {status.portfolio.topPatterns.length > 0 && (
            <div style={styles.portfolioPatterns}>
              {status.portfolio.topPatterns.map(p => (
                <span key={p} style={styles.portfolioPatternTag}>{p}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Activity timeline */}
      {activity.length > 0 && (
        <div style={styles.activitySection}>
          <div style={styles.sectionLabel}>Recent Activity</div>
          <div style={styles.timeline}>
            {activity.map((entry, i) => (
              <div key={i} style={styles.timelineEntry}>
                <div style={styles.timelineDotWrap}>
                  <div style={{ ...styles.timelineDot, backgroundColor: TYPE_COLORS[entry.type] ?? CLAW.textDim }} />
                  {i < activity.length - 1 && <div style={styles.timelineLine} />}
                </div>
                <div style={styles.timelineContent}>
                  <span style={{ ...styles.timelineType, color: TYPE_COLORS[entry.type] ?? CLAW.textDim }}>
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
      <div style={{ ...styles.statValue, color: color ?? CLAW.text }}>{value}</div>
      <div style={styles.statLabel}>{label}</div>
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  // statsGrid styles handled by .claw-stats-grid className for responsive breakpoints
  statsGrid: {},
  statCard: {
    backgroundColor: CLAW.surface,
    border: `1px solid ${CLAW.border}`,
    borderRadius: radii.md,
    padding: spacing.md,
    textAlign: 'center' as const,
  },
  statValue: {
    fontSize: 28,
    fontWeight: 300,
    fontFamily: fonts.serif,
    color: CLAW.text,
  },
  statLabel: {
    fontSize: 10,
    color: CLAW.textMuted,
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
    backgroundColor: CLAW.surface,
    border: `1px solid ${CLAW.border}`,
    borderRadius: radii.md,
    padding: spacing.md,
    textAlign: 'center' as const,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 2,
  },
  modelIcon: { fontSize: 20, marginBottom: 2 },
  modelCount: { fontSize: 28, fontWeight: 300, fontFamily: fonts.serif, color: CLAW.text },
  modelLabel: { fontSize: 13, fontWeight: 600, color: CLAW.text, fontFamily: fonts.sans },
  modelSublabel: { fontSize: 11, color: CLAW.textMuted, fontFamily: fonts.sans },

  liveSection: {
    backgroundColor: CLAW.surface,
    border: `1px solid ${CLAW.border}`,
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
    backgroundColor: CLAW.success,
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
    backgroundColor: 'rgba(250,249,246,0.02)',
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
    color: CLAW.text,
  },
  liveMessage: {
    fontSize: 12,
    fontFamily: fonts.sans,
    color: CLAW.textSecondary,
  },
  liveDetail: {
    fontSize: 11,
    fontFamily: fonts.mono,
    color: CLAW.textDim,
    marginTop: 2,
    lineHeight: 1.4,
  },
  liveWorking: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    backgroundColor: CLAW.amber,
    animation: 'clawPulse 1s ease-in-out infinite',
    flexShrink: 0,
    marginTop: 7,
  },
  activitySection: {
    backgroundColor: CLAW.surface,
    border: `1px solid ${CLAW.border}`,
    borderRadius: radii.md,
    padding: spacing.lg,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: 600,
    fontFamily: fonts.sans,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
    color: CLAW.textDim,
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
    backgroundColor: CLAW.border,
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
    color: CLAW.textSecondary,
  },
  timelineTime: {
    fontSize: 11,
    fontFamily: fonts.mono,
    color: CLAW.textDim,
  },
  forecastBanner: {
    padding: `${spacing.md}px ${spacing.lg}px`,
    backgroundColor: CLAW.amberBg,
    border: `1px solid ${CLAW.amberBorder}`,
    borderRadius: radii.md,
    marginBottom: spacing.lg,
  },
  forecastMain: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 8,
    marginBottom: 4,
  },
  forecastCount: {
    fontSize: 18,
    fontWeight: 700,
    fontFamily: fonts.sans,
    color: CLAW.amber,
  },
  forecastLabel: {
    fontSize: 13,
    fontFamily: fonts.sans,
    color: CLAW.text,
  },
  forecastCost: {
    fontSize: 13,
    fontWeight: 600,
    fontFamily: fonts.mono,
    color: CLAW.amber,
    marginLeft: 'auto',
  },
  forecastFree: {
    fontSize: 12,
    fontFamily: fonts.sans,
    color: CLAW.success,
    fontWeight: 600,
    marginLeft: 'auto',
  },
  forecastMeta: {
    display: 'flex',
    gap: 12,
    flexWrap: 'wrap' as const,
  },
  forecastMetaItem: {
    fontSize: 11,
    fontFamily: fonts.sans,
    color: CLAW.textDim,
  },
  portfolioCard: {
    padding: `${spacing.lg}px`,
    backgroundColor: CLAW.surface,
    border: `1px solid ${CLAW.border}`,
    borderRadius: radii.md,
    marginBottom: spacing.lg,
  },
  portfolioGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  portfolioStat: {
    textAlign: 'center' as const,
  },
  portfolioValue: {
    display: 'block',
    fontSize: 22,
    fontWeight: 700,
    fontFamily: fonts.mono,
    color: CLAW.text,
  },
  portfolioLabel: {
    fontSize: 9,
    fontFamily: fonts.sans,
    color: CLAW.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
  },
  portfolioCritical: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap' as const,
    marginBottom: spacing.sm,
  },
  portfolioCriticalLabel: {
    fontSize: 11,
    fontFamily: fonts.sans,
    color: CLAW.danger,
    fontWeight: 600,
  },
  portfolioCriticalDoc: {
    fontSize: 11,
    fontFamily: fonts.mono,
    color: CLAW.textMuted,
  },
  portfolioPatterns: {
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap' as const,
  },
  portfolioPatternTag: {
    fontSize: 10,
    fontFamily: fonts.sans,
    color: CLAW.amber,
    backgroundColor: CLAW.amberBg,
    padding: '2px 8px',
    borderRadius: 999,
  },
};
