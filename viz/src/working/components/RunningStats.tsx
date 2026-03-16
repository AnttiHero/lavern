/**
 * RunningStats — Compact horizontal stats strip for the HeartbeatBand.
 *
 * Shows: elapsed time (live ticker) | insights found | cost / budget | certainty %
 * Replaces scattered stats from TeamPanel footer and WorkingHeader.
 */

import { useState, useEffect } from 'react';
import { colors, fonts } from '../../staffing/styles/tokens.js';

interface RunningStatsProps {
  /** ISO timestamp of when the session started (first event). */
  sessionStartTime: string | null;
  /** Number of insight cards (findings + debates + checks). */
  insightCount: number;
  /** Cost info from useWorkingState. */
  cost: { accumulated: number; budget: number } | undefined;
  /** Certainty percentage (0-100) from verification avg. */
  certaintyPct: number | undefined;
  /** Remaining billable hours (optional). */
  billableHours?: number;
}

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

export function RunningStats({
  sessionStartTime,
  insightCount,
  cost,
  certaintyPct,
  billableHours,
}: RunningStatsProps) {
  const [elapsed, setElapsed] = useState('0:00');

  // Live ticker — updates every second
  useEffect(() => {
    if (!sessionStartTime) return;
    const start = new Date(sessionStartTime).getTime();
    const update = () => setElapsed(formatElapsed(Date.now() - start));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [sessionStartTime]);

  return (
    <div style={styles.container}>
      <StatItem label="Elapsed" value={elapsed} />
      <Divider />
      <StatItem
        label="Insights"
        value={String(insightCount)}
        highlight={insightCount > 0}
      />
      <Divider />
      <StatItem
        label="Cost"
        value={cost ? `$${cost.accumulated.toFixed(2)} / $${cost.budget}` : '—'}
      />
      {certaintyPct !== undefined && (
        <>
          <Divider />
          <StatItem label="Certainty" value={`${certaintyPct}%`} />
        </>
      )}
      {billableHours !== undefined && (
        <>
          <Divider />
          <StatItem label="Balance" value={`${billableHours.toFixed(0)}h`} />
        </>
      )}
    </div>
  );
}

function StatItem({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div style={styles.item}>
      <span style={styles.label}>{label}</span>
      <span
        style={{
          ...styles.value,
          color: highlight ? colors.warning : colors.text,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function Divider() {
  return <span style={styles.divider}>·</span>;
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap' as const,
  },
  item: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 4,
  },
  label: {
    fontSize: 10,
    fontFamily: fonts.sans,
    color: colors.textDim,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  value: {
    fontSize: 12,
    fontFamily: fonts.mono,
    color: colors.text,
    fontWeight: 500,
  },
  divider: {
    fontSize: 10,
    color: colors.textDim,
  },
};
