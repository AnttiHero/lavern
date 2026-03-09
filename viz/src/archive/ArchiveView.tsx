/**
 * ArchiveView — "The Archive"
 * Three-layer knowledge page: Foundations, Firm Knowledge, Session Memory.
 */

import { colors, fonts, spacing } from '../staffing/styles/tokens.js';
import { ArchiveHeader } from './components/ArchiveHeader.js';
import { FoundationsSection } from './components/FoundationsSection.js';
import { FirmKnowledgeSection } from './components/FirmKnowledgeSection.js';
import { SessionMemorySection } from './components/SessionMemorySection.js';
import { SearchResults } from './components/SearchResults.js';
import { useCollections } from './hooks/useCollections.js';
import { useKbSearch } from './hooks/useKbSearch.js';
import { useSessionMemory } from './hooks/useSessionMemory.js';

interface Props {
  onBack: () => void;
}

export default function ArchiveView({ onBack }: Props) {
  const {
    collections, loading: collectionsLoading, demoMode: collectionsDemoMode,
    createCollection, uploadDocument, deleteCollection,
  } = useCollections();

  const { results, searching, searchError, query, search, clearSearch } = useKbSearch();
  const { memories, loading: memoriesLoading, demoMode: memoryDemoMode } = useSessionMemory();

  const demoMode = collectionsDemoMode || memoryDemoMode;

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <ArchiveHeader
          onBack={onBack}
          searchQuery={query}
          onSearchChange={search}
          demoMode={demoMode}
        />

        {/* Search error */}
        {searchError && (
          <div style={styles.searchError}>
            {searchError}
          </div>
        )}

        {/* Search results overlay */}
        {query.trim() && !searchError && (
          <SearchResults
            results={results}
            searching={searching}
            query={query}
            onClear={clearSearch}
          />
        )}

        {/* Layer 1: Foundations */}
        <FoundationsSection />

        {/* Layer 2: Firm Knowledge */}
        <FirmKnowledgeSection
          collections={collections}
          loading={collectionsLoading}
          demoMode={collectionsDemoMode}
          onCreateCollection={createCollection}
          onUpload={uploadDocument}
          onDeleteCollection={deleteCollection}
        />

        {/* Layer 3: Session Memory */}
        <SessionMemorySection
          memories={memories}
          loading={memoriesLoading}
          demoMode={memoryDemoMode}
        />

        {/* Footer */}
        <div style={styles.footer}>
          Teaching agents is a strange thing.
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    backgroundColor: colors.bg,
    paddingTop: spacing.xxl,
    paddingBottom: 80,
  },
  container: {
    maxWidth: 900,
    margin: '0 auto',
    padding: `0 ${spacing.xl}px`,
  },
  searchError: {
    fontSize: 12,
    fontFamily: fonts.sans,
    color: colors.danger,
    padding: `${spacing.sm}px ${spacing.md}px`,
    backgroundColor: 'rgba(196, 93, 62, 0.06)',
    borderRadius: 4,
    borderLeft: `3px solid ${colors.danger}`,
    marginBottom: spacing.md,
  },
  footer: {
    textAlign: 'center' as const,
    fontSize: 12,
    fontFamily: fonts.serif,
    fontStyle: 'italic' as const,
    color: colors.textDim,
    marginTop: spacing.xxl,
    paddingTop: spacing.xl,
    opacity: 0.5,
  },
};
