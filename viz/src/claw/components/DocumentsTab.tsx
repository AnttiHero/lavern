/**
 * DocumentsTab — Filterable document table.
 * "What has the night shift looked at?"
 */

import { useState } from 'react';
import { colors, fonts, radii, spacing } from '../../staffing/styles/tokens.js';
import type { ClawDocument } from '../hooks/useClawData.js';
import { StatusBadge } from './StatusBadge.js';
import { FindingsBadges } from './FindingsBadges.js';

type FilterKey = 'all' | 'reviewed' | 'flagged' | 'pending' | 'error' | 'stale';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'reviewed', label: 'Reviewed' },
  { key: 'flagged', label: 'Flagged' },
  { key: 'pending', label: 'Pending' },
  { key: 'error', label: 'Errors' },
  { key: 'stale', label: 'Stale' },
];

function matchesFilter(doc: ClawDocument, filter: FilterKey): boolean {
  if (filter === 'all') return true;
  if (filter === 'pending') return doc.status === 'pending' || doc.status === 'new' || doc.status === 'queued' || doc.status === 'processing';
  return doc.status === filter;
}

interface Props {
  documents: ClawDocument[];
  demoMode: boolean;
}

export function DocumentsTab({ documents, demoMode }: Props) {
  const [filter, setFilter] = useState<FilterKey>('all');

  const filtered = documents.filter(d => matchesFilter(d, filter));

  return (
    <div>
      {/* Filters */}
      <div style={styles.filterRow}>
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{
              ...styles.filterPill,
              backgroundColor: filter === f.key ? colors.text : 'transparent',
              color: filter === f.key ? '#fff' : colors.textMuted,
              borderColor: filter === f.key ? colors.text : colors.border,
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div style={styles.empty}>
          {documents.length === 0
            ? 'No documents in the watch paths yet.'
            : 'No documents match this filter.'}
        </div>
      ) : (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Name</th>
                <th style={styles.th}>Type</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Findings</th>
                <th style={styles.th}>Cost</th>
                <th style={styles.th}>Last Reviewed</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((doc, i) => (
                <tr key={i} style={doc.status === 'flagged' ? styles.flaggedRow : undefined}>
                  <td style={styles.td}>
                    {doc.confidential && <span style={styles.lockIcon} title="Processed locally — privilege preserved">🔒 </span>}
                    <span style={styles.docName}>{doc.name}</span>
                  </td>
                  <td style={styles.td}>{doc.type}</td>
                  <td style={styles.td}><StatusBadge status={doc.status} /></td>
                  <td style={styles.td}><FindingsBadges findings={doc.findings} /></td>
                  <td style={styles.td}>
                    {doc.confidential
                      ? <span style={styles.localBadge}>Local</span>
                      : doc.costUsd != null ? `$${doc.costUsd.toFixed(2)}` : '\u2014'}
                  </td>
                  <td style={styles.td}>
                    {doc.lastReviewed ? new Date(doc.lastReviewed).toLocaleString() : '\u2014'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Error detail for error docs */}
      {filtered.filter(d => d.error).map((doc, i) => (
        <div key={i} style={styles.errorDetail}>
          <span style={styles.errorDocName}>{doc.name}:</span> {doc.error}
        </div>
      ))}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  filterRow: {
    display: 'flex',
    gap: spacing.xs,
    marginBottom: spacing.lg,
    flexWrap: 'wrap' as const,
  },
  filterPill: {
    padding: '4px 12px',
    borderRadius: radii.pill,
    border: '1px solid',
    fontSize: 11,
    fontWeight: 600,
    fontFamily: fonts.sans,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    letterSpacing: 0.3,
  },
  tableWrap: {
    overflowX: 'auto' as const,
    backgroundColor: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.md,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: 13,
    fontFamily: fonts.sans,
  },
  th: {
    textAlign: 'left' as const,
    padding: '10px 12px',
    borderBottom: `2px solid ${colors.border}`,
    fontSize: 10,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    color: colors.textMuted,
    fontWeight: 600,
    fontFamily: fonts.sans,
  },
  td: {
    padding: '10px 12px',
    borderBottom: `1px solid ${colors.border}`,
    verticalAlign: 'middle' as const,
  },
  flaggedRow: {
    backgroundColor: 'rgba(196, 93, 62, 0.03)',
  },
  docName: {
    fontWeight: 500,
    fontFamily: fonts.mono,
    fontSize: 12,
  },
  lockIcon: {
    fontSize: 12,
  },
  localBadge: {
    display: 'inline-block',
    padding: '1px 6px',
    borderRadius: radii.pill,
    fontSize: 10,
    fontWeight: 700,
    backgroundColor: 'rgba(46, 125, 156, 0.08)',
    color: '#2E7D9C',
  },
  empty: {
    fontSize: 14,
    fontFamily: fonts.serif,
    fontStyle: 'italic' as const,
    color: colors.textDim,
    padding: `${spacing.xl}px`,
    textAlign: 'center' as const,
  },
  errorDetail: {
    fontSize: 12,
    fontFamily: fonts.sans,
    color: colors.danger,
    backgroundColor: 'rgba(196, 93, 62, 0.04)',
    border: `1px solid rgba(196, 93, 62, 0.1)`,
    borderRadius: radii.sm,
    padding: `${spacing.sm}px ${spacing.md}px`,
    marginTop: spacing.sm,
  },
  errorDocName: {
    fontWeight: 600,
    fontFamily: fonts.mono,
    fontSize: 11,
  },
};
