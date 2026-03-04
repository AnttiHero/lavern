/**
 * SearchResults — FTS search results panel.
 */

import { colors, fonts, radii, spacing } from '../../staffing/styles/tokens.js';
import type { KbSearchResult } from '../hooks/useKbSearch.js';

interface Props {
  results: KbSearchResult[];
  searching: boolean;
  query: string;
  onClear: () => void;
}

export function SearchResults({ results, searching, query, onClear }: Props) {
  if (!query.trim()) return null;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.label}>
          {searching ? 'Searching...' : `${results.length} result${results.length !== 1 ? 's' : ''} for "${query}"`}
        </span>
        <button onClick={onClear} style={styles.clearBtn}>Clear</button>
      </div>

      {!searching && results.length === 0 && (
        <div style={styles.empty}>No results found.</div>
      )}

      {results.map(r => (
        <div key={r.chunkId} style={styles.result}>
          <div style={styles.heading}>{r.heading || r.documentFilename}</div>
          <div style={styles.preview}>
            {r.content.length > 200 ? r.content.slice(0, 200) + '...' : r.content}
          </div>
          <div style={styles.meta}>
            <span style={styles.collectionPill}>{r.collectionName}</span>
            {r.docType && <span style={styles.typePill}>{r.docType}</span>}
            <span style={styles.wordCount}>{r.wordCount} words</span>
          </div>
        </div>
      ))}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    backgroundColor: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.md,
    padding: spacing.lg,
    marginBottom: spacing.xxl,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  label: {
    fontSize: 12,
    fontFamily: fonts.sans,
    fontWeight: 500,
    color: colors.textMuted,
  },
  clearBtn: {
    fontSize: 11,
    fontFamily: fonts.sans,
    color: colors.textDim,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    textDecoration: 'underline',
    padding: 0,
  },
  empty: {
    fontSize: 13,
    color: colors.textDim,
    fontStyle: 'italic' as const,
    padding: `${spacing.md}px 0`,
  },
  result: {
    padding: `${spacing.md}px 0`,
    borderTop: `1px solid ${colors.border}`,
  },
  heading: {
    fontSize: 13,
    fontWeight: 600,
    fontFamily: fonts.sans,
    color: colors.text,
    marginBottom: 4,
  },
  preview: {
    fontSize: 13,
    fontFamily: fonts.sans,
    color: colors.textSecondary,
    lineHeight: 1.6,
    marginBottom: spacing.sm,
  },
  meta: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
  },
  collectionPill: {
    fontSize: 9,
    fontWeight: 600,
    fontFamily: fonts.sans,
    letterSpacing: 0.5,
    color: colors.textDim,
    backgroundColor: colors.bgPanel,
    padding: '2px 8px',
    borderRadius: radii.pill,
    border: `1px solid ${colors.border}`,
  },
  typePill: {
    fontSize: 9,
    fontWeight: 500,
    fontFamily: fonts.sans,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
    color: colors.textDim,
  },
  wordCount: {
    fontSize: 10,
    fontFamily: fonts.sans,
    color: colors.textDim,
  },
};
