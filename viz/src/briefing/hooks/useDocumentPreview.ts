/**
 * useDocumentPreview — Browser-side document preview using pdf.js.
 *
 * Provides instant feedback after file upload: page count, word count,
 * detected section headings, and a text preview. For PDFs, uses pdfjs-dist
 * in the browser. For text files, parses directly.
 *
 * This is a lightweight preview — the backend does authoritative parsing.
 */

import { useState, useCallback } from 'react';

export interface DocumentPreview {
  /** Document ID (matches UploadedDocument.id) */
  docId: string;
  pageCount: number;
  wordCount: number;
  /** First ~500 chars of extracted text */
  textPreview: string;
  /** Top-level section headings detected */
  detectedHeadings: string[];
  /** Whether parsing succeeded */
  parsed: boolean;
  /** Error message if parsing failed */
  error?: string;
}

// Section heading patterns (simplified version of backend detector)
const HEADING_PATTERNS = [
  /^(ARTICLE\s+[IVXLC\d]+[\s.:\u2014\u2013-]*\s*.+)$/m,
  /^((?:SECTION|Section)\s+[\d.]+[\s.:\u2014\u2013-]*.*)$/m,
  /^(\d{1,3}(?:\.\d{1,3}){0,2})\.\s+(.+)$/m,
  /^([A-Z][A-Z\s,&\-:]{8,})$/m,
];

function detectHeadings(text: string): string[] {
  const headings: string[] = [];
  const lines = text.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.length > 200) continue;

    for (const pattern of HEADING_PATTERNS) {
      if (pattern.test(trimmed)) {
        headings.push(trimmed);
        break;
      }
    }

    if (headings.length >= 12) break;
  }

  return headings;
}

export function useDocumentPreview() {
  const [previews, setPreviews] = useState<Map<string, DocumentPreview>>(new Map());
  const [loading, setLoading] = useState(false);

  /**
   * Generate a preview for a text-based document (txt, md, rtf, html).
   */
  const previewText = useCallback((docId: string, text: string): DocumentPreview => {
    const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
    const pageCount = Math.max(1, Math.ceil(wordCount / 250));
    const textPreview = text.slice(0, 500);
    const detectedHeadings = detectHeadings(text);

    return {
      docId,
      pageCount,
      wordCount,
      textPreview,
      detectedHeadings,
      parsed: true,
    };
  }, []);

  /**
   * Generate a preview for a PDF using pdfjs-dist.
   * Falls back to basic metadata if pdf.js fails.
   */
  const previewPdf = useCallback(async (docId: string, file: File): Promise<DocumentPreview> => {
    try {
      // Dynamic import to avoid loading pdf.js until needed
      const pdfjsLib = await import('pdfjs-dist');

      // Set worker source (use CDN)
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const pageCount = pdf.numPages;

      // Extract text from first few pages for preview
      let fullText = '';
      const pagesToScan = Math.min(pageCount, 5);
      for (let i = 1; i <= pagesToScan; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item) => ('str' in item ? (item as { str: string }).str : ''))
          .join(' ');
        fullText += pageText + '\n';
      }

      const wordCount = fullText.split(/\s+/).filter(w => w.length > 0).length;
      // Estimate total if we only scanned partial pages
      const estimatedWordCount = pagesToScan < pageCount
        ? Math.round(wordCount * (pageCount / pagesToScan))
        : wordCount;

      return {
        docId,
        pageCount,
        wordCount: estimatedWordCount,
        textPreview: fullText.slice(0, 500),
        detectedHeadings: detectHeadings(fullText),
        parsed: true,
      };
    } catch (err) {
      // Fallback: basic file metadata only
      return {
        docId,
        pageCount: 0,
        wordCount: 0,
        textPreview: '',
        detectedHeadings: [],
        parsed: false,
        error: err instanceof Error ? err.message : 'PDF preview failed',
      };
    }
  }, []);

  /**
   * Generate preview for a document. Dispatches to PDF or text handler.
   */
  const generatePreview = useCallback(async (docId: string, file: File, textContent?: string) => {
    setLoading(true);

    let preview: DocumentPreview;

    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      preview = await previewPdf(docId, file);
    } else if (textContent) {
      preview = previewText(docId, textContent);
    } else {
      // Try reading as text
      try {
        const text = await file.text();
        preview = previewText(docId, text);
      } catch {
        preview = {
          docId,
          pageCount: 0,
          wordCount: 0,
          textPreview: '',
          detectedHeadings: [],
          parsed: false,
          error: 'Could not read file as text',
        };
      }
    }

    setPreviews(prev => {
      const next = new Map(prev);
      next.set(docId, preview);
      return next;
    });

    setLoading(false);
    return preview;
  }, [previewPdf, previewText]);

  const removePreview = useCallback((docId: string) => {
    setPreviews(prev => {
      const next = new Map(prev);
      next.delete(docId);
      return next;
    });
  }, []);

  return {
    previews,
    loading,
    generatePreview,
    removePreview,
    getPreview: (docId: string) => previews.get(docId),
  };
}
