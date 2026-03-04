/**
 * FirmKnowledgeSection — Layer 2: warm card-on-paper aesthetic.
 * Grid of collection cards + create modal + inline expansion.
 */

import { useState } from 'react';
import { colors, fonts, spacing } from '../../staffing/styles/tokens.js';
import type { KbCollection } from '../hooks/useCollections.js';
import { CollectionCard, NewCollectionCard } from './CollectionCard.js';
import { CreateCollectionModal } from './CreateCollectionModal.js';
import { CollectionDetail } from './CollectionDetail.js';

interface Props {
  collections: KbCollection[];
  loading: boolean;
  demoMode: boolean;
  onCreateCollection: (opts: { name: string; description?: string; docType?: string; jurisdiction?: string }) => Promise<void>;
  onUpload: (collectionId: string, file: File) => Promise<{ wordCount: number; sectionsDetected: number }>;
  onDeleteCollection: (id: string) => Promise<void>;
}

export function FirmKnowledgeSection({
  collections, loading, demoMode,
  onCreateCollection, onUpload, onDeleteCollection,
}: Props) {
  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const expanded = expandedId ? collections.find(c => c.id === expandedId) : null;

  return (
    <div style={styles.container}>
      {/* Section divider */}
      <div style={styles.divider}>
        <div style={styles.line} />
        <span style={styles.label}>Firm Knowledge</span>
        <div style={styles.line} />
      </div>

      <p style={styles.subtitle}>Your playbooks, precedents, and reference materials.</p>

      {loading ? (
        <div style={styles.loadingText}>Loading collections...</div>
      ) : expanded ? (
        <CollectionDetail
          collection={expanded}
          onUpload={onUpload}
          onDeleteCollection={onDeleteCollection}
          onClose={() => setExpandedId(null)}
        />
      ) : showCreate ? (
        <CreateCollectionModal
          onCreate={async (opts) => {
            await onCreateCollection(opts);
            setShowCreate(false);
          }}
          onCancel={() => setShowCreate(false)}
        />
      ) : (
        <>
          {collections.length === 0 && !demoMode && (
            <div style={styles.emptyText}>
              Your firm's institutional knowledge lives here.
            </div>
          )}

          <div style={styles.grid}>
            {collections.map(c => (
              <CollectionCard
                key={c.id}
                collection={c}
                onClick={() => setExpandedId(c.id)}
              />
            ))}
            {!demoMode && (
              <NewCollectionCard onClick={() => setShowCreate(true)} />
            )}
          </div>

          {demoMode && collections.length === 0 && (
            <div style={styles.demoNote}>
              Collections require a backend connection.
            </div>
          )}
        </>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    marginBottom: spacing.xxl,
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  label: {
    fontSize: 10,
    fontWeight: 600,
    fontFamily: fonts.sans,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
    color: colors.textDim,
    flexShrink: 0,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: fonts.sans,
    color: colors.textMuted,
    margin: `0 0 ${spacing.xl}px`,
    lineHeight: 1.5,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
    gap: spacing.md,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: fonts.serif,
    fontStyle: 'italic' as const,
    color: colors.textDim,
    padding: `${spacing.xl}px 0`,
    textAlign: 'center' as const,
  },
  loadingText: {
    fontSize: 12,
    fontFamily: fonts.sans,
    color: colors.textDim,
    padding: `${spacing.lg}px 0`,
  },
  demoNote: {
    fontSize: 11,
    fontFamily: fonts.sans,
    color: colors.textDim,
    fontStyle: 'italic' as const,
    marginTop: spacing.md,
    textAlign: 'center' as const,
  },
};
