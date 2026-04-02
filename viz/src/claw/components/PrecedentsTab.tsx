/**
 * PrecedentsTab — Institutional memory cards.
 * "What has the firm learned?"
 */

import { useState } from 'react';
import { fonts, spacing } from '../../staffing/styles/tokens.js';
import { CLAW } from '../theme.js';
import type { ClawPrecedent, ClawPrecedentSummary } from '../hooks/useClawData.js';

interface Props {
  precedents: ClawPrecedent[];
  summary: ClawPrecedentSummary | null;
  demoMode: boolean;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const hours = ms / 3_600_000;
  if (hours < 1) return 'just now';
  if (hours < 24) return `${Math.floor(hours)}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

function effectivenessColor(score: number): string {
  if (score >= 0.6) return CLAW.success;
  if (score >= 0.3) return CLAW.amber;
  return CLAW.textDim;
}

export function PrecedentsTab({ precedents, summary, demoMode }: Props) {
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = searchQuery
    ? precedents.filter(p =>
        p.patternName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.documentType.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : precedents;

  if (precedents.length === 0) {
    return (
      <div style={styles.empty}>
        No precedents yet. Process documents to build institutional memory.
      </div>
    );
  }

  return (
    <div>
      {/* Summary bar */}
      {summary && (
        <div style={styles.summaryBar}>
          <div style={styles.summaryStats}>
            <span style={styles.statValue}>{summary.active}</span>
            <span style={styles.statLabel}>active</span>
          </div>
          {summary.deprecated > 0 && (
            <div style={styles.summaryStats}>
              <span style={{ ...styles.statValue, color: CLAW.textDim }}>{summary.deprecated}</span>
              <span style={styles.statLabel}>deprecated</span>
            </div>
          )}
          {summary.topPatterns.length > 0 && (
            <div style={styles.topPatterns}>
              {summary.topPatterns.map(p => (
                <span key={p} style={styles.patternTag}>{p}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Search */}
      <div style={styles.searchRow}>
        <input
          type="text"
          placeholder="Search precedents..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          style={styles.searchInput}
          aria-label="Search precedents"
        />
      </div>

      {/* Cards */}
      <div style={styles.list} role="list" aria-label="Precedent patterns">
        {filtered.map(p => (
          <div key={p.id} style={styles.card} role="listitem">
            <div style={styles.cardHeader}>
              <span style={styles.patternName}>{p.patternName}</span>
              <span style={styles.timesUsed} aria-label={`Seen ${p.timesUsed} times`}>{p.timesUsed}x seen</span>
            </div>

            <p style={styles.description}>{p.description}</p>

            {p.evidence && (
              <div style={styles.evidenceBox}>
                <span style={styles.evidenceLabel}>Evidence</span>
                <span style={styles.evidenceText}>
                  {p.evidence.length > 200 ? p.evidence.slice(0, 200) + '...' : p.evidence}
                </span>
              </div>
            )}

            <div style={styles.metaRow}>
              <span style={styles.metaItem}>{p.documentType}</span>
              <span style={styles.metaDot}>&middot;</span>
              <span style={styles.metaItem}>{p.jurisdiction}</span>
              <span style={styles.metaDot}>&middot;</span>
              <span style={{ ...styles.metaItem, color: effectivenessColor(p.effectivenessScore) }}>
                {(p.effectivenessScore * 100).toFixed(0)}% effective
              </span>
              <span style={styles.metaDot}>&middot;</span>
              <span style={styles.metaItem}>{timeAgo(p.addedAt)}</span>
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && searchQuery && (
        <div style={styles.empty}>
          No precedents match "{searchQuery}".
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  summaryBar: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.lg,
    padding: `${spacing.md}px ${spacing.lg}px`,
    backgroundColor: CLAW.surface,
    border: `1px solid ${CLAW.border}`,
    borderRadius: 8,
    marginBottom: spacing.md,
    flexWrap: 'wrap' as const,
  },
  summaryStats: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 4,
  },
  statValue: {
    fontSize: 20,
    fontWeight: 300,
    fontFamily: fonts.serif,
    color: CLAW.text,
  },
  statLabel: {
    fontSize: 12,
    fontFamily: fonts.sans,
    color: CLAW.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  topPatterns: {
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap' as const,
    marginLeft: 'auto',
  },
  patternTag: {
    fontSize: 11,
    fontFamily: fonts.sans,
    color: CLAW.amber,
    backgroundColor: CLAW.amberBg,
    padding: '2px 8px',
    borderRadius: 999,
  },
  searchRow: {
    marginBottom: spacing.md,
  },
  searchInput: {
    width: '100%',
    padding: '8px 14px',
    fontSize: 13,
    fontFamily: fonts.sans,
    backgroundColor: CLAW.input,
    color: CLAW.text,
    border: `1px solid ${CLAW.border}`,
    borderRadius: 6,
    outline: 'none',
    boxSizing: 'border-box' as const,
  },
  list: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: spacing.sm,
  },
  card: {
    padding: spacing.lg,
    backgroundColor: CLAW.surface,
    borderRadius: 8,
    border: `1px solid ${CLAW.border}`,
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 6,
  },
  patternName: {
    fontSize: 15,
    fontWeight: 400,
    fontFamily: fonts.serif,
    color: CLAW.text,
  },
  timesUsed: {
    fontSize: 11,
    fontFamily: fonts.sans,
    color: CLAW.amber,
    fontWeight: 600,
  },
  description: {
    fontSize: 13,
    fontFamily: fonts.sans,
    color: CLAW.textSecondary,
    lineHeight: 1.5,
    margin: '0 0 8px 0',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical' as const,
    overflow: 'hidden',
  },
  evidenceBox: {
    padding: '6px 10px',
    backgroundColor: CLAW.amberBg,
    borderLeft: `2px solid ${CLAW.amberBorder}`,
    borderRadius: '0 4px 4px 0',
    marginBottom: 8,
  },
  evidenceLabel: {
    display: 'block',
    fontSize: 10,
    fontFamily: fonts.sans,
    color: CLAW.textDim,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    marginBottom: 2,
  },
  evidenceText: {
    fontSize: 12,
    fontFamily: fonts.sans,
    fontStyle: 'italic' as const,
    color: CLAW.textMuted,
    lineHeight: 1.4,
  },
  metaRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap' as const,
  },
  metaItem: {
    fontSize: 11,
    fontFamily: fonts.sans,
    color: CLAW.textDim,
  },
  metaDot: {
    fontSize: 11,
    color: CLAW.border,
  },
  empty: {
    fontSize: 14,
    fontFamily: fonts.serif,
    fontStyle: 'italic' as const,
    color: CLAW.textMuted,
    padding: `${spacing.xxl}px`,
    textAlign: 'center' as const,
  },
};
