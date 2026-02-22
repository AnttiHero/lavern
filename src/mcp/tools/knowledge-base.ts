/**
 * Knowledge Base MCP Tools — Read-only access to reference document collections.
 *
 * Agents use these tools during analysis to find relevant precedent contracts,
 * standard clauses, firm playbooks, regulatory text, and prior analyses.
 *
 * All tools are read-only. Writing to the knowledge base happens only
 * through the API routes (user uploads via HTTP).
 *
 * Tools:
 *   search_knowledge_base          — FTS5 search across all collections
 *   list_knowledge_base_collections — List available collections with stats
 *   get_knowledge_base_entry       — Retrieve a specific chunk by ID
 */

import { z } from 'zod';
import { tool } from '@anthropic-ai/claude-agent-sdk';
import type { SessionState } from '../../session/session-state.js';
import { searchKnowledgeBase, listCollections, getChunkById } from '../../knowledge-base/retriever.js';

// ── Factory ──────────────────────────────────────────────────────────

export function createKnowledgeBaseTools(session: SessionState) {

  // ── search_knowledge_base ──────────────────────────────────────────

  const searchKb = tool(
    'search_knowledge_base',
    'Search the knowledge base for relevant reference materials — precedent contracts, clause templates, prior analyses, firm playbooks, regulatory text. Returns ranked text chunks with source attribution. Use during intake to find relevant context, or during analysis to compare against known patterns.',
    {
      query: z.string().min(1).max(500)
        .describe('Search query — describe what you are looking for (e.g., "indemnification clause SaaS", "GDPR data processing agreement", "force majeure COVID")'),
      collection_id: z.string().optional()
        .describe('Filter to a specific collection ID. Omit to search all collections.'),
      doc_type: z.string().optional()
        .describe('Filter by document type: precedent, playbook, regulation, prior_analysis, template'),
      jurisdiction: z.string().optional()
        .describe('Filter by jurisdiction: US, EU, UK, CA, AU, etc.'),
      max_results: z.number().min(1).max(20).optional()
        .describe('Maximum number of results (default: 5)'),
    },
    async (args) => {
      if (!session.userId) {
        return {
          content: [{
            type: 'text' as const,
            text: 'Knowledge base requires an authenticated user. No userId set on this session.',
          }],
        };
      }

      const results = searchKnowledgeBase({
        query: args.query,
        userId: session.userId,
        collectionId: args.collection_id,
        docType: args.doc_type,
        jurisdiction: args.jurisdiction,
        maxResults: args.max_results ?? 5,
      });

      if (results.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: `No knowledge base results for "${args.query}". The knowledge base may be empty or the query may not match any indexed content.`,
          }],
        };
      }

      const formatted = results.map((r, i) => [
        `### Result ${i + 1}: ${r.heading || '(untitled section)'}`,
        `**Source**: ${r.document_filename} (${r.collection_name})`,
        `**Type**: ${r.doc_type || 'unspecified'} | **Jurisdiction**: ${r.jurisdiction || 'unspecified'}`,
        `**Chunk ID**: ${r.chunk_id}`,
        '',
        r.content.length > 2000 ? r.content.slice(0, 2000) + '\n\n...[truncated — use get_knowledge_base_entry for full text]' : r.content,
      ].join('\n'));

      return {
        content: [{
          type: 'text' as const,
          text: `## Knowledge Base Results (${results.length} matches for "${args.query}")\n\n${formatted.join('\n\n---\n\n')}`,
        }],
      };
    },
    { annotations: { readOnly: true } },
  );

  // ── list_knowledge_base_collections ────────────────────────────────

  const listKbCollections = tool(
    'list_knowledge_base_collections',
    'List all knowledge base collections available to this user. Shows collection name, document count, and content summary. Use this to understand what reference materials are available before searching.',
    {},
    async () => {
      if (!session.userId) {
        return {
          content: [{
            type: 'text' as const,
            text: 'Knowledge base requires an authenticated user.',
          }],
        };
      }

      const collections = listCollections(session.userId);

      if (collections.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: 'No knowledge base collections found. The user has not uploaded any reference materials yet.',
          }],
        };
      }

      const formatted = collections.map(c => [
        `### ${c.name}`,
        `**ID**: ${c.id}`,
        `**Type**: ${c.docType || 'unspecified'}`,
        `**Documents**: ${c.documentCount} | **Chunks**: ${c.chunkCount} | **Words**: ${c.totalWords.toLocaleString()}`,
        c.description ? `**Description**: ${c.description}` : '',
      ].filter(Boolean).join('\n'));

      return {
        content: [{
          type: 'text' as const,
          text: `## Knowledge Base Collections (${collections.length})\n\n${formatted.join('\n\n---\n\n')}`,
        }],
      };
    },
    { annotations: { readOnly: true } },
  );

  // ── get_knowledge_base_entry ───────────────────────────────────────

  const getKbEntry = tool(
    'get_knowledge_base_entry',
    'Retrieve a specific knowledge base chunk by ID. Use after search_knowledge_base to get the full content of a truncated result.',
    {
      chunk_id: z.string().describe('The chunk ID from a search result'),
    },
    async (args) => {
      if (!session.userId) {
        return {
          content: [{
            type: 'text' as const,
            text: 'Knowledge base requires an authenticated user.',
          }],
        };
      }

      const chunk = getChunkById(args.chunk_id, session.userId);

      if (!chunk) {
        return {
          content: [{
            type: 'text' as const,
            text: `Chunk not found: ${args.chunk_id}`,
          }],
        };
      }

      return {
        content: [{
          type: 'text' as const,
          text: [
            `## ${chunk.heading || '(untitled)'}`,
            `**Source**: ${chunk.document_filename} (${chunk.collection_name})`,
            `**Type**: ${chunk.doc_type || 'unspecified'} | **Jurisdiction**: ${chunk.jurisdiction || 'unspecified'}`,
            '',
            chunk.content,
          ].join('\n'),
        }],
      };
    },
    { annotations: { readOnly: true } },
  );

  return [searchKb, listKbCollections, getKbEntry];
}
