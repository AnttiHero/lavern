/**
 * useDocumentUpload — File drag/drop, FileReader logic, and backend parsing.
 *
 * v12: Enhanced with:
 * - Stores raw File objects for pdf.js preview
 * - Sends files to POST /api/documents/parse for authoritative parsing
 * - Falls back to frontend-only text extraction when backend unavailable
 * - parsedDocuments[] holds structured ParsedDocument results for session creation
 */

import { useState, useCallback, useRef } from 'react';

export interface UploadedDocument {
  id: string;
  name: string;
  size: number;
  type: string;
  content: string;
  uploadedAt: string;
}

/** Lightweight parsed document type (mirrors backend ParsedDocument) */
export interface FrontendParsedDocument {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  pageCount: number;
  wordCount: number;
  fullText: string;
  sections: Array<{
    heading: string;
    level: number;
    content: string;
    startIndex: number;
    children: FrontendParsedDocument['sections'];
  }>;
  tables: Array<{
    caption?: string;
    headers: string[];
    rows: string[][];
  }>;
  definedTerms: string[];
  parseMethod: string;
  parsedAt: string;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export function useDocumentUpload() {
  const [documents, setDocuments] = useState<UploadedDocument[]>([]);
  const [rawFiles, setRawFiles] = useState<Map<string, File>>(new Map());
  const [parsedDocuments, setParsedDocuments] = useState<FrontendParsedDocument[]>([]);
  const [parsing, setParsing] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /**
   * Send a file to the backend for authoritative parsing.
   * Retries up to 3 times with exponential backoff on network failures.
   * Returns the parsed document or null if the backend is unavailable.
   */
  const parseOnBackend = useCallback(async (file: File): Promise<FrontendParsedDocument | null> => {
    const MAX_RETRIES = 3;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
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

        // Backend returned an error — not fatal, we still have frontend content
        console.warn(`[doc-parse] Backend returned ${res.status} for ${file.name}`);
        return null;
      } catch {
        // Network failure — retry with backoff if we have attempts left
        if (attempt < MAX_RETRIES) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 8000);
          console.warn(`[doc-parse] Network error for ${file.name}, retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        // All retries exhausted — fall through
        console.warn(`[doc-parse] All retries exhausted for ${file.name}`);
        return null;
      }
    }
    return null;
  }, []);

  const processFiles = useCallback(async (files: File[]) => {
    setError(null);
    setParsing(true);

    const parsePromises: Promise<void>[] = [];

    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        setError(`${file.name} exceeds 10MB limit`);
        continue;
      }

      const docId = crypto.randomUUID();

      // Store raw File for pdf.js preview
      setRawFiles(prev => {
        const next = new Map(prev);
        next.set(docId, file);
        return next;
      });

      // Read content for the existing UploadedDocument interface
      // Wrap FileReader in a Promise to prevent race conditions where
      // documents are submitted before FileReader finishes reading
      const readPromise = new Promise<void>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          const doc: UploadedDocument = {
            id: docId,
            name: file.name,
            size: file.size,
            type: file.type,
            content: reader.result as string,
            uploadedAt: new Date().toISOString(),
          };
          setDocuments(prev => [...prev, doc]);
          resolve();
        };
        reader.onerror = () => {
          // FileReader failed — store with empty content so the upload still appears
          console.warn(`[doc-upload] FileReader failed for ${file.name}`);
          const doc: UploadedDocument = {
            id: docId,
            name: file.name,
            size: file.size,
            type: file.type,
            content: '',
            uploadedAt: new Date().toISOString(),
          };
          setDocuments(prev => [...prev, doc]);
          resolve();
        };

        if (
          file.type.startsWith('text/') ||
          file.name.endsWith('.md') ||
          file.name.endsWith('.txt') ||
          file.name.endsWith('.rtf')
        ) {
          reader.readAsText(file);
        } else {
          reader.readAsDataURL(file);
        }
      });
      parsePromises.push(readPromise);

      // Also attempt backend parsing (async, non-blocking)
      parsePromises.push(
        parseOnBackend(file).then(parsed => {
          if (parsed) {
            // Override the ID to match our frontend ID
            parsed.id = docId;
            setParsedDocuments(prev => [...prev, parsed]);
          }
        })
      );
    }

    // Wait for all parse attempts before clearing parsing flag
    await Promise.allSettled(parsePromises);
    setParsing(false);
  }, [parseOnBackend]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length > 0) processFiles(files);
    },
    [processFiles],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const openFilePicker = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (files.length > 0) processFiles(files);
      // Reset so the same file can be re-selected
      if (inputRef.current) inputRef.current.value = '';
    },
    [processFiles],
  );

  /** Add a plain-text document (e.g., from a template). */
  const addTextDocument = useCallback((name: string, content: string) => {
    const id = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const doc: UploadedDocument = {
      id,
      name,
      size: new Blob([content]).size,
      type: 'text/markdown',
      content,
      uploadedAt: new Date().toISOString(),
    };
    setDocuments(prev => [...prev, doc]);
    const parsed: FrontendParsedDocument = {
      id,
      name,
      mimeType: 'text/markdown',
      size: doc.size,
      pageCount: 1,
      wordCount: content.split(/\s+/).length,
      fullText: content,
      sections: [],
      tables: [],
      definedTerms: [],
      parseMethod: 'template',
      parsedAt: new Date().toISOString(),
    };
    setParsedDocuments(prev => [...prev, parsed]);
  }, []);

  const removeDocument = useCallback((id: string) => {
    setDocuments(prev => prev.filter(d => d.id !== id));
    setRawFiles(prev => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
    setParsedDocuments(prev => prev.filter(d => d.id !== id));
  }, []);

  return {
    documents,
    rawFiles,
    parsedDocuments,
    parsing,
    isDragOver,
    error,
    inputRef,
    handleDrop,
    handleDragOver,
    handleDragLeave,
    openFilePicker,
    handleFileInput,
    removeDocument,
    addTextDocument,
  };
}
