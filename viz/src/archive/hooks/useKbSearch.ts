/**
 * useKbSearch — Debounced FTS search across KB.
 */

import { useState, useCallback, useRef } from 'react';

export interface KbSearchResult {
  chunkId: string;
  documentId: string;
  collectionId: string;
  collectionName: string;
  documentFilename: string;
  heading: string;
  content: string;
  wordCount: number;
  docType: string;
}

export function useKbSearch() {
  const [results, setResults] = useState<KbSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const search = useCallback((q: string) => {
    setQuery(q);
    if (timerRef.current) clearTimeout(timerRef.current);

    if (!q.trim()) {
      setResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    timerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/knowledge-base/search?q=${encodeURIComponent(q.trim())}&limit=10`, {
          credentials: 'include',
        });
        if (!res.ok) throw new Error('Search failed');
        const data = await res.json();
        setResults(data.results ?? []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  }, []);

  const clearSearch = useCallback(() => {
    setQuery('');
    setResults([]);
    setSearching(false);
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return { results, searching, query, search, clearSearch };
}
