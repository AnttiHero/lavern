/**
 * UsageAnalytics — 8-week engagement history with inline SVG bar chart.
 *
 * Shows: weekly engagement count, spend trend, workflow breakdown, avg cost.
 * Fetches from GET /api/billing/analytics.
 */

import { useState, useEffect } from 'react';
import { colors, fonts, spacing, radii } from '../staffing/styles/tokens.js';

interface WeekData { week: string; engagements: number; costUsd: number }
interface WorkflowData { workflowId: string; count: number }
interface AnalyticsData {
  weeks: WeekData[];
  workflows: WorkflowData[];
  avgSessionCost: number;
  totalEngagements: number;
  hoursRemaining: number;
}

export function UsageAnalytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);

  useEffect(() => {
    fetch('/api/billing/analytics', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setData(d); })
      .catch(() => {});
  }, []);

  if (!data || data.totalEngagements === 0) return null;

  const maxEngagements = Math.max(...data.weeks.map(w => w.engagements), 1);

  return (
    <div style={styles.card}>
      {/* ── Bar chart: engagements per week ──────────────────────── */}
      <div style={styles.chartHeader}>
        <span style={styles.chartTitle}>Engagements per week</span>
        <span style={styles.chartMeta}>{data.totalEngagements} total</span>
      </div>
      <svg viewBox="0 0 320 100" style={styles.svg}>
        {data.weeks.map((w, i) => {
          const barH = (w.engagements / maxEngagements) * 70;
          const x = i * (320 / data.weeks.length) + 4;
          const bw = (320 / data.weeks.length) - 8;
          return (
            <g key={w.week}>
              <rect
                x={x}
                y={90 - barH}
                width={bw}
                height={Math.max(barH, 1)}
                rx={3}
                fill={w.engagements > 0 ? 'rgba(26, 26, 26, 0.7)' : 'rgba(26, 26, 26, 0.08)'}
              />
              {w.engagements > 0 && (
                <text
                  x={x + bw / 2}
                  y={85 - barH}
                  textAnchor="middle"
                  fontSize="9"
                  fill="rgba(26, 26, 26, 0.5)"
                  fontFamily={fonts.sans}
                >
                  {w.engagements}
                </text>
              )}
              <text
                x={x + bw / 2}
                y={99}
                textAnchor="middle"
                fontSize="7"
                fill="rgba(26, 26, 26, 0.35)"
                fontFamily={fonts.sans}
              >
                {w.week.slice(5)}
              </text>
            </g>
          );
        })}
      </svg>

      {/* ── Stats row ────────────────────────────────────────────── */}
      <div style={styles.statsRow}>
        <div style={styles.stat}>
          <div style={styles.statValue}>${data.avgSessionCost.toFixed(2)}</div>
          <div style={styles.statLabel}>avg cost</div>
        </div>
        <div style={styles.stat}>
          <div style={styles.statValue}>{data.hoursRemaining.toFixed(0)}h</div>
          <div style={styles.statLabel}>remaining</div>
        </div>
        {data.workflows.length > 0 && (
          <div style={styles.stat}>
            <div style={styles.statValue}>{data.workflows[0].workflowId}</div>
            <div style={styles.statLabel}>most used</div>
          </div>
        )}
      </div>

      {/* ── Workflow breakdown ────────────────────────────────────── */}
      {data.workflows.length > 1 && (
        <div style={styles.workflowSection}>
          <div style={styles.chartTitle}>By workflow</div>
          {data.workflows.map(w => {
            const pct = (w.count / data.totalEngagements) * 100;
            return (
              <div key={w.workflowId} style={styles.workflowRow}>
                <span style={styles.workflowName}>{w.workflowId}</span>
                <div style={styles.workflowBar}>
                  <div style={{ ...styles.workflowFill, width: `${pct}%` }} />
                </div>
                <span style={styles.workflowCount}>{w.count}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  card: {
    width: '100%',
    maxWidth: 520,
    margin: '0 auto',
    padding: `${spacing.xl}px ${spacing.lg}px`,
    backgroundColor: 'rgba(26, 26, 26, 0.02)',
    border: '1px solid rgba(26, 26, 26, 0.06)',
    borderRadius: radii.md,
  },
  chartHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: spacing.md,
  },
  chartTitle: {
    fontFamily: fonts.serif,
    fontSize: 14,
    fontWeight: 400,
    fontStyle: 'italic' as const,
    color: colors.textMuted,
  },
  chartMeta: {
    fontFamily: fonts.sans,
    fontSize: 11,
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  svg: {
    width: '100%',
    height: 'auto',
    display: 'block',
    marginBottom: spacing.lg,
  },
  statsRow: {
    display: 'flex',
    gap: spacing.xl,
    justifyContent: 'center',
    padding: `${spacing.md}px 0`,
    borderTop: '1px solid rgba(26, 26, 26, 0.06)',
  },
  stat: { textAlign: 'center' as const },
  statValue: {
    fontFamily: fonts.sans,
    fontSize: 16,
    fontWeight: 600,
    color: colors.text,
    letterSpacing: -0.3,
  },
  statLabel: {
    fontFamily: fonts.sans,
    fontSize: 10,
    color: colors.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
    marginTop: 2,
  },
  workflowSection: {
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTop: '1px solid rgba(26, 26, 26, 0.06)',
  },
  workflowRow: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  workflowName: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.textMuted,
    width: 90,
    flexShrink: 0,
  },
  workflowBar: {
    flex: 1,
    height: 6,
    backgroundColor: 'rgba(26, 26, 26, 0.04)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  workflowFill: {
    height: '100%',
    backgroundColor: 'rgba(26, 26, 26, 0.5)',
    borderRadius: 3,
    transition: 'width 0.3s ease',
  },
  workflowCount: {
    fontFamily: fonts.sans,
    fontSize: 11,
    color: colors.textMuted,
    width: 24,
    textAlign: 'right' as const,
    flexShrink: 0,
  },
};
