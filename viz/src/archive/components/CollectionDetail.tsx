/**
 * CollectionDetail — Expanded collection view with document list + upload.
 */

import { useState, useRef, useCallback } from 'react';
import { colors, fonts, radii, spacing } from '../../staffing/styles/tokens.js';
import type { KbCollection } from '../hooks/useCollections.js';

interface Props {
  collection: KbCollection;
  onUpload: (collectionId: string, file: File) => Promise<{ wordCount: number; sectionsDetected: number }>;
  onDeleteCollection: (id: string) => Promise<void>;
  onClose: () => void;
}

export function CollectionDetail({ collection, onUpload, onDeleteCollection, onClose }: Props) {
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    setUploading(true);
    setUploadError(null);
    setUploadResult(null);
    try {
      const result = await onUpload(collection.id, file);
      setUploadResult(`${file.name} indexed \u2014 ${result.wordCount.toLocaleString()} words, ${result.sectionsDetected} sections`);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, [collection.id, onUpload]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <div style={styles.name}>{collection.name}</div>
          <div style={styles.stats}>
            {collection.documentCount} document{collection.documentCount !== 1 ? 's' : ''}
            {' \u00B7 '}
            {collection.totalWords.toLocaleString()} words
            {' \u00B7 '}
            {collection.chunkCount} chunks indexed
          </div>
        </div>
        <div style={styles.actions}>
          {!confirmDelete ? (
            <button onClick={() => setConfirmDelete(true)} style={styles.deleteBtn}>Delete</button>
          ) : (
            <>
              <span style={styles.confirmText}>Delete this collection?</span>
              <button onClick={() => onDeleteCollection(collection.id)} style={styles.confirmYes}>Yes</button>
              <button onClick={() => setConfirmDelete(false)} style={styles.deleteBtn}>No</button>
            </>
          )}
          <button onClick={onClose} style={styles.closeBtn}>{'\u2715'}</button>
        </div>
      </div>

      {collection.description && (
        <div style={styles.description}>{collection.description}</div>
      )}

      {/* Upload zone */}
      <div
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
        onClick={() => inputRef.current?.click()}
        style={styles.dropZone}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,.doc,.txt,.md,.rtf,.html,.htm"
          onChange={handleFileInput}
          style={{ display: 'none' }}
        />
        {uploading ? (
          <span style={styles.dropText}>Indexing...</span>
        ) : (
          <span style={styles.dropText}>Drop files here or click to upload</span>
        )}
      </div>

      {uploadResult && <div style={styles.success}>{uploadResult}</div>}
      {uploadError && <div style={styles.error}>{uploadError}</div>}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    backgroundColor: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: radii.md,
    padding: spacing.xl,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  name: {
    fontSize: 18,
    fontFamily: fonts.serif,
    fontWeight: 400,
    color: colors.text,
    marginBottom: 4,
  },
  stats: {
    fontSize: 11,
    fontFamily: fonts.sans,
    color: colors.textDim,
  },
  description: {
    fontSize: 13,
    fontFamily: fonts.sans,
    color: colors.textMuted,
    lineHeight: 1.5,
    marginBottom: spacing.md,
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
  },
  deleteBtn: {
    fontSize: 10,
    fontFamily: fonts.sans,
    color: colors.textDim,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    textDecoration: 'underline',
    padding: 0,
  },
  confirmText: {
    fontSize: 10,
    fontFamily: fonts.sans,
    color: '#C45D3E',
  },
  confirmYes: {
    fontSize: 10,
    fontFamily: fonts.sans,
    color: '#C45D3E',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontWeight: 600,
    padding: 0,
  },
  closeBtn: {
    fontSize: 14,
    color: colors.textDim,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '0 4px',
  },
  dropZone: {
    border: `2px dashed ${colors.border}`,
    borderRadius: radii.md,
    padding: `${spacing.xl}px`,
    textAlign: 'center' as const,
    cursor: 'pointer',
    transition: 'border-color 0.2s ease',
  },
  dropText: {
    fontSize: 12,
    fontFamily: fonts.sans,
    color: colors.textDim,
  },
  success: {
    fontSize: 11,
    fontFamily: fonts.sans,
    color: '#4A7C50',
    marginTop: spacing.sm,
  },
  error: {
    fontSize: 11,
    fontFamily: fonts.sans,
    color: '#C45D3E',
    marginTop: spacing.sm,
  },
};
