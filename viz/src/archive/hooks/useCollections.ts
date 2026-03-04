/**
 * useCollections — CRUD hook for KB collections + document upload.
 */

import { useState, useEffect, useCallback, useRef } from 'react';

export interface KbCollection {
  id: string;
  name: string;
  description: string;
  docType: string;
  documentCount: number;
  chunkCount: number;
  totalWords: number;
  createdAt: string;
}

export interface KbDocument {
  id: string;
  filename: string;
  wordCount: number;
  pageCount: number;
  createdAt: string;
}

interface UploadResult {
  documentId: string;
  filename: string;
  chunkCount: number;
  wordCount: number;
  pageCount: number;
  sectionsDetected: number;
}

export function useCollections() {
  const [collections, setCollections] = useState<KbCollection[]>([]);
  const [loading, setLoading] = useState(true);
  const [demoMode, setDemoMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const fetchCollections = useCallback(async () => {
    try {
      const res = await fetch('/api/knowledge-base/collections', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      if (mounted.current) {
        setCollections(data.collections ?? []);
        setDemoMode(false);
      }
    } catch {
      if (mounted.current) {
        setCollections([]);
        setDemoMode(true);
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    fetchCollections();
    return () => { mounted.current = false; };
  }, [fetchCollections]);

  const createCollection = useCallback(async (opts: {
    name: string;
    description?: string;
    docType?: string;
    jurisdiction?: string;
  }) => {
    const res = await fetch('/api/knowledge-base/collections', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(opts),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed' }));
      throw new Error(err.error ?? 'Failed to create collection');
    }
    await fetchCollections();
    return res.json();
  }, [fetchCollections]);

  const uploadDocument = useCallback(async (collectionId: string, file: File): Promise<UploadResult> => {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`/api/knowledge-base/collections/${collectionId}/upload`, {
      method: 'POST',
      credentials: 'include',
      body: form,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error(err.error ?? 'Upload failed');
    }
    const result = await res.json();
    await fetchCollections();
    return result;
  }, [fetchCollections]);

  const deleteCollection = useCallback(async (id: string) => {
    const res = await fetch(`/api/knowledge-base/collections/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (!res.ok) throw new Error('Failed to delete');
    await fetchCollections();
  }, [fetchCollections]);

  const deleteDocument = useCallback(async (id: string) => {
    const res = await fetch(`/api/knowledge-base/documents/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (!res.ok) throw new Error('Failed to delete');
    await fetchCollections();
  }, [fetchCollections]);

  return {
    collections, loading, demoMode, error,
    createCollection, uploadDocument, deleteCollection, deleteDocument,
    refresh: fetchCollections,
  };
}
