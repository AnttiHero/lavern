/**
 * useCoworkFolder — React hook for folder-based Cowork mode.
 *
 * Wraps the module-level coworkStore with useSyncExternalStore
 * so React components re-render on state changes.
 *
 * Handles: opening folder, reading files, writing results back.
 */

import { useCallback, useSyncExternalStore } from 'react';
import {
  getCoworkState,
  subscribe,
  setDirectoryHandle,
  clearDirectoryHandle,
  setFileSelected,
  setCoworkStatus,
  type CoworkFile,
  type CoworkStatus,
} from './coworkStore.js';
import type { FrontendParsedDocument } from '../briefing/hooks/useDocumentUpload.js';

// ── Types ──────────────────────────────────────────────────────────────

export interface CoworkWriteItem {
  filename: string;
  content: string | Blob;
}

export interface UseCoworkFolder {
  status: CoworkStatus;
  folderName: string | null;
  files: CoworkFile[];
  isSupported: boolean;
  openFolder: () => Promise<void>;
  disconnect: () => void;
  toggleFile: (name: string, selected: boolean) => void;
  getSelectedDocuments: () => Promise<FrontendParsedDocument[]>;
  writeResults: (items: CoworkWriteItem[]) => Promise<void>;
}

// ── Feature detection ──────────────────────────────────────────────────

const isSupported = typeof window !== 'undefined' && 'showDirectoryPicker' in window;

// ── Hook ───────────────────────────────────────────────────────────────

export function useCoworkFolder(): UseCoworkFolder {
  const state = useSyncExternalStore(subscribe, getCoworkState);

  const openFolder = useCallback(async () => {
    if (!isSupported) return;
    try {
      const handle = await window.showDirectoryPicker!({ mode: 'readwrite' });
      await setDirectoryHandle(handle);
    } catch (err) {
      // User cancelled the picker — AbortError is expected
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.error('[cowork] Failed to open folder:', err);
    }
  }, []);

  const disconnect = useCallback(() => {
    clearDirectoryHandle();
    sessionStorage.removeItem('shem-cowork-active');
  }, []);

  const getSelectedDocuments = useCallback(async (): Promise<FrontendParsedDocument[]> => {
    const selected = getCoworkState().files.filter(f => f.selected);
    const docs: FrontendParsedDocument[] = [];

    for (const entry of selected) {
      try {
        const file = await entry.handle.getFile();
        const parsed = await parseFile(file);
        if (parsed) docs.push(parsed);
      } catch (err) {
        console.error(`[cowork] Failed to read ${entry.name}:`, err);
      }
    }

    return docs;
  }, []);

  const writeResults = useCallback(async (items: CoworkWriteItem[]) => {
    const handle = getCoworkState().handle;
    if (!handle) throw new Error('No folder connected');

    for (const item of items) {
      try {
        const fileHandle = await handle.getFileHandle(item.filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(
          typeof item.content === 'string'
            ? new Blob([item.content], { type: 'text/plain' })
            : item.content,
        );
        await writable.close();
      } catch (err) {
        console.error(`[cowork] Failed to write ${item.filename}:`, err);
        throw err;
      }
    }

    setCoworkStatus('delivered');
  }, []);

  return {
    status: state.status,
    folderName: state.folderName,
    files: state.files,
    isSupported,
    openFolder,
    disconnect,
    toggleFile: setFileSelected,
    getSelectedDocuments,
    writeResults,
  };
}

// ── File parsing ───────────────────────────────────────────────────────

async function parseFile(file: File): Promise<FrontendParsedDocument | null> {
  // Try backend parse first
  try {
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch('/api/documents/parse', {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });

    if (res.ok) {
      return await res.json() as FrontendParsedDocument;
    }
  } catch {
    // Backend unavailable — fall through to frontend parsing
  }

  // Frontend fallback: read text content
  const isText =
    file.type.startsWith('text/') ||
    file.name.endsWith('.md') ||
    file.name.endsWith('.txt') ||
    file.name.endsWith('.rtf');

  const fullText = isText ? await file.text() : '';
  const words = fullText.split(/\s+/).filter(Boolean);

  return {
    id: crypto.randomUUID(),
    name: file.name,
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    pageCount: Math.max(1, Math.ceil(words.length / 300)),
    wordCount: words.length,
    fullText,
    sections: [],
    tables: [],
    definedTerms: [],
    parseMethod: 'cowork-frontend',
    parsedAt: new Date().toISOString(),
  };
}
