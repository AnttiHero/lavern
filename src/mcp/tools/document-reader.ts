/**
 * Document Reader MCP Tool — Gives agents access to parsed documents.
 *
 * Instead of embedding entire documents in every prompt, agents use these
 * tools to query specific sections, search for text, and inspect structure.
 *
 * Tools:
 *   list_documents       — See what documents are available
 *   read_document_section — Read a specific section by heading or index
 *   search_document      — Full-text search across all documents
 *   get_defined_terms    — List defined terms found in documents
 *   get_document_tables  — Get tables from a specific document
 */

import { z } from 'zod';
import { tool } from '@anthropic-ai/claude-agent-sdk';
import type { SessionState } from '../../session/session-state.js';
import type { DocumentSection } from '../../documents/types.js';

export function createDocumentReaderTools(session: SessionState) {

  // ── list_documents ──────────────────────────────────────────────────

  const listDocuments = tool(
    'list_documents',
    'List all documents available in this session. Returns document names, page counts, word counts, and a table of contents (top-level section headings). Use this first to understand what documents are available before reading specific sections.',
    {},
    async () => {
      if (session.documents.length === 0) {
        return 'No documents have been uploaded for this session.';
      }

      const docs = session.documents.map((doc, i) => {
        const toc = flattenHeadings(doc.sections, 2)
          .map(h => `  ${'  '.repeat(h.level - 1)}${h.heading}`)
          .join('\n');

        const parts = [
          `## Document ${i + 1}: ${doc.name}`,
          `- **Type:** ${doc.mimeType}`,
          `- **Pages:** ${doc.pageCount}`,
          `- **Words:** ${doc.wordCount.toLocaleString()}`,
          `- **Sections:** ${doc.sections.length} top-level`,
          `- **Defined Terms:** ${doc.definedTerms.length}`,
          `- **Tables:** ${doc.tables.length}`,
        ];

        // Surface parse warnings so agents know where extraction is unreliable
        if (doc.parseWarnings && doc.parseWarnings.length > 0) {
          parts.push('');
          parts.push('### ⚠ Parse Warnings');
          parts.push('*The following regions may have unreliable text extraction. Use decline_to_find if you cannot verify data in these areas.*');
          for (const w of doc.parseWarnings) {
            parts.push(`- **${w.type}** (${w.location ?? 'unknown location'}): ${w.message}`);
            if (w.sample) parts.push(`  \`${w.sample.slice(0, 100)}\``);
          }
        }

        parts.push('');
        parts.push('### Table of Contents');
        parts.push(toc || '  (no sections detected)');

        return parts.join('\n');
      });

      return docs.join('\n\n---\n\n');
    },
  );

  // ── read_document_section ──────────────────────────────────────────

  const readDocumentSection = tool(
    'read_document_section',
    'Read a specific section from a document by heading text or section index. Use list_documents first to see available sections. You can also pass "full" to get the complete document text (use sparingly for large documents).',
    {
      document_index: z.number().min(0).describe('Index of the document (0-based, from list_documents)'),
      section: z.string().describe('Section heading to search for (partial match OK), or "full" for entire document text'),
    },
    async ({ document_index, section }) => {
      if (document_index >= session.documents.length) {
        return `Document index ${document_index} is out of range. Only ${session.documents.length} document(s) available.`;
      }

      const doc = session.documents[document_index];

      if (section.toLowerCase() === 'full') {
        // Return full text, truncated for very large documents
        const maxChars = 50_000;
        if (doc.fullText.length > maxChars) {
          return `# ${doc.name} (truncated — ${doc.wordCount.toLocaleString()} words)\n\n${doc.fullText.slice(0, maxChars)}\n\n...[truncated at ${maxChars.toLocaleString()} characters. Use read_document_section with specific section headings for the rest.]`;
        }
        return `# ${doc.name}\n\n${doc.fullText}`;
      }

      // Search for matching section
      const match = findSection(doc.sections, section);
      if (!match) {
        const available = flattenHeadings(doc.sections, 3)
          .map(h => h.heading)
          .join(', ');
        return `No section matching "${section}" found in ${doc.name}. Available sections: ${available}`;
      }

      // Include children content
      const childContent = match.children.length > 0
        ? '\n\n' + match.children.map(c => `### ${c.heading}\n\n${c.content}`).join('\n\n')
        : '';

      return `## ${match.heading}\n\n${match.content}${childContent}`;
    },
  );

  // ── search_document ────────────────────────────────────────────────

  const searchDocument = tool(
    'search_document',
    'Search across all documents for text containing the given query. Returns matching passages with surrounding context. Useful for finding specific clauses, terms, or provisions.',
    {
      query: z.string().min(1).describe('Text to search for (case-insensitive)'),
      max_results: z.number().min(1).max(20).optional().describe('Maximum number of results to return (default: 5)'),
    },
    async ({ query, max_results }) => {
      const maxResults = max_results ?? 5;
      const results: Array<{ docName: string; context: string; section?: string }> = [];
      const queryLower = query.toLowerCase();

      for (const doc of session.documents) {
        // Search in sections first (better context)
        for (const section of flattenSections(doc.sections)) {
          if (section.content.toLowerCase().includes(queryLower)) {
            // Extract a window around the match
            const idx = section.content.toLowerCase().indexOf(queryLower);
            const start = Math.max(0, idx - 150);
            const end = Math.min(section.content.length, idx + query.length + 150);
            const snippet = (start > 0 ? '...' : '') +
              section.content.slice(start, end) +
              (end < section.content.length ? '...' : '');

            results.push({
              docName: doc.name,
              section: section.heading,
              context: snippet,
            });

            if (results.length >= maxResults) break;
          }
        }

        if (results.length >= maxResults) break;

        // Fall back to fullText search if no section matches
        if (results.length === 0 && doc.fullText.toLowerCase().includes(queryLower)) {
          const idx = doc.fullText.toLowerCase().indexOf(queryLower);
          const start = Math.max(0, idx - 200);
          const end = Math.min(doc.fullText.length, idx + query.length + 200);
          const snippet = (start > 0 ? '...' : '') +
            doc.fullText.slice(start, end) +
            (end < doc.fullText.length ? '...' : '');

          results.push({ docName: doc.name, context: snippet });
        }
      }

      if (results.length === 0) {
        return `No matches found for "${query}" across ${session.documents.length} document(s).`;
      }

      return results.map((r, i) => {
        const header = r.section
          ? `**${r.docName}** → ${r.section}`
          : `**${r.docName}**`;
        return `### Result ${i + 1}: ${header}\n\n${r.context}`;
      }).join('\n\n---\n\n');
    },
  );

  // ── get_defined_terms ──────────────────────────────────────────────

  const getDefinedTerms = tool(
    'get_defined_terms',
    'Get all defined terms extracted from session documents. Returns terms found in quotes, bold, or ALLCAPS patterns common in legal documents.',
    {
      document_index: z.number().min(0).optional().describe('Index of a specific document (0-based). Omit to get terms from all documents.'),
    },
    async ({ document_index }) => {
      if (document_index !== undefined) {
        if (document_index >= session.documents.length) {
          return `Document index ${document_index} is out of range.`;
        }
        const doc = session.documents[document_index];
        return `## Defined Terms in ${doc.name}\n\n${doc.definedTerms.join(', ') || 'No defined terms detected.'}`;
      }

      // All documents
      const allTerms = new Set<string>();
      for (const doc of session.documents) {
        for (const term of doc.definedTerms) allTerms.add(term);
      }

      return `## Defined Terms (${allTerms.size} unique across ${session.documents.length} document(s))\n\n${Array.from(allTerms).sort().join(', ') || 'No defined terms detected.'}`;
    },
  );

  // ── get_document_tables ────────────────────────────────────────────

  const getDocumentTables = tool(
    'get_document_tables',
    'Get tables extracted from a document. Returns table data in markdown format.',
    {
      document_index: z.number().min(0).describe('Index of the document (0-based)'),
    },
    async ({ document_index }) => {
      if (document_index >= session.documents.length) {
        return `Document index ${document_index} is out of range.`;
      }

      const doc = session.documents[document_index];
      if (doc.tables.length === 0) {
        return `No tables found in ${doc.name}.`;
      }

      return doc.tables.map((table, i) => {
        const caption = table.caption ? `**${table.caption}**\n\n` : '';
        const header = `| ${table.headers.join(' | ')} |`;
        const separator = `| ${table.headers.map(() => '---').join(' | ')} |`;
        const rows = table.rows.map(row => `| ${row.join(' | ')} |`).join('\n');
        return `### Table ${i + 1}\n\n${caption}${header}\n${separator}\n${rows}`;
      }).join('\n\n');
    },
  );

  return [listDocuments, readDocumentSection, searchDocument, getDefinedTerms, getDocumentTables];
}

// ── Helpers ─────────────────────────────────────────────────────────────

function flattenHeadings(
  sections: DocumentSection[],
  maxDepth: number,
  currentDepth = 1,
): Array<{ heading: string; level: number }> {
  const result: Array<{ heading: string; level: number }> = [];
  for (const s of sections) {
    result.push({ heading: s.heading, level: s.level });
    if (currentDepth < maxDepth && s.children.length > 0) {
      result.push(...flattenHeadings(s.children, maxDepth, currentDepth + 1));
    }
  }
  return result;
}

export function flattenSections(sections: DocumentSection[]): DocumentSection[] {
  const result: DocumentSection[] = [];
  for (const s of sections) {
    result.push(s);
    if (s.children.length > 0) {
      result.push(...flattenSections(s.children));
    }
  }
  return result;
}

function findSection(
  sections: DocumentSection[],
  query: string,
): DocumentSection | null {
  const queryLower = query.toLowerCase();
  for (const s of sections) {
    if (s.heading.toLowerCase().includes(queryLower)) return s;
    const child = findSection(s.children, query);
    if (child) return child;
  }
  return null;
}
