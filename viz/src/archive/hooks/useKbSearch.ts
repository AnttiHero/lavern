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
  const abortRef = useRef<AbortController>();

  const search = useCallback((q: string) => {
    setQuery(q);
    if (timerRef.current) clearTimeout(timerRef.current);
    // Abort any in-flight fetch so stale results don't overwrite fresh ones
    if (abortRef.current) abortRef.current.abort();

    if (!q.trim()) {
      setResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    timerRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch(`/api/knowledge-base/search?q=${encodeURIComponent(q.trim())}&limit=10`, {
          credentials: 'include',
          signal: controller.signal,
        });
        if (!res.ok) throw new Error('Search failed');
        const data = await res.json();
        if (!controller.signal.aborted) setResults(data.results ?? []);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setResults([]);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 300);
  }, []);

  const clearSearch = useCallback(() => {
    setQuery('');
    setResults([]);
    setSearching(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (abortRef.current) abortRef.current.abort();
  }, []);

  return { results, searching, query, search, clearSearch };
}
