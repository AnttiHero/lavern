/**
 * CollectionCard — Single KB collection display card.
 */

import { colors, fonts, radii, spacing } from '../../staffing/styles/tokens.js';
import type { KbCollection } from '../hooks/useCollections.js';

interface Props {
  collection: KbCollection;
  onClick: () => void;
}

const TYPE_LABELS: Record<string, string> = {
  precedent: 'Precedent',
  playbook: 'Playbook',
  regulation: 'Regulation',
  prior_analysis: 'Analysis',
  template: 'Template',
  other: 'Other',
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days < 1) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export function CollectionCard({ collection, onClick }: Props) {
  const typeLabel = TYPE_LABELS[collection.docType] ?? collection.docType;

  return (
    <button onClick={onClick} style={styles.card}>
      <div style={styles.top}>
        <span style={styles.name}>{collection.name}</span>
        {collection.docType && (
          <span style={styles.typeBadge}>{typeLabel}</span>
        )}
      </div>
      <div style={styles.stats}>
        {collection.documentCount} document{collection.documentCount !== 1 ? 's' : ''}
        {' \u00B7 '}
        {collection.totalWords.toLocaleString()} words
        {' \u00B7 '}
        {timeAgo(collection.createdAt)}
      </div>
    </button>
  );
}

export function NewCollectionCard({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} style={styles.newCard}>
      <span style={styles.plus}>+</span>
      <span style={styles.newLabel}>New Collection</span>
    </button>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radii.md,
    border: `1px solid ${colors.border}`,
    backgroundColor: colors.bgCard,
    cursor: 'pointer',
    transition: 'border-color 0.2s ease',
    textAlign: 'left' as const,
    fontFamily: fonts.sans,
    width: '100%',
  },
  top: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    width: '100%',
  },
  name: {
    fontSize: 16,
    fontFamily: fonts.serif,
    fontWeight: 400,
    color: colors.text,
    flex: 1,
  },
  typeBadge: {
    fontSize: 9,
    fontWeight: 600,
    fontFamily: fonts.sans,
    letterSpacing: 0.8,
    textTransform: 'uppercase' as const,
    color: colors.textDim,
    backgroundColor: colors.bgPanel,
    padding: '2px 8px',
    borderRadius: radii.pill,
    border: `1px solid ${colors.border}`,
    flexShrink: 0,
  },
  stats: {
    fontSize: 11,
    color: colors.textDim,
    fontFamily: fonts.sans,
  },
  newCard: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.xl,
    borderRadius: radii.md,
    border: `2px dashed ${colors.border}`,
    backgroundColor: 'transparent',
    cursor: 'pointer',
    transition: 'border-color 0.2s ease, background-color 0.2s ease',
    width: '100%',
    minHeight: 90,
    fontFamily: fonts.sans,
  },
  plus: {
    fontSize: 24,
    color: colors.textDim,
    fontWeight: 300,
    lineHeight: 1,
  },
  newLabel: {
    fontSize: 11,
    color: colors.textDim,
    fontWeight: 500,
  },
};
