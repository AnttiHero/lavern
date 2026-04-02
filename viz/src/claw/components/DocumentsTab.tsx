/**
 * DocumentsTab — Filterable document table with inline error recovery.
 * "What has the night shift looked at?"
 */

import { useState } from 'react';
import { fonts, radii, spacing } from '../../staffing/styles/tokens.js';
import { CLAW } from '../theme.js';
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

async function retryDocuments(body: { hash?: string; stale?: boolean } = {}): Promise<number> {
  try {
    const res = await fetch('/api/claw/retry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    });
    if (!res.ok) return 0;
    const data = await res.json();
    return data.retriedCount ?? 0;
  } catch {
    return 0;
  }
}

interface Props {
  documents: ClawDocument[];
  demoMode: boolean;
}

export function DocumentsTab({ documents, demoMode }: Props) {
  const [filter, setFilter] = useState<FilterKey>('all');
  const [retryMsg, setRetryMsg] = useState<string | null>(null);
  const [expandedErrors, setExpandedErrors] = useState<Set<string>>(new Set());
  const [retryingHash, setRetryingHash] = useState<string | null>(null);

  const filtered = documents.filter(d => matchesFilter(d, filter));
  const errorCount = documents.filter(d => d.status === 'error').length;
  const staleCount = documents.filter(d => d.status === 'stale').length;

  const toggleErrorExpand = (hash: string) => {
    setExpandedErrors(prev => {
      const next = new Set(prev);
      if (next.has(hash)) next.delete(hash);
      else next.add(hash);
      return next;
    });
  };

  const retryOne = async (hash: string) => {
    setRetryingHash(hash);
    const count = await retryDocuments({ hash });
    setRetryMsg(count > 0 ? `Queued for retry` : 'Retry failed');
    setTimeout(() => setRetryMsg(null), 3000);
    setRetryingHash(null);
  };

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
              backgroundColor: filter === f.key ? CLAW.accent : 'transparent',
              color: filter === f.key ? '#080808' : CLAW.textMuted,
              borderColor: filter === f.key ? CLAW.accent : CLAW.border,
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Bulk retry actions */}
      {!demoMode && (errorCount > 0 || staleCount > 0) && (
        <div style={styles.retryRow}>
          {errorCount > 0 && (
            <button
              style={styles.retryBtn}
              onClick={async () => {
                const count = await retryDocuments();
                setRetryMsg(count > 0 ? `Queued ${count} failed doc${count === 1 ? '' : 's'} for retry` : 'No failed documents');
                setTimeout(() => setRetryMsg(null), 4000);
              }}
            >
              Retry {errorCount} Failed
            </button>
          )}
          {staleCount > 0 && (
            <button
              style={styles.retryBtn}
              onClick={async () => {
                const count = await retryDocuments({ stale: true });
                setRetryMsg(count > 0 ? `Queued ${count} stale doc${count === 1 ? '' : 's'} for reprocessing` : 'No stale documents');
                setTimeout(() => setRetryMsg(null), 4000);
              }}
            >
              Reprocess {staleCount} Stale
            </button>
          )}
          {retryMsg && <span style={styles.retryMsg}>{retryMsg}</span>}
        </div>
      )}

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
              {filtered.map((doc) => {
                const isError = doc.status === 'error' && doc.error;
                const isExpanded = expandedErrors.has(doc.hash);
                const errorTruncated = doc.error && doc.error.length > 120;

                return (
                  <tr key={doc.hash} style={doc.status === 'flagged' ? styles.flaggedRow : doc.status === 'error' ? styles.errorRow : undefined}>
                    <td style={styles.td}>
                      {doc.confidential && <span style={styles.lockIcon} title="Processed locally — privilege preserved">{'🔒'} </span>}
                      <span style={styles.docName}>{doc.name}</span>
                      {isError && (
                        <div style={styles.inlineError}>
                          <span style={styles.inlineErrorText}>
                            {isExpanded || !errorTruncated
                              ? doc.error
                              : doc.error!.slice(0, 120) + '...'}
                          </span>
                          {errorTruncated && (
                            <button
                              style={styles.expandBtn}
                              onClick={() => toggleErrorExpand(doc.hash)}
                            >
                              {isExpanded ? 'Less' : 'More'}
                            </button>
                          )}
                          {!demoMode && (
                            <button
                              style={styles.retryOneBtn}
                              onClick={() => retryOne(doc.hash)}
                              disabled={retryingHash === doc.hash}
                              aria-label={`Retry ${doc.name}`}
                            >
                              {retryingHash === doc.hash ? 'Retrying...' : 'Retry'}
                            </button>
                          )}
                        </div>
                      )}
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
                );
              })}
            </tbody>
          </table>
        </div>
      )}
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
    backgroundColor: CLAW.surface,
    border: `1px solid ${CLAW.border}`,
    borderRadius: radii.md,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: 13,
    fontFamily: fonts.sans,
    color: CLAW.textSecondary,
  },
  th: {
    textAlign: 'left' as const,
    padding: '10px 12px',
    borderBottom: `2px solid ${CLAW.border}`,
    fontSize: 10,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    color: CLAW.textMuted,
    fontWeight: 600,
    fontFamily: fonts.sans,
  },
  td: {
    padding: '10px 12px',
    borderBottom: `1px solid ${CLAW.border}`,
    verticalAlign: 'top' as const,
    color: CLAW.textSecondary,
  },
  flaggedRow: {
    backgroundColor: CLAW.dangerBg,
  },
  errorRow: {
    backgroundColor: 'rgba(196, 93, 62, 0.04)',
  },
  docName: {
    fontWeight: 500,
    fontFamily: fonts.mono,
    fontSize: 12,
    color: CLAW.text,
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
    backgroundColor: 'rgba(46, 125, 156, 0.12)',
    color: '#5BA3C9',
  },
  inlineError: {
    marginTop: 6,
    padding: '6px 8px',
    backgroundColor: CLAW.dangerBg,
    borderLeft: `2px solid ${CLAW.dangerBorder}`,
    borderRadius: '0 4px 4px 0',
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    flexWrap: 'wrap' as const,
  },
  inlineErrorText: {
    fontSize: 11,
    fontFamily: fonts.mono,
    color: CLAW.danger,
    lineHeight: 1.4,
    flex: 1,
    minWidth: 0,
    wordBreak: 'break-word' as const,
  },
  expandBtn: {
    padding: '1px 6px',
    border: 'none',
    backgroundColor: 'transparent',
    color: CLAW.textMuted,
    fontSize: 10,
    fontFamily: fonts.sans,
    cursor: 'pointer',
    textDecoration: 'underline',
    flexShrink: 0,
  },
  retryOneBtn: {
    padding: '2px 10px',
    borderRadius: radii.sm,
    border: `1px solid ${CLAW.dangerBorder}`,
    backgroundColor: 'transparent',
    color: CLAW.danger,
    fontSize: 10,
    fontWeight: 600,
    fontFamily: fonts.sans,
    cursor: 'pointer',
    flexShrink: 0,
    transition: 'all 0.2s ease',
  },
  empty: {
    fontSize: 14,
    fontFamily: fonts.serif,
    fontStyle: 'italic' as const,
    color: CLAW.textMuted,
    padding: `${spacing.xl}px`,
    textAlign: 'center' as const,
  },
  retryRow: {
    display: 'flex',
    gap: spacing.sm,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  retryBtn: {
    padding: '5px 14px',
    borderRadius: radii.sm,
    border: `1px solid ${CLAW.border}`,
    backgroundColor: 'transparent',
    color: CLAW.text,
    fontSize: 11,
    fontWeight: 600,
    fontFamily: fonts.sans,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  retryMsg: {
    fontSize: 12,
    fontFamily: fonts.sans,
    color: CLAW.textMuted,
    fontStyle: 'italic' as const,
  },
};
